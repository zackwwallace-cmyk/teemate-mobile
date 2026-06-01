import { supabase } from './supabase';
import type { Profile, Round } from './data';

export type RoundPlayerRequest = {
  round_id: string;
  player_id: string;
  confirmed: boolean;
  joined_at: string;
  profile?: Profile | null;
};

async function addRoundSystemMessage(roundId: string, body: string) {
  const { data: round } = await supabase.from('rounds').select('host_id').eq('id', roundId).maybeSingle<Round>();
  const senderId = round?.host_id;
  if (!senderId) return { data: null, error: null };
  return supabase.from('messages').insert({ round_id: roundId, sender_id: senderId, body });
}

export async function getRoundRequestsForHost(hostId: string) {
  const { data: hostedRounds, error: roundsError } = await supabase.from('rounds').select('id').eq('host_id', hostId);
  if (roundsError) return { data: null, error: roundsError };
  const roundIds = (hostedRounds ?? []).map((round: any) => round.id);
  if (!roundIds.length) return { data: [] as RoundPlayerRequest[], error: null };
  const { data: requests, error } = await supabase.from('round_players').select('round_id,player_id,confirmed,joined_at').in('round_id', roundIds).neq('player_id', hostId).order('joined_at', { ascending: false });
  if (error) return { data: null, error };
  const playerIds = [...new Set((requests ?? []).map((request: any) => request.player_id))];
  const { data: profiles } = playerIds.length ? await supabase.from('profiles').select('*').in('id', playerIds).returns<Profile[]>() : { data: [] as Profile[] };
  const profileMap = new Map<string, Profile>();
  profiles?.forEach((profile) => profileMap.set(profile.id, profile));
  const withProfiles = (requests ?? []).map((request: any) => ({ ...request, profile: profileMap.get(request.player_id) ?? null })) as RoundPlayerRequest[];
  return { data: withProfiles, error: null };
}

export async function getRoundPlayersForUser(userId: string) {
  return supabase.from('round_players').select('round_id,player_id,confirmed,joined_at').eq('player_id', userId).returns<RoundPlayerRequest[]>();
}

export async function getRoundPlayers(roundId: string) {
  const { data, error } = await supabase.from('round_players').select('round_id,player_id,confirmed,joined_at').eq('round_id', roundId).returns<RoundPlayerRequest[]>();
  if (error) return { data: null, error };
  const playerIds = [...new Set((data ?? []).map((request) => request.player_id))];
  const { data: profiles } = playerIds.length ? await supabase.from('profiles').select('*').in('id', playerIds).returns<Profile[]>() : { data: [] as Profile[] };
  const profileMap = new Map<string, Profile>();
  profiles?.forEach((profile) => profileMap.set(profile.id, profile));
  return { data: (data ?? []).map((request) => ({ ...request, profile: profileMap.get(request.player_id) ?? null })) as RoundPlayerRequest[], error: null };
}

export async function approveRoundRequest(roundId: string, playerId: string) {
  const { data: round, error: roundError } = await supabase.from('rounds').select('*').eq('id', roundId).maybeSingle<Round>();
  if (roundError) return { data: null, error: roundError };
  if (!round) return { data: null, error: new Error('Round not found') as any };
  if ((round.open_slots ?? 0) <= 0) return { data: null, error: new Error('There are no open slots left for this round.') as any };
  const { error } = await supabase.from('round_players').update({ confirmed: true }).eq('round_id', roundId).eq('player_id', playerId);
  if (error) return { data: null, error };
  const nextSlots = Math.max(0, (round.open_slots ?? 0) - 1);
  await supabase.from('rounds').update({ open_slots: nextSlots, status: nextSlots === 0 ? 'full' : round.status }).eq('id', roundId);
  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', playerId).maybeSingle<Profile>();
  await addRoundSystemMessage(roundId, `${profile?.display_name || 'A golfer'} joined the round.`);
  return { data: true, error: null };
}

export async function declineRoundPlayer(roundId: string, playerId: string) {
  return supabase.from('round_players').delete().eq('round_id', roundId).eq('player_id', playerId);
}

export async function leaveRound(roundId: string, playerId: string) {
  const { data: row } = await supabase.from('round_players').select('confirmed').eq('round_id', roundId).eq('player_id', playerId).maybeSingle<RoundPlayerRequest>();
  const { error } = await supabase.from('round_players').delete().eq('round_id', roundId).eq('player_id', playerId);
  if (error) return { data: null, error };
  if (row?.confirmed) {
    const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).maybeSingle<Round>();
    if (round) await supabase.from('rounds').update({ open_slots: Math.min(3, (round.open_slots ?? 0) + 1), status: 'proposed' }).eq('id', roundId);
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', playerId).maybeSingle<Profile>();
    await addRoundSystemMessage(roundId, `${profile?.display_name || 'A golfer'} left the round. A spot is open again.`);
  }
  return { data: true, error: null };
}

export async function deleteRoundByHost(roundId: string, hostId: string) {
  const { error } = await supabase.from('rounds').update({ status: 'canceled', is_open_board: false, open_slots: 0 }).eq('id', roundId).eq('host_id', hostId);
  if (error) return { data: null, error };
  await addRoundSystemMessage(roundId, 'This round was canceled by the host. This chat will be removed later.');
  return { data: true, error: null };
}

export async function completeRoundByHost(roundId: string, hostId: string) {
  const { error } = await supabase.from('rounds').update({ status: 'completed', is_open_board: false, open_slots: 0 }).eq('id', roundId).eq('host_id', hostId);
  if (error) return { data: null, error };
  await addRoundSystemMessage(roundId, 'The host marked this round complete. Please finish the round and rate the players.');
  return { data: true, error: null };
}

export async function setRoundPlayerConfirmed(roundId: string, playerId: string, confirmed: boolean) {
  return confirmed ? approveRoundRequest(roundId, playerId) : supabase.from('round_players').update({ confirmed }).eq('round_id', roundId).eq('player_id', playerId);
}
