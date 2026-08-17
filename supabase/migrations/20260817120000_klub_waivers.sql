-- Lets a director attach a link to their klub's own waiver (Google Form,
-- DocuSign, etc.) — RunKlub never collects or stores the actual signature,
-- only a one-time "I've read and signed it" acknowledgment per member per
-- klub, shown once before their first self-service check-in with that klub.

alter table public.clubs
  add column if not exists waiver_url text;

create table if not exists public.waiver_acknowledgments (
  user_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

alter table public.waiver_acknowledgments enable row level security;

create policy "waiver_acknowledgments_select_own" on public.waiver_acknowledgments
  for select
  using (user_id = auth.uid());

create policy "waiver_acknowledgments_insert_own" on public.waiver_acknowledgments
  for insert
  with check (user_id = auth.uid());
