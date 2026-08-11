-- Coach role: a pace-group/branch-scoped assistant coach, invited by a
-- director (the klub owner). Extends the existing `coaches` tagging table
-- (previously director-only: name + optional user_id, used just to label a
-- run's coach) into a real scoped permission — pace_group_ids/region_ids
-- define what a coach can see (roster, check-in, analytics, chat).

alter table public.coaches add column if not exists pace_group_ids uuid[];
alter table public.coaches add column if not exists region_ids uuid[];
alter table public.coaches add column if not exists status text not null default 'active' check (status in ('active', 'revoked'));
alter table public.coaches add column if not exists accepted_at timestamptz;

comment on column public.coaches.pace_group_ids is 'Pace groups this coach can see/manage (roster, check-in, analytics, chat). Null/empty = none assigned yet.';
comment on column public.coaches.region_ids is 'Branches (regions) this coach is scoped to, if the klub has multiple locations. Null/empty = no branch restriction within their pace groups.';

create policy "coaches_select_self" on public.coaches
  for select using (user_id = auth.uid());

create policy "coaches_update_owner" on public.coaches
  for update
  using (exists(select 1 from public.clubs c where c.id = coaches.club_id and c.user_id = auth.uid()))
  with check (exists(select 1 from public.clubs c where c.id = coaches.club_id and c.user_id = auth.uid()));

-- Coach invites — mirrors member_invites, but scoped to pace groups/branches
-- (arrays) instead of a single preferred_region_id, and accepted into
-- `coaches` rather than `subscriptions`/`members`. The coaches row itself is
-- only created on acceptance (see /api/coach-invite-accept), same as how a
-- member_invites row only becomes a subscriptions row once accepted.
create table public.coach_invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  email text not null,
  name text,
  pace_group_ids uuid[],
  region_ids uuid[],
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

alter table public.coach_invites enable row level security;

create policy "director_manage_coach_invites" on public.coach_invites
  for all
  using (exists(select 1 from public.clubs c where c.id = coach_invites.club_id and c.user_id = auth.uid()));

-- Let active coaches see members-only runs for their klub, same gate used
-- for paid members / active club-model members.
create or replace function public.is_club_member(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.clubs c where c.id = p_club_id and c.user_id = p_user_id)
      or exists(select 1 from public.subscriptions s where s.club_id = p_club_id and s.user_id = p_user_id and s.member_type = 'paid')
      or exists(select 1 from public.members m where m.club_id = p_club_id and m.user_id = p_user_id and m.status = 'active')
      or exists(select 1 from public.coaches co where co.club_id = p_club_id and co.user_id = p_user_id and co.status = 'active');
$$;

-- Let active coaches chat on their klub's runs: public runs always, private
-- (pace-group) runs only when the run's derived pace group (and branch, if
-- the run specifies one) is within the coach's scope. Mirrors the same
-- "PaceGroup · Branch" title-parsing already used for member access.
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
  v_coach_pace_group_ids uuid[];
  v_coach_region_ids uuid[];
  v_is_coach boolean := false;
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

  select pace_group_ids, region_ids into v_coach_pace_group_ids, v_coach_region_ids
  from public.coaches
  where club_id = v_run.club_id and user_id = p_user_id and status = 'active'
  limit 1;
  v_is_coach := found;

  if not v_run.members_only then
    if v_is_coach then
      return true;
    end if;
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

  if v_is_coach then
    if exists(
      select 1 from public.pace_groups pg
      where pg.id = any(coalesce(v_coach_pace_group_ids, array[]::uuid[]))
        and pg.name = v_run_pace_group
    ) then
      if v_run_branch is null or v_coach_region_ids is null then
        return true;
      end if;
      if exists(
        select 1 from public.regions rg
        where rg.id = any(v_coach_region_ids) and rg.name = v_run_branch
      ) then
        return true;
      end if;
      return false;
    end if;
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

-- Club-level chat: active coaches get the same access as a director-lite —
-- no pace-group granularity at this level (matches existing subscriber/member behavior).
create or replace function public.can_chat_on_club(p_club_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_is_director boolean;
begin
  select exists(
    select 1 from public.clubs c where c.id = p_club_id and c.user_id = p_user_id
  ) into v_is_director;
  if v_is_director then
    return true;
  end if;

  if exists(
    select 1 from public.coaches co where co.club_id = p_club_id and co.user_id = p_user_id and co.status = 'active'
  ) then
    return true;
  end if;

  return exists(
    select 1 from public.subscriptions s where s.club_id = p_club_id and s.user_id = p_user_id
  ) or exists(
    select 1 from public.members m where m.club_id = p_club_id and m.user_id = p_user_id and m.status = 'active'
  );
end;
$$;
