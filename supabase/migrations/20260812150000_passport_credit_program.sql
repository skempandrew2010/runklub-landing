-- Replaces the inactive single-tier/referral "passport_premium_subscriptions"
-- placeholder with the real Passport credit program: subscribers buy one of
-- four monthly credit tiers, credits are issued on the billing date and
-- expire 45 days later (rolling per-batch, not calendar-month), and each
-- check-in at a partner klub spends credits (8 for a "standard" klub, 18 for
-- "premium") and queues a payout to that klub ($3 / $5 respectively). Klub
-- classification is based on the klub's own annual membership price, kept as
-- a separate column from clubs.tier (which is the klub owner's SaaS plan —
-- an unrelated concept that happens to share the word "tier").

drop policy if exists "passport_premium_select_own" on public.passport_premium_subscriptions;
drop policy if exists "passport_premium_select_referring_club_owner" on public.passport_premium_subscriptions;
drop table if exists public.passport_premium_subscriptions;

-- ── Klub classification ──────────────────────────────────────────────────
-- Deliberately separate from membership_price_cents (what a runner pays
-- *that klub* directly for membership via Connect) — a klub's Passport
-- classification is about its own stated annual dues, which the klub may
-- report independently of whether Connect membership billing is set up.
alter table public.clubs
  add column if not exists passport_annual_price_cents integer;

alter table public.clubs
  add column if not exists passport_checkin_tier text
  generated always as (
    case when coalesce(passport_annual_price_cents, 0) > 30000 then 'premium' else 'standard' end
  ) stored;

comment on column public.clubs.passport_annual_price_cents is 'Klub-reported annual membership price in cents, used only to classify the klub for the Passport check-in credit program. Null is treated as standard (<=$300/yr).';
comment on column public.clubs.passport_checkin_tier is 'Derived: standard (<=$300/yr) or premium (>$300/yr). Do not confuse with clubs.tier, which is the klub owner''s own SaaS plan.';

-- ── Reference tables (single source of truth for pricing/economics) ─────
create table public.passport_tiers (
  tier smallint primary key,
  name text not null,
  monthly_price_cents integer not null,
  credits_per_month integer not null
);

insert into public.passport_tiers (tier, name, monthly_price_cents, credits_per_month) values
  (1, 'Tier 1', 1500, 16),
  (2, 'Tier 2', 2500, 32),
  (3, 'Tier 3', 3300, 56),
  (4, 'Tier 4', 4000, 72);

create table public.passport_checkin_costs (
  checkin_tier text primary key check (checkin_tier in ('standard', 'premium')),
  credit_cost integer not null,
  club_payout_cents integer not null
);

insert into public.passport_checkin_costs (checkin_tier, credit_cost, club_payout_cents) values
  ('standard', 8, 300),
  ('premium', 18, 500);

alter table public.passport_tiers enable row level security;
alter table public.passport_checkin_costs enable row level security;

create policy "passport_tiers_public_read" on public.passport_tiers
  for select using (true);

create policy "passport_checkin_costs_public_read" on public.passport_checkin_costs
  for select using (true);

-- ── Core program tables ──────────────────────────────────────────────────
create table public.passport_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier smallint not null references public.passport_tiers(tier),
  stripe_subscription_id text,
  stripe_customer_id text,
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create unique index passport_subscriptions_stripe_subscription_id_idx
  on public.passport_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

-- One active subscription per user at a time (upgrade/downgrade updates the
-- existing row's tier rather than creating a new one).
create unique index passport_subscriptions_one_active_per_user_idx
  on public.passport_subscriptions(user_id)
  where status = 'active';

create table public.passport_credit_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.passport_subscriptions(id) on delete set null,
  credits_issued integer not null check (credits_issued > 0),
  credits_remaining integer not null check (credits_remaining >= 0 and credits_remaining <= credits_issued),
  status text not null default 'active' check (status in ('active', 'expired')),
  issued_at timestamptz not null default now(),
  -- Not a generated column: timestamptz + interval isn't IMMUTABLE (DST/
  -- timezone-dependent), which Postgres requires for generated columns.
  -- passport_issue_credits() always sets this explicitly to issued_at + 45d;
  -- the default here only covers a hand-inserted row.
  expires_at timestamptz not null default (now() + interval '45 days'),
  created_at timestamptz not null default now()
);

create index passport_credit_batches_fifo_idx
  on public.passport_credit_batches(user_id, issued_at)
  where status = 'active' and credits_remaining > 0;

create table public.passport_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  checkin_tier text not null check (checkin_tier in ('standard', 'premium')),
  credits_spent integer not null check (credits_spent > 0),
  payout_amount_cents integer not null check (payout_amount_cents >= 0),
  payout_status text not null default 'pending' check (payout_status in ('pending', 'paid', 'failed')),
  checked_in_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index passport_checkins_club_idx on public.passport_checkins(club_id, checked_in_at desc);
create index passport_checkins_user_idx on public.passport_checkins(user_id, checked_in_at desc);

-- FIFO deduction ledger — which batches a check-in actually drew credits
-- from. Needed for correctness (a check-in commonly spans >1 batch) and so
-- expiration/refund logic never has to guess where a debit came from.
create table public.passport_credit_batch_debits (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.passport_credit_batches(id) on delete cascade,
  checkin_id uuid not null references public.passport_checkins(id) on delete cascade,
  credits_deducted integer not null check (credits_deducted > 0),
  created_at timestamptz not null default now()
);

create index passport_credit_batch_debits_batch_idx on public.passport_credit_batch_debits(batch_id);
create index passport_credit_batch_debits_checkin_idx on public.passport_credit_batch_debits(checkin_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.passport_subscriptions enable row level security;
alter table public.passport_credit_batches enable row level security;
alter table public.passport_checkins enable row level security;
alter table public.passport_credit_batch_debits enable row level security;

create policy "passport_subscriptions_select_own" on public.passport_subscriptions
  for select using (user_id = auth.uid());

create policy "passport_credit_batches_select_own" on public.passport_credit_batches
  for select using (user_id = auth.uid());

create policy "passport_checkins_select_own" on public.passport_checkins
  for select using (user_id = auth.uid());

create policy "passport_checkins_select_club_owner" on public.passport_checkins
  for select using (exists(select 1 from public.clubs c where c.id = passport_checkins.club_id and c.user_id = auth.uid()));

create policy "passport_credit_batch_debits_select_own" on public.passport_credit_batch_debits
  for select using (exists(
    select 1 from public.passport_credit_batches b
    where b.id = passport_credit_batch_debits.batch_id and b.user_id = auth.uid()
  ));

-- No insert/update/delete policies for authenticated users on any of these —
-- all writes go through the SECURITY DEFINER functions below (or the
-- service role from Stripe webhooks), never direct table access, so a
-- client can't mint their own credits or back-date a check-in.
