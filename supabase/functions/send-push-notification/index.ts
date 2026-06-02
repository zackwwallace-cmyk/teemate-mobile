import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Payload = {
  recipientIds?: string[];
  actorId?: string;
  title?: string;
  body?: string;
  type?: string;
  data?: Record<string, unknown>;
};

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) output.push(items.slice(i, i + size));
  return output;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server environment variables.');

    const input = (await req.json()) as Payload;
    const recipientIds = [...new Set((input.recipientIds ?? []).filter(Boolean))].filter((id) => id !== input.actorId);
    if (!recipientIds.length) return new Response(JSON.stringify({ sent: 0, reason: 'No recipients' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const title = String(input.title ?? 'TeeMate');
    const body = String(input.body ?? 'You have a new TeeMate update.');
    const type = String(input.type ?? 'update');

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: tokenRows, error } = await supabase
      .from('user_push_tokens')
      .select('user_id,expo_push_token')
      .in('user_id', recipientIds);
    if (error) throw error;

    const tokens = [...new Set((tokenRows ?? []).map((row: any) => row.expo_push_token).filter((token: string) => token?.startsWith('ExponentPushToken[') || token?.startsWith('ExpoPushToken[')))];
    if (!tokens.length) return new Response(JSON.stringify({ sent: 0, reason: 'No push tokens' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data: { ...(input.data ?? {}), type },
      priority: 'high',
    }));

    const responses = [];
    for (const batch of chunk(messages, 100)) {
      const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      const json = await expoResponse.json();
      responses.push(json);
    }

    return new Response(JSON.stringify({ sent: messages.length, responses }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message ?? error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
