create table if not exists public.club_weekly_schedule (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  workout_type_id uuid references public.runs(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, day_of_week)
);

comment on table public.club_weekly_schedule is 'Standing weekly training-plan template: one workout slot per club per day of week (0=Sun..6=Sat). Directors edit it from the Runs tab.';

alter table public.club_weekly_schedule enable row level security;

create policy "club_weekly_schedule_select_public" on public.club_weekly_schedule
  for select using (true);

create policy "club_weekly_schedule_insert_owner" on public.club_weekly_schedule
  for insert
  with check (exists(select 1 from public.clubs c where c.id = club_weekly_schedule.club_id and c.user_id = auth.uid()));

create policy "club_weekly_schedule_update_owner" on public.club_weekly_schedule
  for update
  using (exists(select 1 from public.clubs c where c.id = club_weekly_schedule.club_id and c.user_id = auth.uid()))
  with check (exists(select 1 from public.clubs c where c.id = club_weekly_schedule.club_id and c.user_id = auth.uid()));

create policy "club_weekly_schedule_delete_owner" on public.club_weekly_schedule
  for delete
  using (exists(select 1 from public.clubs c where c.id = club_weekly_schedule.club_id and c.user_id = auth.uid()));
