import { supabase } from './supabase';

type ChatMessage = {
  id: string;
  match_id?: string | null;
  group_id?: string | null;
  round_id?: string | null;
  sender_id: string;
  read_at?: string | null;
};

function isMissingReadReceipts(error: any) {
  const message = String(error?.message ?? '').toLowerCase();
  return message.includes('message_reads') && (message.includes('schema cache') || message.includes('not find') || message.includes('does not exist') || message.includes('not found'));
}

async function getReadReceiptIds(userId: string, messageIds: string[]) {
  if (!messageIds.length) return new Set<string>();
  const { data, error } = await supabase.from('message_reads').select('message_id').eq('user_id', userId).in('message_id', messageIds);
  if (error) {
    if (!isMissingReadReceipts(error)) console.log('Unread receipt lookup error:', error.message);
    return new Set<string>();
  }
  return new Set((data ?? []).map((row: any) => row.message_id));
}

async function countUnreadWithReceipts(userId: string, messages: ChatMessage[]) {
  const candidates = messages.filter((message) => message.sender_id !== userId);
  const readIds = await getReadReceiptIds(userId, candidates.map((message) => message.id));
  return candidates.filter((message) => !readIds.has(message.id)).length;
}

async function markReadWithReceipts(userId: string, messages: ChatMessage[]) {
  const rows = messages
    .filter((message) => message.sender_id !== userId)
    .map((message) => ({ message_id: message.id, user_id: userId, read_at: new Date().toISOString() }));
  if (!rows.length) return { error: null };
  const result = await supabase.from('message_reads').upsert(rows, { onConflict: 'message_id,user_id' });
  if (result.error && isMissingReadReceipts(result.error)) return { error: null };
  return result;
}

export async function markMatchMessagesRead(matchId: string, userId: string) {
  return supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('match_id', matchId)
    .neq('sender_id', userId)
    .is('read_at', null);
}

export async function markGroupMessagesRead(groupId: string, userId: string) {
  const { data, error } = await supabase.from('messages').select('id,group_id,sender_id').eq('group_id', groupId).neq('sender_id', userId).returns<ChatMessage[]>();
  if (error) return { error };
  return markReadWithReceipts(userId, data ?? []);
}

export async function markRoundMessagesRead(roundId: string, userId: string) {
  const { data, error } = await supabase.from('messages').select('id,round_id,sender_id').eq('round_id', roundId).neq('sender_id', userId).returns<ChatMessage[]>();
  if (error) return { error };
  return markReadWithReceipts(userId, data ?? []);
}

export async function getUnreadMessageTotal(userId: string) {
  const { data: matches } = await supabase.from('matches').select('id,golfer_a,golfer_b,status').eq('status', 'matched').or(`golfer_a.eq.${userId},golfer_b.eq.${userId}`);
  const matchIds = (matches ?? []).map((match: any) => match.id);

  const [{ count: directCount }, { data: groupRows }, { data: roundRows }] = await Promise.all([
    matchIds.length
      ? supabase.from('messages').select('id', { count: 'exact', head: true }).in('match_id', matchIds).neq('sender_id', userId).is('read_at', null)
      : { count: 0 },
    supabase.from('group_chat_members').select('group_id').eq('user_id', userId),
    Promise.all([
      supabase.from('rounds').select('id').eq('host_id', userId),
      supabase.from('round_players').select('round_id').eq('player_id', userId).eq('confirmed', true),
    ]),
  ]);

  const groupIds = [...new Set((groupRows ?? []).map((row: any) => row.group_id).filter(Boolean))];
  const hostedRounds = roundRows?.[0]?.data ?? [];
  const playerRounds = roundRows?.[1]?.data ?? [];
  const roundIds = [...new Set([...(hostedRounds as any[]).map((row) => row.id), ...(playerRounds as any[]).map((row) => row.round_id)].filter(Boolean))];

  const [{ data: groupMessages }, { data: roundMessages }] = await Promise.all([
    groupIds.length ? supabase.from('messages').select('id,group_id,sender_id').in('group_id', groupIds).neq('sender_id', userId).returns<ChatMessage[]>() : { data: [] as ChatMessage[] },
    roundIds.length ? supabase.from('messages').select('id,round_id,sender_id').in('round_id', roundIds).neq('sender_id', userId).returns<ChatMessage[]>() : { data: [] as ChatMessage[] },
  ]);

  const groupUnread = await countUnreadWithReceipts(userId, groupMessages ?? []);
  const roundUnread = await countUnreadWithReceipts(userId, roundMessages ?? []);

  return (directCount ?? 0) + groupUnread + roundUnread;
}
