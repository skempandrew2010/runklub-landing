create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('dm', 'join_request', 'member_subscribed', 'coach_invite_accepted', 'run_reminder', 'newsletter')),
  title text not null,
  body text,
  link text,
  club_id uuid references public.clubs(id) on delete cascade,
  avatar_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Any signed-in user can create a notification for someone else (a DM send, a
-- join request) - same trust level already given to run_chats inserts, which
-- are likewise written client-side and visible to other users unchecked.
create policy "notifications_insert_authenticated" on public.notifications
  for insert to authenticated with check (true);

alter publication supabase_realtime add table public.notifications;
