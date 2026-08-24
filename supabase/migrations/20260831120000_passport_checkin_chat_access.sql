-- A runner who redeemed Passport credits for a specific run gets chat access
-- to that run, same as a klub member would -- they're not a member of the
-- klub, so none of the existing membership/pace-group checks would ever
-- pick them up otherwise.

create or replace function public.can_chat_on_run(p_run_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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

  if exists(
    select 1 from public.passport_checkins pc
    where pc.run_id = p_run_id and pc.user_id = p_user_id
  ) then
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
$function$;
