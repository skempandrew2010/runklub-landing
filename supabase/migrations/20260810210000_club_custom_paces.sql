create table if not exists public.club_custom_paces (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  unique (club_id, label)
);

comment on table public.club_custom_paces is 'Director-defined pace labels (e.g. a specific numeric pace) available alongside the built-in pace list when building a workout segment.';

alter table public.club_custom_paces enable row level security;

create policy "club_custom_paces_select_public" on public.club_custom_paces
  for select using (true);

create policy "club_custom_paces_insert_owner" on public.club_custom_paces
  for insert
  with check (exists(select 1 from public.clubs c where c.id = club_custom_paces.club_id and c.user_id = auth.uid()));

create policy "club_custom_paces_delete_owner" on public.club_custom_paces
  for delete
  using (exists(select 1 from public.clubs c where c.id = club_custom_paces.club_id and c.user_id = auth.uid()));
