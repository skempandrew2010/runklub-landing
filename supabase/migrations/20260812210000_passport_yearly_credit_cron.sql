-- Yearly subscribers only get one invoice.paid a year, so a separate daily
-- sweep drives their monthly credit installments off next_credit_issue_at.
-- Guarded by current_period_end so a subscriber who cancels (or whose
-- period simply ends) stops accruing new monthly batches even if
-- next_credit_issue_at was left in the past.
create or replace function public.passport_issue_monthly_credits_for_yearly_subs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_count integer := 0;
begin
  for v_sub in
    select id, next_credit_issue_at
    from public.passport_subscriptions
    where status = 'active'
      and billing_interval = 'yearly'
      and next_credit_issue_at is not null
      and next_credit_issue_at <= now()
      and (current_period_end is null or next_credit_issue_at < current_period_end)
    for update
  loop
    perform public.passport_issue_credits(v_sub.id);
    update public.passport_subscriptions
      set next_credit_issue_at = v_sub.next_credit_issue_at + interval '1 month'
      where id = v_sub.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.passport_issue_monthly_credits_for_yearly_subs() from public;
grant execute on function public.passport_issue_monthly_credits_for_yearly_subs() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'passport-yearly-monthly-credits') then
    perform cron.unschedule('passport-yearly-monthly-credits');
  end if;
end $$;

select cron.schedule(
  'passport-yearly-monthly-credits',
  '0 4 * * *',
  $$select public.passport_issue_monthly_credits_for_yearly_subs();$$
);
