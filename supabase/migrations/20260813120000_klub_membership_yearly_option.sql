-- Lets a director offer a yearly membership option alongside (or instead
-- of) monthly. Both are independently optional -- a klub can have just
-- monthly, just yearly, both, or neither (free/community only).
alter table public.clubs
  add column if not exists membership_yearly_price_cents integer;

alter table public.clubs
  add constraint clubs_membership_yearly_price_cents_range
  check (membership_yearly_price_cents is null or membership_yearly_price_cents between 3000 and 1000000);

-- Snapshots what a specific member actually pays and how often, since the
-- club's price(s) can change later while existing subscribers stay
-- grandfathered at what they originally signed up for -- analytics/revenue
-- must read this per-row, not just multiply headcount by the club's
-- current price.
alter table public.subscriptions
  add column if not exists billing_interval text check (billing_interval in ('monthly', 'yearly')),
  add column if not exists price_cents integer;
