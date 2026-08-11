alter table public.club_weekly_schedule add column if not exists week_of date;

update public.club_weekly_schedule set week_of = date_trunc('week', now())::date where week_of is null;

alter table public.club_weekly_schedule alter column week_of set not null;

alter table public.club_weekly_schedule drop constraint if exists club_weekly_schedule_club_id_day_of_week_key;

alter table public.club_weekly_schedule add constraint club_weekly_schedule_club_id_day_of_week_week_of_key unique (club_id, day_of_week, week_of);

comment on column public.club_weekly_schedule.week_of is 'Monday of the week this day''s workout applies to. Directors can plan up to 12 weeks ahead; each week is independent (no inheritance from prior weeks).';
