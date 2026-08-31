-- Schedules the daily CRM follow-up digest Edge Function via pg_cron + pg_net.
-- The shared secret used to authenticate the cron -> function call lives in
-- Supabase Vault ('crm_digest_cron_secret'), never in this file or git history.

create extension if not exists pg_net;

select cron.schedule(
  'crm-followup-digest-daily',
  '0 11 * * *', -- 7:00 AM US/Eastern (EDT, UTC-4); drifts to 6:00 AM during EST
  $$
  select net.http_post(
    url := 'https://kotztwlilcwlrywicwar.supabase.co/functions/v1/crm-followup-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'crm_digest_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
