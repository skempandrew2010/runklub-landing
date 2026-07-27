-- Lets a director list a run without managing it in RunKlub at all — just
-- date/time (+ optional city) plus a link out to wherever they already
-- handle RSVPs (Meetup, their own site, RunSignup, etc). We still want the
-- listing itself (for discovery/search and, eventually, affiliate matching),
-- even when RunKlub isn't the system of record for that run.
alter table public.runs add column external_url text;
