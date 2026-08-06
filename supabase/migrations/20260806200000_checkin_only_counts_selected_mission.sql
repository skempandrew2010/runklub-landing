-- evaluate_checkin_challenges() looped over every active streak/discovery/
-- milestone challenge on every check-in, so one check-in silently advanced
-- every mission's progress at once instead of only the one the member
-- picked in the check-in modal ("Which mission should this count toward?").
-- Restrict the loop to the single challenge in run_checkins.selected_challenge_id
-- — a check-in with no selection (e.g. a manual coach check-in) now advances
-- no mission, matching the "pick one" UI contract.
create or replace function public.evaluate_checkin_challenges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := new.user_id;
  v_club_id uuid := new.club_id;
  v_checked_in_at timestamptz := new.checked_in_at;
  v_this_week_start date := (date_trunc('week', v_checked_in_at at time zone 'utc'))::date;

  v_total_checkins int;
  v_distinct_clubs int;
  v_morning_count int;
  v_prev_checked_in_at timestamptz;

  v_longest_streak int;
  v_raw_current_streak int;
  v_last_week_start date;
  v_current_streak int;

  v_raw_weekend_streak int;
  v_weekend_last_week_start date;
  v_weekend_streak int;

  v_challenge record;
  v_progress jsonb;
  v_completed boolean;

  v_showdown_id uuid;
  v_period_start date := (date_trunc('month', v_checked_in_at at time zone 'utc'))::date;
  v_period_end date := (date_trunc('month', v_checked_in_at at time zone 'utc') + interval '1 month' - interval '1 day')::date;
begin
  select count(*) into v_total_checkins from public.run_checkins where user_id = v_user_id;

  select count(distinct club_id) into v_distinct_clubs from public.run_checkins where user_id = v_user_id;

  select count(*) into v_morning_count
    from public.run_checkins
    where user_id = v_user_id and extract(hour from checked_in_at at time zone 'utc') < 8;

  select max(checked_in_at) into v_prev_checked_in_at
    from public.run_checkins
    where user_id = v_user_id and id <> new.id and checked_in_at < v_checked_in_at;

  -- Overall weekly streak, calendar week Mon-Sun. Classic "gaps and
  -- islands": consecutive weeks are 7 days apart, so wk - (row_number*7)
  -- is constant within a run of consecutive weeks, letting us group them.
  with wk as (
    select distinct (date_trunc('week', checked_in_at at time zone 'utc'))::date as d
    from public.run_checkins where user_id = v_user_id
  ),
  islands as (
    select d, d - (row_number() over (order by d) * 7)::int as grp
    from wk
  ),
  streaks as (
    select grp, count(*)::int as len, max(d) as last_d
    from islands group by grp
  )
  select
    coalesce((select max(len) from streaks), 0),
    coalesce((select len from streaks where last_d = (select max(d) from wk)), 0),
    (select max(d) from wk)
  into v_longest_streak, v_raw_current_streak, v_last_week_start;

  -- A streak only counts as "current" if it reaches this week or last week;
  -- otherwise it's lapsed and reads as 0 until the user checks in again.
  v_current_streak := case
    when v_last_week_start is null or v_last_week_start < v_this_week_start - 7 then 0
    else v_raw_current_streak
  end;

  -- Weekend-only streak for Weekend Warrior: same technique, restricted to
  -- weeks that had at least one Saturday/Sunday check-in.
  with wk as (
    select distinct (date_trunc('week', checked_in_at at time zone 'utc'))::date as d
    from public.run_checkins
    where user_id = v_user_id and extract(dow from checked_in_at at time zone 'utc') in (0, 6)
  ),
  islands as (
    select d, d - (row_number() over (order by d) * 7)::int as grp
    from wk
  ),
  streaks as (
    select grp, count(*)::int as len, max(d) as last_d
    from islands group by grp
  )
  select
    coalesce((select len from streaks where last_d = (select max(d) from wk)), 0),
    (select max(d) from wk)
  into v_raw_weekend_streak, v_weekend_last_week_start;

  v_weekend_streak := case
    when v_weekend_last_week_start is null or v_weekend_last_week_start < v_this_week_start - 7 then 0
    else v_raw_weekend_streak
  end;

  -- Only the mission the member selected for this check-in gets its
  -- progress advanced — a single check-in must not count toward every
  -- eligible mission at once.
  for v_challenge in
    select * from public.challenges
    where is_active = true and type in ('streak', 'discovery', 'milestone')
      and id = new.selected_challenge_id
  loop
    case
      when v_challenge.criteria_config ? 'weeks' then
        v_progress := jsonb_build_object('current_streak', v_current_streak, 'longest_streak', v_longest_streak);
        v_completed := v_current_streak >= (v_challenge.criteria_config->>'weeks')::int;
      when v_challenge.criteria_config ? 'weekends' then
        v_progress := jsonb_build_object('current_streak', v_weekend_streak);
        v_completed := v_weekend_streak >= (v_challenge.criteria_config->>'weekends')::int;
      when v_challenge.slug = 'try-3-klubs' then
        v_progress := jsonb_build_object('distinct_clubs', v_distinct_clubs);
        v_completed := v_distinct_clubs >= coalesce((v_challenge.criteria_config->>'clubs')::int, 3);
      when v_challenge.slug = 'morning-person' then
        v_progress := jsonb_build_object('morning_checkins', v_morning_count);
        v_completed := v_morning_count >= coalesce((v_challenge.criteria_config->>'checkins')::int, 5);
      when v_challenge.slug = 'consistency-club' then
        v_progress := jsonb_build_object('total_checkins', v_total_checkins);
        v_completed := v_total_checkins >= coalesce((v_challenge.criteria_config->>'checkins')::int, 10);
      when v_challenge.slug = 'comeback' then
        v_progress := jsonb_build_object(
          'last_gap_days',
          case when v_prev_checked_in_at is null then null
            else extract(day from (v_checked_in_at - v_prev_checked_in_at)) end
        );
        v_completed := v_prev_checked_in_at is not null
          and v_checked_in_at - v_prev_checked_in_at >= make_interval(days => coalesce((v_challenge.criteria_config->>'gap_days')::int, 30));
      else
        continue;
    end case;

    insert into public.user_challenge_progress (user_id, challenge_id, progress, completed_at, updated_at)
    values (v_user_id, v_challenge.id, v_progress, case when v_completed then now() else null end, now())
    on conflict (user_id, challenge_id) do update
      set progress = excluded.progress,
          updated_at = now(),
          -- Never un-complete a challenge once earned, even if progress dips later.
          completed_at = coalesce(public.user_challenge_progress.completed_at, excluded.completed_at);
  end loop;

  -- Klub Showdown: increment this klub's score for the current calendar month.
  -- Rows are created lazily per club, so only clubs with real check-in
  -- activity this period ever appear on the leaderboard. Not a member-selected
  -- mission, so this always increments regardless of selected_challenge_id.
  select id into v_showdown_id from public.challenges where slug = 'klub-showdown' and is_active = true;
  if v_showdown_id is not null then
    insert into public.club_challenge_scores (club_id, challenge_id, period_start, period_end, score, updated_at)
    values (v_club_id, v_showdown_id, v_period_start, v_period_end, 1, now())
    on conflict (club_id, challenge_id, period_start) do update
      set score = public.club_challenge_scores.score + 1, updated_at = now();
  end if;

  return new;
end;
$function$;
