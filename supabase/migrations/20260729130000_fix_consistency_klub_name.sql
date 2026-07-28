-- User-facing copy should always say "Klub", never "Club" (see the
-- Club->Klub rename convention) -- this one slipped through in the
-- engagement_challenges_schema seed data.
update public.challenges
set name = 'Consistency Klub'
where slug = 'consistency-club';
