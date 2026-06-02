import { supabase } from './supabase';
import { getUnreadMessageTotal } from './unread';

export type TabBadges = {
  rounds: number;
  connections: number;
};

export async function getTabBadges(userId: string): Promise<TabBadges> {
  const [{ count: connectionCount }, { data: hostedRounds }, unreadMessages] = await Promise.all([
    supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .neq('initiated_by', userId)
      .or(`golfer_a.eq.${userId},golfer_b.eq.${userId}`),
    supabase
      .from('rounds')
      .select('id')
      .eq('host_id', userId),
    getUnreadMessageTotal(userId),
  ]);

  const roundIds = (hostedRounds ?? []).map((round: any) => round.id);
  let rounds = 0;

  if (roundIds.length) {
    const { count } = await supabase
      .from('round_players')
      .select('round_id', { count: 'exact', head: true })
      .in('round_id', roundIds)
      .eq('confirmed', false)
      .neq('player_id', userId);
    rounds = count ?? 0;
  }

  return {
    rounds,
    connections: (connectionCount ?? 0) + unreadMessages,
  };
}
