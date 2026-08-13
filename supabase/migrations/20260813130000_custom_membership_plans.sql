-- Generalizes klub membership pricing from two fixed fields (monthly/yearly)
-- into a real list of named, custom plans a director can create (e.g.
-- "Student Rate", "Family Plan") -- each with its own price and interval.
-- The old clubs.membership_price_cents / membership_yearly_price_cents
-- columns are left in place (still readable for history) but the app stops
-- writing/reading them going forward in favor of this table.

create table public.club_membership_plans (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  price_cents integer not null,
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.club_membership_plans
  add constraint club_membership_plans_price_range
  check (
    (billing_interval = 'monthly' and price_cents between 300 and 100000)
    or (billing_interval = 'yearly' and price_cents between 3000 and 1000000)
  );

create index club_membership_plans_club_active_idx
  on public.club_membership_plans(club_id)
  where is_active;

alter table public.club_membership_plans enable row level security;

-- Anyone can see a klub's active plans (needed for the public join flow);
-- the owner can also see their own inactive/archived ones. All writes go
-- through /api/director/connect/membership-plans (service role) -- no
-- client-side insert/update/delete policy.
create policy "club_membership_plans_select_active_or_owner" on public.club_membership_plans
  for select using (
    is_active
    or exists(select 1 from public.clubs c where c.id = club_membership_plans.club_id and c.user_id = auth.uid())
  );

-- Snapshots which named plan a member actually signed up under, alongside
-- the existing billing_interval/price_cents snapshot -- plan_id is kept for
-- reference but plan_name/price/interval are the source of truth for
-- display, since a plan can be renamed/repriced/deleted later while
-- existing members stay grandfathered at what they signed up for.
alter table public.subscriptions
  add column if not exists plan_id uuid references public.club_membership_plans(id) on delete set null,
  add column if not exists plan_name text;

-- Backfill existing klub prices into named plans, and existing paid
-- subscriptions with the matching plan.
insert into public.club_membership_plans (club_id, name, price_cents, billing_interval, is_active)
select id, 'Monthly Membership', membership_price_cents, 'monthly', true
from public.clubs
where membership_price_cents is not null;

insert into public.club_membership_plans (club_id, name, price_cents, billing_interval, is_active)
select id, 'Yearly Membership', membership_yearly_price_cents, 'yearly', true
from public.clubs
where membership_yearly_price_cents is not null;

update public.subscriptions s
set plan_id = p.id,
    plan_name = p.name
from public.club_membership_plans p
where s.club_id = p.club_id
  and s.billing_interval = p.billing_interval
  and s.member_type = 'paid'
  and s.plan_id is null;
