-- Passport rebuild: a per-klub menu of redeemable offers (standard session,
-- race-entry kickback, one-off special session, gear discount, ...) instead
-- of a single "check into a run" redemption, plus payout-reliability fixes.
-- passport_checkins had 0 rows in production at migration time - nothing to
-- backfill; passport_redemptions replaces it outright.

-- ── Offers menu ─────────────────────────────────────────────────────────
create table public.passport_offers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  offer_type text not null check (offer_type in ('standard_session', 'race_kickback', 'special_session', 'gear_discount', 'other')),
  title text not null,
  description text,
  credit_cost smallint not null check (credit_cost > 0),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  redemption_limit_per_runner integer,
  total_redemption_cap integer,
  requires_physical_checkin boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.passport_offers is 'A klub''s menu of Passport-redeemable offers - a standard run check-in is just one offer_type among several.';

-- Every club can have at most one active "standard_session" offer, so a
-- plain run check-in always resolves to exactly one row.
create unique index passport_offers_one_active_standard_session
  on public.passport_offers (club_id)
  where offer_type = 'standard_session' and is_active;

-- ── Redemptions (replaces passport_checkins) ───────────────────────────
create table public.passport_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.passport_offers(id) on delete restrict,
  -- Denormalized alongside offer_id (same convention passport_checkins used
  -- for club_id) so RLS/queries don't need to join through passport_offers.
  club_id uuid not null references public.clubs(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  credits_spent integer not null,
  payout_amount_cents integer not null default 0,
  payout_status text not null default 'pending' check (payout_status in ('pending', 'paid', 'failed')),
  stripe_transfer_id text,
  checkin_method text not null check (checkin_method in ('gps_geofence', 'qr_code', 'manual_code', 'no_checkin_required')),
  checkin_lat double precision,
  checkin_lng double precision,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'expired', 'revoked')),
  external_reference text,
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.passport_redemptions is 'One row per Passport offer redemption. Replaces passport_checkins.';

create index passport_redemptions_user_id_idx on public.passport_redemptions (user_id);
create index passport_redemptions_club_id_idx on public.passport_redemptions (club_id);
create index passport_redemptions_offer_id_idx on public.passport_redemptions (offer_id);

-- ── Repoint the credit-batch debit ledger at redemptions ───────────────
alter table public.passport_credit_batch_debits
  drop constraint passport_credit_batch_debits_checkin_id_fkey;

alter table public.passport_credit_batch_debits
  rename column checkin_id to redemption_id;

alter table public.passport_credit_batch_debits
  add constraint passport_credit_batch_debits_redemption_id_fkey
  foreign key (redemption_id) references public.passport_redemptions(id) on delete cascade;

-- ── Drop the old single-purpose check-in path ──────────────────────────
drop function if exists public.passport_redeem_checkin(uuid);
drop function if exists public.passport_redeem_checkin(uuid, uuid);
drop table public.passport_checkins;

-- ── Seed a standard_session offer for every currently-enrolled klub ────
-- Keeps today's plain run check-in working unchanged from a runner's
-- perspective: it just now redeems this auto-created offer instead of
-- reading clubs.passport_default_credit_value directly.
insert into public.passport_offers (club_id, offer_type, title, credit_cost, requires_physical_checkin)
select id, 'standard_session', 'Standard Session Check-In', passport_default_credit_value, true
from public.clubs
where passport_program_enrolled = true;

-- ── Redemption RPC (replaces passport_redeem_checkin) ──────────────────
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
set search_path to 'public'
as $function$
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
  v_total_available integer;
  v_remaining_to_deduct integer;
  v_deduct integer;
  v_redemption_id uuid;
  v_batch record;
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

  -- A standard_session redemption tied to a specific run still honors that
  -- run's own credit/limit override, same as the old check-in flow did.
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

  -- Per-offer caps.
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

  -- Club-wide monthly caps apply across every offer type - they represent
  -- how much outside-Passport traffic the klub can absorb, not something
  -- specific to plain check-ins.
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

  v_payout_cents := 300 + v_credit_value * 50;

  select coalesce(sum(credits_remaining), 0) into v_total_available
    from public.passport_credit_batches
    where user_id = v_user_id and status = 'active' and credits_remaining > 0 and expires_at > now();

  if v_total_available < v_credit_value then
    raise exception 'insufficient_credits: have %, need %', v_total_available, v_credit_value using errcode = 'P0001';
  end if;

  insert into public.passport_redemptions
    (user_id, offer_id, club_id, run_id, credits_spent, payout_amount_cents, checkin_method, checkin_lat, checkin_lng, external_reference)
    values (v_user_id, p_offer_id, v_offer.club_id, p_run_id, v_credit_value, v_payout_cents, p_checkin_method, p_checkin_lat, p_checkin_lng, p_external_reference)
    returning id into v_redemption_id;

  v_remaining_to_deduct := v_credit_value;

  for v_batch in
    select id, credits_remaining
    from public.passport_credit_batches
    where user_id = v_user_id and status = 'active' and credits_remaining > 0 and expires_at > now()
    order by issued_at asc
    for update
  loop
    exit when v_remaining_to_deduct <= 0;
    v_deduct := least(v_batch.credits_remaining, v_remaining_to_deduct);

    update public.passport_credit_batches
      set credits_remaining = credits_remaining - v_deduct
      where id = v_batch.id;

    insert into public.passport_credit_batch_debits (batch_id, redemption_id, credits_deducted)
      values (v_batch.id, v_redemption_id, v_deduct);

    v_remaining_to_deduct := v_remaining_to_deduct - v_deduct;
  end loop;

  return v_redemption_id;
end;
$function$;

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table public.passport_offers enable row level security;
alter table public.passport_redemptions enable row level security;

-- Public can browse active offers; a director can also see their own
-- klub's inactive/draft offers.
create policy "passport_offers_select_active" on public.passport_offers
  for select using (is_active = true);

create policy "passport_offers_select_club_owner" on public.passport_offers
  for select using (exists(select 1 from public.clubs c where c.id = passport_offers.club_id and c.user_id = auth.uid()));

create policy "passport_offers_insert_owner" on public.passport_offers
  for insert
  with check (exists(select 1 from public.clubs c where c.id = passport_offers.club_id and c.user_id = auth.uid()));

create policy "passport_offers_update_owner" on public.passport_offers
  for update
  using (exists(select 1 from public.clubs c where c.id = passport_offers.club_id and c.user_id = auth.uid()))
  with check (exists(select 1 from public.clubs c where c.id = passport_offers.club_id and c.user_id = auth.uid()));

create policy "passport_offers_delete_owner" on public.passport_offers
  for delete
  using (exists(select 1 from public.clubs c where c.id = passport_offers.club_id and c.user_id = auth.uid()));

-- Reads only - writes stay exclusively through passport_redeem_offer()
-- (security definer) and the service-role payout-status update, matching
-- the existing posture on all the other passport tables.
create policy "passport_redemptions_select_own" on public.passport_redemptions
  for select using (user_id = auth.uid());

create policy "passport_redemptions_select_club_owner" on public.passport_redemptions
  for select using (exists(select 1 from public.clubs c where c.id = passport_redemptions.club_id and c.user_id = auth.uid()));

-- ── Views ───────────────────────────────────────────────────────────────
create view public.runner_club_history
  with (security_invoker = true) as
select
  r.user_id,
  r.club_id,
  c.name as club_name,
  c.image_url as club_image_url,
  count(*) as total_redemptions,
  max(r.redeemed_at) as last_visit_at,
  sum(r.credits_spent) as total_credits_spent
from public.passport_redemptions r
join public.clubs c on c.id = r.club_id
where r.status = 'confirmed'
group by r.user_id, r.club_id, c.name, c.image_url;

comment on view public.runner_club_history is 'Per-runner, per-klub Passport redemption summary - drives the "Clubs You''ve Visited" section.';

create view public.club_active_offers
  with (security_invoker = true) as
select
  o.*,
  count(r.id) filter (where r.status = 'confirmed') as total_redemption_count
from public.passport_offers o
left join public.passport_redemptions r on r.offer_id = o.id
where o.is_active
  and (o.starts_at is null or o.starts_at <= now())
  and (o.ends_at is null or o.ends_at > now())
group by o.id;

comment on view public.club_active_offers is 'Currently-live, non-expired offers per klub with a running redemption count for cap display. The redeem RPC re-checks caps live - this view is for browsing/display only.';
