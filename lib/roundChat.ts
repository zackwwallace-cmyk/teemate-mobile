import { supabase } from './supabase';
import type { Message, Round } from './data';

export async function getRoundById(roundId: string) {
  return supabase.from('rounds').select('*').eq('id', roundId).maybeSingle<Round>();
}

export async function getRoundMessages(roundId: string) {
  return supabase
    .from('messages')
    .select('*')
    .eq('round_id', roundId)
    .order('created_at', { ascending: true })
    .returns<Message[]>();
}

export async function sendRoundMessage(roundId: string, userId: string, body: string) {
  return supabase
    .from('messages')
    .insert({ round_id: roundId, sender_id: userId, body })
    .select('*')
    .single();
}

export async function canUserAccessRoundChat(roundId: string, userId: string) {
  const { data: round, error: roundError } = await getRoundById(roundId);
  if (roundError) return { data: false, error: roundError };
  if (round?.host_id === userId) return { data: true, error: null };

  const { data: player, error } = await supabase
    .from('round_players')
    .select('round_id,player_id,confirmed')
    .eq('round_id', roundId)
    .eq('player_id', userId)
    .eq('confirmed', true)
    .maybeSingle();

  if (error) return { data: false, error };
  return { data: Boolean(player), error: null };
}
