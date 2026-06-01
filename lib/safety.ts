import { supabase } from './supabase';

export async function blockGolfer(blockerId: string, blockedId: string) {
  return supabase.from('blocked_users').upsert({ blocker_id: blockerId, blocked_id: blockedId });
}

export async function unblockGolfer(blockerId: string, blockedId: string) {
  return supabase.from('blocked_users').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
}

export async function isGolferBlocked(blockerId: string, blockedId: string) {
  const { data, error } = await supabase.from('blocked_users').select('blocked_id').eq('blocker_id', blockerId).eq('blocked_id', blockedId).maybeSingle();
  if (error) return { data: false, error };
  return { data: Boolean(data), error: null };
}

export async function reportGolfer(reporterId: string, reportedId: string, reason: string) {
  const reportInsert = await supabase.from('reports').insert({ reporter_id: reporterId, reported_id: reportedId, reason });
  const ticketInsert = await supabase.from('support_tickets').insert({
    user_id: reporterId,
    subject: 'User report',
    category: 'safety',
    message: `Reported user: ${reportedId}\n\nReason: ${reason}`,
  });

  if (reportInsert.error) return reportInsert;
  if (ticketInsert.error) return ticketInsert;
  return { data: true, error: null };
}
