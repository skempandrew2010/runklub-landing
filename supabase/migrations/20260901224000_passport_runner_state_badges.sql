-- One row per runner+state they've earned a badge for, by redeeming at a
-- Passport-enrolled klub located in that state. State comes from the
-- cities reference table (has real state data), matched against
-- clubs.city the same way Explore already derives city centroids
-- (split on the first comma - clubs.city is inconsistently "City" vs
-- "City, ST", so joining on cities.name is more reliable than parsing
-- a state abbreviation directly out of clubs.city).
create view public.passport_runner_state_badges
with (security_invoker = true) as
select
  r.user_id,
  ct.state,
  count(*) as redemption_count,
  min(r.redeemed_at) as first_earned_at,
  max(r.redeemed_at) as last_redeemed_at
from public.passport_redemptions r
join public.clubs cl on cl.id = r.club_id
join public.cities ct on ct.name = split_part(cl.city, ',', 1)
where r.status = 'confirmed' and ct.state is not null
group by r.user_id, ct.state;
