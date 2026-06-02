-- TeeMate push notification setup
-- Run this in Supabase SQL Editor before testing push notifications.

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists user_push_tokens_user_token_unique
on public.user_push_tokens(user_id, expo_push_token);

create index if not exists user_push_tokens_user_id_idx
on public.user_push_tokens(user_id);

alter table public.user_push_tokens enable row level security;

drop policy if exists "Users can manage their own push tokens" on public.user_push_tokens;
create policy "Users can manage their own push tokens"
on public.user_push_tokens
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- The send-push-notification Edge Function should use the service role key
-- so it can read tokens for recipient users securely server-side.
