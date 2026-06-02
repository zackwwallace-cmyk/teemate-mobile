-- TeeMate message read receipts for group and round chats.
-- Direct one-to-one chats can continue using messages.read_at.

create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_reads enable row level security;

drop policy if exists "Users can view their own message reads" on public.message_reads;
create policy "Users can view their own message reads"
  on public.message_reads
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own message reads" on public.message_reads;
create policy "Users can insert their own message reads"
  on public.message_reads
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own message reads" on public.message_reads;
create policy "Users can update their own message reads"
  on public.message_reads
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists message_reads_user_id_idx on public.message_reads(user_id);
create index if not exists message_reads_message_id_idx on public.message_reads(message_id);
