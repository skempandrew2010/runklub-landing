create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  going boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, user_id)
);

comment on table public.rsvps is 'Real production RSVPs, keyed to runs.id/auth.users.id - distinct from the unrelated legacy run_rsvps table used only by the admin club-model prototype (keyed to scheduled_workout_id/member_id).';

alter table public.rsvps enable row level security;

create policy "rsvps_select_public" on public.rsvps
  for select using (true);

create policy "rsvps_upsert_own" on public.rsvps
  for insert
  with check (user_id = auth.uid());

create policy "rsvps_update_own" on public.rsvps
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "rsvps_delete_own" on public.rsvps
  for delete
  using (user_id = auth.uid());
