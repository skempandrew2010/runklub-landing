alter table runs add column if not exists structure jsonb;
comment on column runs.structure is 'Structured workout segments for kind=workout rows: array of {reps, distance_time, pace}. Free-text description column still holds the flowing writeup.';
