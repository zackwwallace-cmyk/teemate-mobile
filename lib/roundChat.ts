import { supabase } from './supabase';
import { sendPushNotification } from './notifications';
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

async function getRoundPushRecipientIds(roundId: string, senderId: string) {
  const [{ data: round }, { data: players }] = await Promise.all([
    getRoundById(roundId),
    supabase.from('round_players').select('player_id').eq('round_id', roundId).eq('confirmed', true),
  ]);
  return [...new Set([round?.host_id, ...((players ?? []) as any[]).map((row) => row.player_id)].filter((id): id is string => Boolean(id) && id !== senderId))];
}

export async function sendRoundMessage(roundId: string, userId: string, body: string) {
  const result = await supabase
    .from('messages')
    .insert({ round_id: roundId, sender_id: userId, body })
    .select('*')
    .single();

  if (!result.error) {
    try {
      const recipientIds = await getRoundPushRecipientIds(roundId, userId);
      if (recipientIds.length) {
        await sendPushNotification({
          recipientIds,
          actorId: userId,
          title: 'New TeeMate round chat message',
          body: body.length > 120 ? `${body.slice(0, 117)}...` : body,
          type: 'round_update',
          data: { roundId, route: `/round-chat/${roundId}` },
        });
      }
    } catch (error: any) {
      console.log('Round chat push error:', error?.message ?? error);
    }
  }

  return result;
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
