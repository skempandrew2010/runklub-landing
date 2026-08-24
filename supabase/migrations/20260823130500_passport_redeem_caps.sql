-- Adds an optional p_run_id (default null, so existing callers keep working
-- unchanged) and enforces the two caps a director can set: a per-run total
-- and a per-runner monthly total at this klub.

create or replace function public.passport_redeem_checkin(p_club_id uuid, p_run_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_checkin_tier text;
  v_enrolled boolean;
  v_monthly_limit integer;
  v_monthly_count integer;
  v_run_limit integer;
  v_run_checkin_count integer;
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

  select passport_checkin_tier, passport_program_enrolled, passport_monthly_checkin_limit_per_user
    into v_checkin_tier, v_enrolled, v_monthly_limit
    from public.clubs where id = p_club_id;
  if v_checkin_tier is null then
    raise exception 'klub not found' using errcode = 'P0002';
  end if;
  if not v_enrolled then
    raise exception 'this klub is not enrolled in the Passport program' using errcode = 'P0002';
  end if;

  if p_run_id is not null then
    select passport_checkin_limit into v_run_limit
      from public.runs where id = p_run_id and club_id = p_club_id;
    if v_run_limit is not null then
      select count(*) into v_run_checkin_count
        from public.passport_checkins where run_id = p_run_id;
      if v_run_checkin_count >= v_run_limit then
        raise exception 'this run has reached its Passport check-in limit' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if v_monthly_limit is not null then
    select count(*) into v_monthly_count
      from public.passport_checkins
      where club_id = p_club_id and user_id = v_user_id
        and checked_in_at >= date_trunc('month', now());
    if v_monthly_count >= v_monthly_limit then
      raise exception 'you have reached this klub''s monthly Passport check-in limit' using errcode = 'P0001';
    end if;
  end if;

  select credit_cost, club_payout_cents into v_credit_cost, v_payout_cents
    from public.passport_checkin_costs where checkin_tier = v_checkin_tier;

  select coalesce(sum(credits_remaining), 0) into v_total_available
    from public.passport_credit_batches
    where user_id = v_user_id and status = 'active' and credits_remaining > 0 and expires_at > now();

  if v_total_available < v_credit_cost then
    raise exception 'insufficient_credits: have %, need %', v_total_available, v_credit_cost using errcode = 'P0001';
  end if;

  insert into public.passport_checkins (user_id, club_id, run_id, checkin_tier, credits_spent, payout_amount_cents)
    values (v_user_id, p_club_id, p_run_id, v_checkin_tier, v_credit_cost, v_payout_cents)
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
