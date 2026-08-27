-- Tracks whether a push reminder has already gone out for this RSVP, so the
-- run-reminders cron job never double-sends on a later tick.
alter table public.rsvps add column reminder_sent_at timestamptz;
