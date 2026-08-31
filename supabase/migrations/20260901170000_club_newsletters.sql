-- Newsletters were previously a pure fire-and-forget email blast (see
-- app/api/director/send-newsletter/route.ts) with nothing ever saved, so
-- there was no way to link to "the newsletter" from a klub's public page.
-- This gives every send a permanent, publicly-linkable record.

create table if not exists public.club_newsletters (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  subject text not null,
  message text not null,
  sent_count integer,
  sent_at timestamptz not null default now()
);

create index if not exists club_newsletters_club_id_sent_at_idx
  on public.club_newsletters (club_id, sent_at desc);

alter table public.club_newsletters enable row level security;

-- Public archive -- anyone visiting a klub's page can read past newsletters,
-- same visibility as the klub's public runs. Writes only ever happen through
-- send-newsletter's service-role client, so no INSERT policy is needed.
create policy "club_newsletters_select_public" on public.club_newsletters
  for select
  using (true);
