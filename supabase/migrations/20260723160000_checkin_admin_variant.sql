-- Refactor the club/city check-in upsert-and-increment logic into a shared
-- internal function, so both the public (auth.uid()-based) RPC and a new
-- admin-only variant (for server routes that already know the user_id from
-- a verified session, e.g. /api/checkin's Hub run check-in) share one
-- source of truth instead of duplicating the logic.
create or replace function public._checkin_core(p_user_id uuid, p_club_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city_id uuid;
  v_club_city text;
  v_club_first boolean := false;
  v_club_count integer;
  v_city_first boolean := false;
  v_city_count integer;
begin
  select trim(split_part(city, ',', 1)) into v_club_city
  from public.clubs where id = p_club_id;

  if v_club_city is not null then
    select id into v_city_id from public.cities where name = v_club_city;
  end if;

  update public.club_checkins
    set checkin_count = checkin_count + 1
    where user_id = p_user_id and club_id = p_club_id
    returning checkin_count into v_club_count;

  if not found then
    insert into public.club_checkins (user_id, club_id, city_id)
    values (p_user_id, p_club_id, v_city_id)
    returning checkin_count into v_club_count;
    v_club_first := true;
  end if;

  if v_city_id is not null then
    update public.city_checkins
      set checkin_count = checkin_count + 1
      where user_id = p_user_id and city_id = v_city_id
      returning checkin_count into v_city_count;

    if not found then
      insert into public.city_checkins (user_id, city_id)
      values (p_user_id, v_city_id)
      returning checkin_count into v_city_count;
      v_city_first := true;
    end if;
  end if;

  insert into public.checkin_log (user_id, club_id, city_id)
  values (p_user_id, p_club_id, v_city_id);

  return json_build_object(
    'club_first', v_club_first,
    'club_count', v_club_count,
    'city_first', v_city_first,
    'city_count', v_city_count,
    'city_id', v_city_id
  );
end;
$$;

revoke all on function public._checkin_core(uuid, uuid) from public, anon, authenticated;

-- Public-facing entry point for signed-in users checking in from a klub page.
create or replace function public.checkin_to_club(p_club_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  return public._checkin_core(v_user_id, p_club_id);
end;
$$;

grant execute on function public.checkin_to_club(uuid) to authenticated;

-- Server-only entry point: takes an explicit user_id since callers like
-- /api/checkin verify the session token themselves via the service-role
-- client, where auth.uid() is not populated.
create or replace function public.checkin_to_club_admin(p_user_id uuid, p_club_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._checkin_core(p_user_id, p_club_id);
end;
$$;

revoke all on function public.checkin_to_club_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.checkin_to_club_admin(uuid, uuid) to service_role;
