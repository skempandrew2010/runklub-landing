create table public.passport_premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  referring_club_id uuid references public.clubs(id) on delete set null,
  status text not null default 'active' check (status in ('active','canceled','past_due')),
  price_cents integer not null,
  referral_pct numeric not null,
  stripe_subscription_id text,
  started_at timestamptz not null default now(),
  canceled_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.passport_premium_subscriptions is 'PLACEHOLDER / not yet live: platform-wide paid Passport tier. price_cents and referral_pct are snapshotted per row so historical revenue does not shift if rates change later. No checkout flow exists yet - table is empty until that ships.';

alter table public.passport_premium_subscriptions enable row level security;

create policy "passport_premium_select_own" on public.passport_premium_subscriptions
  for select using (user_id = auth.uid());

create policy "passport_premium_select_referring_club_owner" on public.passport_premium_subscriptions
  for select using (exists(select 1 from public.clubs c where c.id = passport_premium_subscriptions.referring_club_id and c.user_id = auth.uid()));
