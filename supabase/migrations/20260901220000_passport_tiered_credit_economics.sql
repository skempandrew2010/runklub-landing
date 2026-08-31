-- Passport tiered credit economics: payout now depends on which source
-- (add-on pack vs subscription tier) funded the specific credits spent,
-- instead of one flat formula.

-- 1. Credit sources lookup - adding a new source later (e.g. a finalized
-- annual tier) is just a new row here, never a schema change.
create table public.passport_credit_sources (
  source text primary key,
  label text not null,
  rate_per_credit_cents numeric(10,4) not null check (rate_per_credit_cents > 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.passport_credit_sources (source, label, rate_per_credit_cents) values
  ('add_on', 'Add-on Pack', 60.0000),
  ('tier_1', 'Tier 1', 55.5556),
  ('tier_2', 'Tier 2', 50.0000),
  ('tier_3', 'Tier 3', 44.4444);

alter table public.passport_credit_sources enable row level security;
create policy passport_credit_sources_public_read on public.passport_credit_sources for select using (true);

-- 2. Payout share config - singleton row, plain UPDATE to adjust, no migration.
create table public.passport_payout_settings (
  id boolean primary key default true check (id),
  payout_share numeric(4,3) not null default 0.500 check (payout_share > 0 and payout_share <= 1),
  updated_at timestamptz not null default now()
);
insert into public.passport_payout_settings (id) values (true);

alter table public.passport_payout_settings enable row level security;
create policy passport_payout_settings_public_read on public.passport_payout_settings for select using (true);

-- 3. Tier -> source mapping, data-driven (mirrors how credits_per_month already works)
alter table public.passport_tiers add column credit_source text references public.passport_credit_sources(source);
update public.passport_tiers set credit_source = 'tier_1' where tier = 1;
update public.passport_tiers set credit_source = 'tier_2' where tier = 2;
update public.passport_tiers set credit_source = 'tier_3' where tier = 4;
alter table public.passport_tiers alter column credit_source set not null;

-- 4. Snapshot the rate on each batch at issuance time; replace the old
-- source CHECK (subscription|purchase only) with an FK so new sources
-- never require touching this table again.
alter table public.passport_credit_batches add column rate_per_credit_cents numeric(10,4);
alter table public.passport_credit_batches drop constraint passport_credit_batches_source_check;

update public.passport_credit_batches
  set source = 'tier_2',
      rate_per_credit_cents = (select rate_per_credit_cents from public.passport_credit_sources where source = 'tier_2')
  where source = 'subscription';

alter table public.passport_credit_batches alter column rate_per_credit_cents set not null;
alter table public.passport_credit_batches
  add constraint passport_credit_batches_source_fkey foreign key (source) references public.passport_credit_sources(source);

-- 5. Issuance now stamps source + rate onto the batch, resolved from the
-- data-driven tier mapping above.
create or replace function public.passport_issue_credits(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.passport_subscriptions%rowtype;
  v_credits integer;
  v_source text;
  v_rate numeric(10,4);
  v_batch_id uuid;
  v_issued_at timestamptz := now();
begin
  select * into v_sub from public.passport_subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'subscription not found' using errcode = 'P0002';
  end if;
  if v_sub.status <> 'active' then
    raise exception 'subscription % is not active', p_subscription_id using errcode = 'P0001';
  end if;

  select credits_per_month, credit_source into v_credits, v_source
    from public.passport_tiers where tier = v_sub.tier;
  if v_source is null then
    raise exception 'no credit source configured for passport tier %', v_sub.tier using errcode = 'P0002';
  end if;

  select rate_per_credit_cents into v_rate
    from public.passport_credit_sources where source = v_source and is_active;
  if v_rate is null then
    raise exception 'credit source % is not configured or inactive', v_source using errcode = 'P0002';
  end if;

  insert into public.passport_credit_batches (user_id, subscription_id, source, rate_per_credit_cents, credits_issued, credits_remaining, issued_at, expires_at)
    values (v_sub.user_id, v_sub.id, v_source, v_rate, v_credits, v_credits, v_issued_at, v_issued_at + interval '45 days')
    returning id into v_batch_id;

  return v_batch_id;
end;
$$;

-- 6. Redemption now computes payout from whichever batch(es) actually fund
-- it (rate can differ per batch), instead of one flat formula.
create or replace function public.passport_redeem_offer(
  p_offer_id uuid,
  p_run_id uuid default null,
  p_checkin_method text default 'no_checkin_required',
  p_checkin_lat double precision default null,
  p_checkin_lng double precision default null,
  p_external_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer record;
  v_enrolled boolean;
  v_default_checkin_limit integer;
  v_monthly_limit_per_user integer;
  v_monthly_limit_total integer;
  v_monthly_count_user integer;
  v_monthly_count_total integer;
  v_run_limit integer;
  v_run_credit_value smallint;
  v_run_checkin_count integer;
  v_credit_value integer;
  v_own_offer_count integer;
  v_total_offer_count integer;
  v_payout_cents integer;
  v_payout_cents_accum numeric := 0;
  v_payout_share numeric(4,3);
  v_total_available integer;
  v_remaining_to_deduct integer;
  v_deduct integer;
  v_redemption_id uuid;
  v_batch record;
  v_batch_ids uuid[] := array[]::uuid[];
  v_batch_deducts integer[] := array[]::integer[];
  i integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select * into v_offer from public.passport_offers where id = p_offer_id and is_active = true;
  if v_offer is null then
    raise exception 'offer not found or no longer active' using errcode = 'P0002';
  end if;

  select passport_program_enrolled, passport_default_checkin_limit,
         passport_monthly_checkin_limit_per_user, passport_monthly_checkin_limit_total
    into v_enrolled, v_default_checkin_limit, v_monthly_limit_per_user, v_monthly_limit_total
    from public.clubs where id = v_offer.club_id;
  if not v_enrolled then
    raise exception 'this klub is not enrolled in the Passport program' using errcode = 'P0002';
  end if;

  v_credit_value := v_offer.credit_cost;

  if p_run_id is not null and v_offer.offer_type = 'standard_session' then
    select passport_checkin_limit, passport_credit_value into v_run_limit, v_run_credit_value
      from public.runs where id = p_run_id and club_id = v_offer.club_id;

    if v_run_credit_value is not null then
      v_credit_value := v_run_credit_value;
    end if;
    if v_run_limit is null then
      v_run_limit := v_default_checkin_limit;
    end if;

    if v_run_limit is not null then
      select count(*) into v_run_checkin_count
        from public.passport_redemptions where run_id = p_run_id and status = 'confirmed';
      if v_run_checkin_count >= v_run_limit then
        raise exception 'this run has reached its Passport check-in limit' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if v_offer.redemption_limit_per_runner is not null then
    select count(*) into v_own_offer_count
      from public.passport_redemptions
      where offer_id = p_offer_id and user_id = v_user_id and status = 'confirmed';
    if v_own_offer_count >= v_offer.redemption_limit_per_runner then
      raise exception 'you have already redeemed this offer the maximum number of times' using errcode = 'P0001';
    end if;
  end if;

  if v_offer.total_redemption_cap is not null then
    select count(*) into v_total_offer_count
      from public.passport_redemptions
      where offer_id = p_offer_id and status = 'confirmed';
    if v_total_offer_count >= v_offer.total_redemption_cap then
      raise exception 'this offer has reached its total redemption cap' using errcode = 'P0001';
    end if;
  end if;

  if v_monthly_limit_per_user is not null then
    select count(*) into v_monthly_count_user
      from public.passport_redemptions
      where club_id = v_offer.club_id and user_id = v_user_id and status = 'confirmed'
        and redeemed_at >= date_trunc('month', now());
    if v_monthly_count_user >= v_monthly_limit_per_user then
      raise exception 'you have reached this klub''s monthly Passport redemption limit' using errcode = 'P0001';
    end if;
  end if;

  if v_monthly_limit_total is not null then
    select count(*) into v_monthly_count_total
      from public.passport_redemptions
      where club_id = v_offer.club_id and status = 'confirmed'
        and redeemed_at >= date_trunc('month', now());
    if v_monthly_count_total >= v_monthly_limit_total then
      raise exception 'this klub has reached its total monthly Passport redemption limit' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(sum(credits_remaining), 0) into v_total_available
    from public.passport_credit_batches
    where user_id = v_user_id and status = 'active' and credits_remaining > 0 and expires_at > now();

  if v_total_available < v_credit_value then
    raise exception 'insufficient_credits: have %, need %', v_total_available, v_credit_value using errcode = 'P0001';
  end if;

  select payout_share into v_payout_share from public.passport_payout_settings limit 1;

  v_remaining_to_deduct := v_credit_value;

  for v_batch in
    select id, credits_remaining, rate_per_credit_cents
    from public.passport_credit_batches
    where user_id = v_user_id and status = 'active' and credits_remaining > 0 and expires_at > now()
    order by issued_at asc
    for update
  loop
    exit when v_remaining_to_deduct <= 0;
    v_deduct := least(v_batch.credits_remaining, v_remaining_to_deduct);

    v_batch_ids := array_append(v_batch_ids, v_batch.id);
    v_batch_deducts := array_append(v_batch_deducts, v_deduct);
    v_payout_cents_accum := v_payout_cents_accum + (v_deduct * v_batch.rate_per_credit_cents * v_payout_share);

    v_remaining_to_deduct := v_remaining_to_deduct - v_deduct;
  end loop;

  v_payout_cents := round(v_payout_cents_accum)::integer;

  insert into public.passport_redemptions
    (user_id, offer_id, club_id, run_id, credits_spent, payout_amount_cents, checkin_method, checkin_lat, checkin_lng, external_reference)
    values (v_user_id, p_offer_id, v_offer.club_id, p_run_id, v_credit_value, v_payout_cents, p_checkin_method, p_checkin_lat, p_checkin_lng, p_external_reference)
    returning id into v_redemption_id;

  for i in 1 .. array_length(v_batch_ids, 1) loop
    update public.passport_credit_batches
      set credits_remaining = credits_remaining - v_batch_deducts[i]
      where id = v_batch_ids[i];

    insert into public.passport_credit_batch_debits (batch_id, redemption_id, credits_deducted)
      values (v_batch_ids[i], v_redemption_id, v_batch_deducts[i]);
  end loop;

  return v_redemption_id;
end;
$$;

-- 7. Reporting

create view public.passport_runner_credit_balances
with (security_invoker = true) as
select
  user_id,
  id as batch_id,
  source,
  rate_per_credit_cents,
  credits_remaining,
  issued_at,
  expires_at
from public.passport_credit_batches
where status = 'active' and credits_remaining > 0 and expires_at > now();

create view public.club_payout_summary
with (security_invoker = true) as
select
  club_id,
  date_trunc('day', redeemed_at) as redemption_day,
  payout_status,
  count(*) as redemption_count,
  sum(credits_spent) as credits_redeemed,
  sum(payout_amount_cents) as payout_cents
from public.passport_redemptions
where status = 'confirmed'
group by club_id, date_trunc('day', redeemed_at), payout_status;
