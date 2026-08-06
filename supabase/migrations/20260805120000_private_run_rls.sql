-- Enforces run privacy at the database level. Until now `runs` had no RLS
-- at all — a members_only run's full row (title, location, coords,
-- description) was readable by anyone querying Supabase directly with the
-- anon key, regardless of membership; "members only" was purely a
-- client-side UI hide. This closes that gap:
--   - Public runs (members_only is not true): readable by anyone, as today.
--   - Members-only runs: readable only by the klub's owner or an approved
--     member (paid subscriber, or active club-model roster member).
--   - Writes (insert/update/delete): only the klub's owner. Verified against
--     every current write path (create-run, edit-run, director quick-create/
--     delete/save, RunFormPanel, WorkoutsTab) — all of them already mutate
--     runs as the literal club owner's own session, so this changes no
--     legitimate behavior, only closes the same gap for writes.

-- Deliberately leaner than can_chat_on_run/can_chat_on_club (which both
-- query runs) — a policy ON runs calling a function that also queries runs
-- would recurse into its own RLS check.
create or replace function public.is_club_member(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.clubs c where c.id = p_club_id and c.user_id = p_user_id)
      or exists(select 1 from public.subscriptions s where s.club_id = p_club_id and s.user_id = p_user_id and s.member_type = 'paid')
      or exists(select 1 from public.members m where m.club_id = p_club_id and m.user_id = p_user_id and m.status = 'active');
$$;

revoke all on function public.is_club_member(uuid, uuid) from public, anon;
grant execute on function public.is_club_member(uuid, uuid) to authenticated, anon;

alter table public.runs enable row level security;

create policy "runs_select_public" on public.runs
  for select
  using (members_only is not true);

create policy "runs_select_members_only" on public.runs
  for select
  using (members_only is true and public.is_club_member(club_id, auth.uid()));

create policy "runs_write_owner" on public.runs
  for all
  using (exists(select 1 from public.clubs c where c.id = runs.club_id and c.user_id = auth.uid()))
  with check (exists(select 1 from public.clubs c where c.id = runs.club_id and c.user_id = auth.uid()));
