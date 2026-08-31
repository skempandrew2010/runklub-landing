-- Standard session Passport redemption now only applies to runs a director
-- explicitly designates, instead of every public run at an enrolled klub.

create table public.passport_offer_runs (
  offer_id uuid not null references public.passport_offers(id) on delete cascade,
  run_id uuid not null references public.runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (offer_id, run_id)
);

create index passport_offer_runs_run_id_idx on public.passport_offer_runs (run_id);

alter table public.passport_offer_runs enable row level security;

create policy passport_offer_runs_select_public on public.passport_offer_runs
  for select using (
    exists (select 1 from public.passport_offers o where o.id = passport_offer_runs.offer_id and o.is_active)
  );

create policy passport_offer_runs_select_owner on public.passport_offer_runs
  for select using (
    exists (
      select 1 from public.passport_offers o
      join public.clubs c on c.id = o.club_id
      where o.id = passport_offer_runs.offer_id and c.user_id = auth.uid()
    )
  );

create policy passport_offer_runs_insert_owner on public.passport_offer_runs
  for insert with check (
    exists (
      select 1 from public.passport_offers o
      join public.clubs c on c.id = o.club_id
      where o.id = passport_offer_runs.offer_id and c.user_id = auth.uid()
    )
  );

create policy passport_offer_runs_delete_owner on public.passport_offer_runs
  for delete using (
    exists (
      select 1 from public.passport_offers o
      join public.clubs c on c.id = o.club_id
      where o.id = passport_offer_runs.offer_id and c.user_id = auth.uid()
    )
  );

create view public.passport_designated_runs
with (security_invoker = true) as
select por.run_id, po.club_id, po.id as offer_id
from public.passport_offer_runs por
join public.passport_offers po on po.id = por.offer_id
where po.offer_type = 'standard_session' and po.is_active = true;

create or replace function public.passport_redeem_offer(
  p_offer_id uuid,
  p_run_id uuid default null,
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

  if v_offer.offer_type = 'standard_session' then
    if p_run_id is null then
      raise exception 'a run must be selected for this offer' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.passport_offer_runs where offer_id = p_offer_id and run_id = p_run_id) then
      raise exception 'this run is not a designated Passport event' using errcode = 'P0001';
    end if;

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
    (user_id, offer_id, club_id, run_id, credits_spent, payout_amount_cents, external_reference)
    values (v_user_id, p_offer_id, v_offer.club_id, p_run_id, v_credit_value, v_payout_cents, p_external_reference)
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
