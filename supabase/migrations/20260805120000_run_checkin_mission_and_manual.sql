-- Supports two new check-in features: letting a member pick which Mission
-- (challenge) a check-in should spotlight, and letting a klub coach/director
-- check a member in manually (e.g. they couldn't self check-in via geolocation).
alter table public.run_checkins
  add column selected_challenge_id uuid references public.challenges(id),
  add column checkin_method text not null default 'geolocation'
    check (checkin_method in ('geolocation', 'manual')),
  add column checked_in_by uuid references auth.users(id);
