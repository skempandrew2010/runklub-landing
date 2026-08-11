alter table public.club_weekly_schedule add column if not exists pace_group_id uuid references public.pace_groups(id) on delete cascade;

update public.club_weekly_schedule cws
set pace_group_id = (
  select pg.id from public.pace_groups pg where pg.club_id = cws.club_id order by pg.pace_min limit 1
)
where pace_group_id is null;

delete from public.club_weekly_schedule where pace_group_id is null;

alter table public.club_weekly_schedule alter column pace_group_id set not null;

alter table public.club_weekly_schedule drop constraint if exists club_weekly_schedule_club_id_day_of_week_week_of_key;
alter table public.club_weekly_schedule add constraint club_weekly_schedule_pace_group_day_week_key unique (pace_group_id, day_of_week, week_of);

comment on column public.club_weekly_schedule.pace_group_id is 'Each pace group has its own independent weekly schedule.';
