-- Lets the Gmail sync job dedupe: re-scanning an overlapping date window
-- won't create duplicate touches for a message already logged.
alter table public.touches add column if not exists gmail_message_id text unique;
