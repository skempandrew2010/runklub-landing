-- Passport credit program: issuance, FIFO redemption, and expiration.
-- All three are the only way these tables are ever written to (see the "no
-- insert/update/delete policies" note in the schema migration) — issuance
-- and expiration are service_role-only (driven by a Stripe webhook / cron,
-- never directly callable by a client), while redemption is callable by an
-- authenticated user but only ever acts on auth.uid(), never a client-
-- supplied user id, so nobody can spend someone else's credits.

-- ── Issue a batch on a subscriber's billing date ─────────────────────────
create or replace function public.passport_issue_credits(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.passport_subscriptions%rowtype;
  v_credits integer;
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

  select credits_per_month into v_credits from public.passport_tiers where tier = v_sub.tier;

  insert into public.passport_credit_batches (user_id, subscription_id, credits_issued, credits_remaining, issued_at, expires_at)
    values (v_sub.user_id, v_sub.id, v_credits, v_credits, v_issued_at, v_issued_at + interval '45 days')
    returning id into v_batch_id;

  update public.passport_subscriptions
    set current_period_start = now(), current_period_end = now() + interval '1 month'
    where id = p_subscription_id;

  return v_batch_id;
end;
$$;

revoke all on function public.passport_issue_credits(uuid) from public;
grant execute on function public.passport_issue_credits(uuid) to service_role;

-- ── Redeem a check-in: FIFO deduction across batches, oldest first ──────
create or replace function public.passport_redeem_checkin(p_club_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_checkin_tier text;
  v_credit_cost integer;
  v_payout_cents integer;
  v_total_available integer;
  v_remaining_to_deduct integer;
  v_deduct integer;
  v_checkin_id uuid;
  v_batch record;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Serializes redemptions for this one user so two concurrent check-ins
  -- can't both read the same "available credits" total before either
  -- deducts (the FOR UPDATE below locks the batch rows themselves, but this
  -- also blocks a second call from even starting its own read until the
  -- first is done, which keeps the insufficient-credits check honest).
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select passport_checkin_tier into v_checkin_tier from public.clubs where id = p_club_id;
  if v_checkin_tier is null then
    raise exception 'klub not found' using errcode = 'P0002';
  end if;

  select credit_cost, club_payout_cents into v_credit_cost, v_payout_cents
    from public.passport_checkin_costs where checkin_tier = v_checkin_tier;

  select coalesce(sum(credits_remaining), 0) into v_total_available
    from public.passport_credit_batches
    where user_id = v_user_id and status = 'active' and credits_remaining > 0 and expires_at > now();

  if v_total_available < v_credit_cost then
    raise exception 'insufficient_credits: have %, need %', v_total_available, v_credit_cost using errcode = 'P0001';
  end if;

  insert into public.passport_checkins (user_id, club_id, checkin_tier, credits_spent, payout_amount_cents)
    values (v_user_id, p_club_id, v_checkin_tier, v_credit_cost, v_payout_cents)
    returning id into v_checkin_id;

  v_remaining_to_deduct := v_credit_cost;

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

    insert into public.passport_credit_batch_debits (batch_id, checkin_id, credits_deducted)
      values (v_batch.id, v_checkin_id, v_deduct);

    v_remaining_to_deduct := v_remaining_to_deduct - v_deduct;
  end loop;

  return v_checkin_id;
end;
$$;

revoke all on function public.passport_redeem_checkin(uuid) from public;
grant execute on function public.passport_redeem_checkin(uuid) to authenticated;

-- ── Daily expiration sweep ────────────────────────────────────────────────
create or replace function public.passport_expire_credit_batches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.passport_credit_batches
    set status = 'expired', credits_remaining = 0
    where status = 'active' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.passport_expire_credit_batches() from public;
grant execute on function public.passport_expire_credit_batches() to service_role;
