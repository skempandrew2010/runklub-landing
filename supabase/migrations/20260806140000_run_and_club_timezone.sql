-- Neither runs.time nor clubs.meeting_time have ever carried a timezone —
-- every reader (browser, or the server process, which runs in UTC on
-- Vercel) has assumed its own local clock matched the klub's. Nullable so
-- existing rows keep their current (naive) display/gating behavior until
-- a director sets a real timezone via the app.
alter table public.runs add column timezone text;
alter table public.clubs add column default_timezone text;
