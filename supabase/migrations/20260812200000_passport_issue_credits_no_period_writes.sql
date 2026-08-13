-- passport_issue_credits() previously stamped current_period_start/end to
-- "now + 1 month" every time it ran, assuming each call meant a fresh
-- monthly Stripe billing cycle. That's wrong for a yearly subscriber's
-- monthly credit installment (their real period is a year, tracked
-- correctly by customer.subscription.updated from Stripe's own data) — so
-- stop touching those columns here. Issuance and period-tracking are now
-- fully decoupled, which is also just more correct for monthly subscribers.
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

  return v_batch_id;
end;
$$;

revoke all on function public.passport_issue_credits(uuid) from public;
grant execute on function public.passport_issue_credits(uuid) to service_role;
