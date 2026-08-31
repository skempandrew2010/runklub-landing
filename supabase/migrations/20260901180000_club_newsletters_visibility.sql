-- Lets a director choose whether each newsletter is public (anyone can read
-- it in the archive) or members-only (same visibility rule as private runs --
-- reuses is_club_member from 20260805120000_private_run_rls.sql).

alter table public.club_newsletters
  add column is_public boolean not null default true;

drop policy if exists "club_newsletters_select_public" on public.club_newsletters;

create policy "club_newsletters_select_public" on public.club_newsletters
  for select
  using (is_public = true);

create policy "club_newsletters_select_members" on public.club_newsletters
  for select
  using (is_public = false and public.is_club_member(club_id, auth.uid()));

create policy "club_newsletters_select_owner" on public.club_newsletters
  for select
  using (exists(select 1 from public.clubs c where c.id = club_newsletters.club_id and c.user_id = auth.uid()));
