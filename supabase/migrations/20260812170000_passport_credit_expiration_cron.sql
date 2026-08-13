-- Daily sweep that expires credit batches past their 45-day window. No
-- Supabase Edge Functions exist anywhere in this project (all business
-- logic lives in Next.js API routes + Postgres functions), so this uses
-- pg_cron rather than introducing a second serverless runtime just for one
-- daily job.
--
-- NOTE: if this migration fails on `create extension pg_cron`, the project's
-- plan may require enabling it manually first via Supabase Dashboard →
-- Database → Extensions, then re-running this file.

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'passport-expire-credit-batches') then
    perform cron.unschedule('passport-expire-credit-batches');
  end if;
end $$;

select cron.schedule(
  'passport-expire-credit-batches',
  '0 3 * * *',
  $$select public.passport_expire_credit_batches();$$
);
