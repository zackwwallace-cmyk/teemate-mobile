import { supabase } from './supabase';
import type { Profile } from './data';

export const FREE_MONTHLY_PARTNER_REQUEST_LIMIT = 5;

export const TEEMATE_PLUS_PRODUCTS = {
  monthly: {
    id: 'teemates_plus_monthly_999',
    price: '$9.99/month',
    label: 'Monthly',
  },
  yearly: {
    id: 'teemates_plus_yearly_9999',
    price: '$99.99/year',
    label: 'Yearly',
    savings: 'Save about 17%',
  },
};

type PremiumProfile = Pick<Profile, 'founder_badge' | 'founding_member' | 'lifetime_premium'> & {
  subscription_status?: string | null;
  subscription_platform?: string | null;
  subscription_product_id?: string | null;
  subscription_expires_at?: string | null;
};

export function isTeeMatePlus(profile?: PremiumProfile | null) {
  if (!profile) return false;
  if (profile.lifetime_premium || profile.founder_badge || profile.founding_member) return true;
  const status = String(profile.subscription_status ?? '').toLowerCase();
  if (status === 'active' || status === 'trialing') return true;
  if (profile.subscription_expires_at) {
    return new Date(profile.subscription_expires_at).getTime() > Date.now();
  }
  return false;
}

function monthWindow() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function isMissingUsageTable(error: any) {
  const message = String(error?.message ?? '').toLowerCase();
  return message.includes('partner_request_usage') && (message.includes('schema cache') || message.includes('not find') || message.includes('does not exist') || message.includes('not found'));
}

async function countFromUsageTable(userId: string) {
  const { start, end } = monthWindow();
  const result = await supabase
    .from('partner_request_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', start)
    .lt('created_at', end);
  return result;
}

async function fallbackCountFromMatches(userId: string) {
  const { start, end } = monthWindow();
  const result = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('initiated_by', userId)
    .gte('created_at', start)
    .lt('created_at', end)
    .in('status', ['pending', 'matched']);
  return { count: result.count ?? 0, error: result.error };
}

export async function getPartnerRequestUsage(userId: string) {
  const usage = await countFromUsageTable(userId);
  if (usage.error) {
    if (isMissingUsageTable(usage.error)) return fallbackCountFromMatches(userId);
    return { count: 0, error: usage.error };
  }
  return { count: usage.count ?? 0, error: null };
}

export async function recordPartnerRequestUsage(userId: string, requestedUserId: string) {
  const result = await supabase.from('partner_request_usage').insert({ user_id: userId, requested_user_id: requestedUserId });
  if (result.error && isMissingUsageTable(result.error)) return { error: null };
  return result;
}

export async function canSendPartnerRequest(profile: PremiumProfile | null | undefined, userId: string) {
  if (isTeeMatePlus(profile)) {
    return { allowed: true, remaining: null as number | null, used: null as number | null, limit: null as number | null, error: null as any };
  }
  const usage = await getPartnerRequestUsage(userId);
  if (usage.error) return { allowed: false, remaining: 0, used: 0, limit: FREE_MONTHLY_PARTNER_REQUEST_LIMIT, error: usage.error };
  const used = usage.count ?? 0;
  const remaining = Math.max(0, FREE_MONTHLY_PARTNER_REQUEST_LIMIT - used);
  return { allowed: used < FREE_MONTHLY_PARTNER_REQUEST_LIMIT, remaining, used, limit: FREE_MONTHLY_PARTNER_REQUEST_LIMIT, error: null as any };
}

export function requestLimitError() {
  return {
    code: 'TEE_PLUS_REQUEST_LIMIT',
    message: `Free members get ${FREE_MONTHLY_PARTNER_REQUEST_LIMIT} partner requests per month. Upgrade to TeeMate+ for unlimited requests, advanced filters, boosts, and more.`,
  } as any;
}
