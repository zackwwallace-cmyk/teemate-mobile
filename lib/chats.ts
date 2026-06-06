import { createOrUpdateMatch, getMyMatches, getProfilesByIds, type Match, type Message, type Profile, type Round } from './data';
import { supabase } from './supabase';

export type RegularChatThread = { id: string; match: Match; otherProfile: Profile | null; lastMessage: Message | null; updatedAt: string };
export type RoundChatThread = { id: string; round: Round; participantProfiles: Profile[]; lastMessage: Message | null; updatedAt: string };
export type CustomGroupThread = { id: string; title: string; created_by: string; participantProfiles: Profile[]; lastMessage: Message | null; updatedAt: string };
export type ConnectionRequestThread = { id: string; match: Match; otherProfile: Profile | null; direction: 'received' | 'sent'; updatedAt: string };

type ChatMessage = Message & { group_id?: string | null };
const PUBLIC_PROFILE_COLUMNS = 'id,display_name,age,gender,avatar_url,bio,handicap_index,home_area,approx_lat,approx_lng,skill,pace,travel,holes_pref,looking_for,founder_badge,founding_member,lifetime_premium,verified_plus,onboarding_complete,rounds_played,rounds_completed,avg_rating';
const PARTNER_VISIBLE_STATUSES = new Set(['matched']);

function isMissingGroupTables(error: any) {
  const message = String(error?.message ?? '').toLowerCase();
  return message.includes('group_chat') && (message.includes('schema cache') || message.includes('not find') || message.includes('does not exist') || message.includes('not found'));
}

function groupTableError() {
  return { message: 'Group chat tables are not set up yet. Run supabase/group-chat-mobile.sql in Supabase SQL Editor, then refresh the app.' } as any;
}

function latestMessageMap(messages: ChatMessage[] | null | undefined, key: 'match_id' | 'round_id' | 'group_id') {
  const map = new Map<string, ChatMessage>();
  for (const message of messages ?? []) {
    const id = message[key];
    if (!id) continue;
    const current = map.get(id);
    if (!current || new Date(message.created_at).getTime() > new Date(current.created_at).getTime()) map.set(id, message);
  }
  return map;
}

function isPartnerVisibleMatch(match: Match) {
  return PARTNER_VISIBLE_STATUSES.has(String(match.status ?? '').toLowerCase());
}

async function getBlockedPairIds(userId: string) {
  const { data } = await supabase
    .from('blocked_users')
    .select('blocker_id,blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  const blocked = new Set<string>();
  for (const row of (data ?? []) as any[]) {
    if (row.blocker_id === userId && row.blocked_id) blocked.add(row.blocked_id);
    if (row.blocked_id === userId && row.blocker_id) blocked.add(row.blocker_id);
  }
  return blocked;
}

export async function getRegularChatThreads(userId: string) {
  const { data: matches, error } = await getMyMatches(userId);
  if (error) return { data: [] as RegularChatThread[], error };
  const blockedIds = await getBlockedPairIds(userId);
  const connected = (matches ?? []).filter((match) => {
    if (!isPartnerVisibleMatch(match)) return false;
    const otherId = match.golfer_a === userId ? match.golfer_b : match.golfer_a;
    return !blockedIds.has(otherId);
  });
  const matchIds = connected.map((match) => match.id);
  const otherIds = [...new Set(connected.map((match) => (match.golfer_a === userId ? match.golfer_b : match.golfer_a)))];
  const [{ data: profiles }, { data: messages, error: messageError }] = await Promise.all([
    getProfilesByIds(otherIds),
    matchIds.length ? supabase.from('messages').select('*').in('match_id', matchIds).order('created_at', { ascending: false }).returns<ChatMessage[]>() : { data: [] as ChatMessage[], error: null },
  ]);
  if (messageError) return { data: [] as RegularChatThread[], error: messageError };
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const messageMap = latestMessageMap(messages, 'match_id');
  const threads = connected.map((match) => {
    const otherId = match.golfer_a === userId ? match.golfer_b : match.golfer_a;
    const lastMessage = messageMap.get(match.id) ?? null;
    return { id: match.id, match, otherProfile: profileMap.get(otherId) ?? null, lastMessage, updatedAt: lastMessage?.created_at ?? match.updated_at ?? match.created_at };
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { data: threads, error: null };
}

export async function getConnectionRequestThreads(userId: string) {
  const { data: matches, error } = await getMyMatches(userId);
  if (error) return { data: { received: [] as ConnectionRequestThread[], sent: [] as ConnectionRequestThread[] }, error };
  const blockedIds = await getBlockedPairIds(userId);
  const pending = (matches ?? []).filter((match) => {
    if (match.status !== 'pending') return false;
    const otherId = match.golfer_a === userId ? match.golfer_b : match.golfer_a;
    return !blockedIds.has(otherId);
  });
  const otherIds = [...new Set(pending.map((match) => (match.golfer_a === userId ? match.golfer_b : match.golfer_a)))];
  const { data: profiles } = await getProfilesByIds(otherIds);
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const rows = pending.map((match) => {
    const otherId = match.golfer_a === userId ? match.golfer_b : match.golfer_a;
    const direction: 'received' | 'sent' = match.initiated_by === userId ? 'sent' : 'received';
    return { id: match.id, match, otherProfile: profileMap.get(otherId) ?? null, direction, updatedAt: match.updated_at ?? match.created_at };
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { data: { received: rows.filter((row) => row.direction === 'received'), sent: rows.filter((row) => row.direction === 'sent') }, error: null };
}

export async function getRoundChatThreads(userId: string) {
  const [{ data: hosted, error: hostedError }, { data: playerRows, error: playerError }] = await Promise.all([
    supabase.from('rounds').select('*').eq('host_id', userId).returns<Round[]>(),
    supabase.from('round_players').select('round_id').eq('player_id', userId).eq('confirmed', true),
  ]);
  if (hostedError) return { data: [] as RoundChatThread[], error: hostedError };
  if (playerError) return { data: [] as RoundChatThread[], error: playerError };
  const roundIds = [...new Set([...(hosted ?? []).map((round) => round.id), ...((playerRows ?? []) as any[]).map((row) => row.round_id)])];
  if (!roundIds.length) return { data: [] as RoundChatThread[], error: null };
  const [{ data: rounds, error: roundError }, { data: messages, error: messageError }, { data: allPlayers }] = await Promise.all([
    supabase.from('rounds').select('*').in('id', roundIds).returns<Round[]>(),
    supabase.from('messages').select('*').in('round_id', roundIds).order('created_at', { ascending: false }).returns<ChatMessage[]>(),
    supabase.from('round_players').select('round_id,player_id').in('round_id', roundIds).eq('confirmed', true),
  ]);
  if (roundError) return { data: [] as RoundChatThread[], error: roundError };
  if (messageError) return { data: [] as RoundChatThread[], error: messageError };
  const participantIdsByRound = new Map<string, string[]>();
  for (const round of rounds ?? []) participantIdsByRound.set(round.id, [round.host_id]);
  for (const row of (allPlayers ?? []) as any[]) {
    const ids = participantIdsByRound.get(row.round_id) ?? [];
    if (row.player_id && !ids.includes(row.player_id)) ids.push(row.player_id);
    participantIdsByRound.set(row.round_id, ids);
  }
  const allParticipantIds = [...new Set([...participantIdsByRound.values()].flat())];
  const { data: participantProfiles } = await getProfilesByIds(allParticipantIds);
  const profileMap = new Map((participantProfiles ?? []).map((profile) => [profile.id, profile]));
  const messageMap = latestMessageMap(messages, 'round_id');
  const threads = (rounds ?? []).map((round) => {
    const lastMessage = messageMap.get(round.id) ?? null;
    const participantProfiles = (participantIdsByRound.get(round.id) ?? []).map((id) => profileMap.get(id)).filter(Boolean) as Profile[];
    return { id: round.id, round, participantProfiles, lastMessage, updatedAt: lastMessage?.created_at ?? round.tee_time };
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { data: threads, error: null };
}

export async function getCustomGroupThreads(userId: string) {
  const { data: memberRows, error: memberError } = await supabase.from('group_chat_members').select('group_id').eq('user_id', userId);
  if (memberError) {
    if (isMissingGroupTables(memberError)) return { data: [] as CustomGroupThread[], error: groupTableError() };
    return { data: [] as CustomGroupThread[], error: memberError };
  }
  const groupIds = [...new Set((memberRows ?? []).map((row: any) => row.group_id))];
  if (!groupIds.length) return { data: [] as CustomGroupThread[], error: null };
  const [{ data: groups, error: groupError }, { data: messages, error: messageError }, { data: allMembers, error: allMembersError }] = await Promise.all([
    supabase.from('group_chats').select('*').in('id', groupIds),
    supabase.from('messages').select('*').in('group_id', groupIds).order('created_at', { ascending: false }).returns<ChatMessage[]>(),
    supabase.from('group_chat_members').select('group_id,user_id').in('group_id', groupIds),
  ]);
  const anyError = groupError || messageError || allMembersError;
  if (anyError) {
    if (isMissingGroupTables(anyError)) return { data: [] as CustomGroupThread[], error: groupTableError() };
    return { data: [] as CustomGroupThread[], error: anyError };
  }
  const idsByGroup = new Map<string, string[]>();
  for (const row of (allMembers ?? []) as any[]) {
    const ids = idsByGroup.get(row.group_id) ?? [];
    if (row.user_id && !ids.includes(row.user_id)) ids.push(row.user_id);
    idsByGroup.set(row.group_id, ids);
  }
  const allIds = [...new Set([...idsByGroup.values()].flat())];
  const { data: profiles } = await getProfilesByIds(allIds);
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const messageMap = latestMessageMap(messages, 'group_id');
  const threads = (groups ?? []).map((group: any) => {
    const lastMessage = messageMap.get(group.id) ?? null;
    const participantProfiles = (idsByGroup.get(group.id) ?? []).map((id) => profileMap.get(id)).filter(Boolean) as Profile[];
    return { id: group.id, title: group.title || 'Group chat', created_by: group.created_by, participantProfiles, lastMessage, updatedAt: lastMessage?.created_at ?? group.updated_at ?? group.created_at };
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { data: threads, error: null };
}

export async function getConnectedProfiles(userId: string) {
  const { data: matches, error } = await getMyMatches(userId);
  if (error) return { data: [] as Profile[], error };
  const blockedIds = await getBlockedPairIds(userId);
  const ids = [...new Set((matches ?? []).filter((match) => {
    if (!isPartnerVisibleMatch(match)) return false;
    const otherId = match.golfer_a === userId ? match.golfer_b : match.golfer_a;
    return !blockedIds.has(otherId);
  }).map((match) => match.golfer_a === userId ? match.golfer_b : match.golfer_a))];
  return getProfilesByIds(ids);
}

export async function getGroupCandidates(userId: string) {
  const { data: connected, error: connectedError } = await getConnectedProfiles(userId);
  if (connectedError) return { data: [] as Profile[], connectedIds: new Set<string>(), error: connectedError };
  const connectedIds = new Set((connected ?? []).map((profile) => profile.id));
  const { data: allProfiles, error } = await supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('onboarding_complete', true).limit(200).returns<Profile[]>();
  if (error) return { data: [] as Profile[], connectedIds, error };
  return { data: (allProfiles ?? []).filter((profile) => profile.id !== userId), connectedIds, error: null };
}

export async function createCustomGroupChat(userId: string, title: string, memberIds: string[], requestConnectionIds: string[] = []) {
  const uniqueMembers = [...new Set(memberIds.filter((id) => id !== userId))];
  if (!uniqueMembers.length) return { data: null, error: { message: 'Select at least one golfer.' } as any };
  const { data: connectedProfiles } = await getConnectedProfiles(userId);
  const connectedIds = new Set((connectedProfiles ?? []).map((profile) => profile.id));
  if (!uniqueMembers.some((id) => connectedIds.has(id))) return { data: null, error: { message: 'You must have at least one matched golfer in the group.' } as any };
  const { data: group, error } = await supabase.from('group_chats').insert({ title: title.trim() || 'Group chat', created_by: userId }).select('*').single();
  if (error || !group) return { data: null, error: isMissingGroupTables(error) ? groupTableError() : error };
  const memberRows = [userId, ...uniqueMembers].map((memberId) => ({ group_id: group.id, user_id: memberId }));
  const memberInsert = await supabase.from('group_chat_members').insert(memberRows);
  if (memberInsert.error) return { data: null, error: isMissingGroupTables(memberInsert.error) ? groupTableError() : memberInsert.error };
  if (requestConnectionIds.length) await Promise.all(requestConnectionIds.map((id) => createOrUpdateMatch(userId, id, 'pending')));
  return { data: { group }, error: null };
}

export async function leaveGroupChat(groupId: string, userId: string) {
  return supabase.from('group_chat_members').delete().eq('group_id', groupId).eq('user_id', userId);
}

export async function unmatchUser(matchId: string) {
  return supabase.from('matches').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', matchId);
}
