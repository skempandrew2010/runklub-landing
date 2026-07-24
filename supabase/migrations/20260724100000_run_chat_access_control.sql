-- Restricts run chat access: previously ANY authenticated user could read
-- and post in ANY run's chat, including private (members_only) runs scoped
-- to a specific pace group/branch. Now:
--   - Klub directors/owners always have full access to their own klub's run chats.
--   - Community (public) runs: any subscriber of the klub (community or paid) can chat.
--   - Private (members_only) runs: only active members whose pace group (and
--     branch/region, if the run specifies one) matches the run can chat —
--     mirroring the "PaceGroup · Branch" title convention already used to
--     build each member's training schedule (see app/today/page.tsx splitTitle()).

create or replace function public.can_chat_on_run(p_run_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_run record;
  v_is_director boolean;
  v_member record;
  v_pace_group_name text;
  v_region_name text;
  v_run_pace_group text;
  v_run_branch text;
  v_delim_pos int;
begin
  select r.id, r.club_id, r.members_only, r.title
  into v_run
  from public.runs r
  where r.id = p_run_id;

  if v_run.id is null then
    return false;
  end if;

  select exists(
    select 1 from public.clubs c where c.id = v_run.club_id and c.user_id = p_user_id
  ) into v_is_director;
  if v_is_director then
    return true;
  end if;

  if not v_run.members_only then
    -- "Community member" covers either of this app's two membership paths:
    -- a follow/subscription, or a formal (pace-group) club-model membership.
    return exists(
      select 1 from public.subscriptions s
      where s.club_id = v_run.club_id and s.user_id = p_user_id
    ) or exists(
      select 1 from public.members m
      where m.club_id = v_run.club_id and m.user_id = p_user_id and m.status = 'active'
    );
  end if;

  v_delim_pos := position(' · ' in v_run.title);
  if v_delim_pos > 0 then
    v_run_pace_group := substring(v_run.title from 1 for v_delim_pos - 1);
    v_run_branch := substring(v_run.title from v_delim_pos + 3);
  else
    v_run_pace_group := v_run.title;
    v_run_branch := null;
  end if;

  select m.pace_group_id, m.preferred_region_id
  into v_member
  from public.members m
  where m.club_id = v_run.club_id and m.user_id = p_user_id and m.status = 'active'
  limit 1;

  if v_member.pace_group_id is null then
    return false;
  end if;

  select name into v_pace_group_name from public.pace_groups where id = v_member.pace_group_id;
  if v_pace_group_name is distinct from v_run_pace_group then
    return false;
  end if;

  if v_run_branch is not null then
    if v_member.preferred_region_id is null then
      return false;
    end if;
    select name into v_region_name from public.regions where id = v_member.preferred_region_id;
    if v_region_name is distinct from v_run_branch then
      return false;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.can_chat_on_run(uuid, uuid) from public, anon;
grant execute on function public.can_chat_on_run(uuid, uuid) to authenticated;

-- Batched lookup so clients can filter a runs list in one round trip instead
-- of calling can_chat_on_run per row. Always scoped to the caller (no
-- user_id param) so it can't be used to probe another user's eligibility.
create or replace function public.my_chattable_run_ids()
returns table(run_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select r.id as run_id
  from public.runs r
  where auth.uid() is not null and public.can_chat_on_run(r.id, auth.uid());
$$;

revoke all on function public.my_chattable_run_ids() from public, anon;
grant execute on function public.my_chattable_run_ids() to authenticated;

drop policy if exists "authenticated users can read chats" on public.run_chats;
drop policy if exists "users can insert own chats" on public.run_chats;

create policy "eligible users can read run chats"
  on public.run_chats for select
  to authenticated
  using (public.can_chat_on_run(run_id, auth.uid()));

create policy "eligible users can insert run chats"
  on public.run_chats for insert
  to authenticated
  with check (auth.uid() = user_id and public.can_chat_on_run(run_id, auth.uid()));
