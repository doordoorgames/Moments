-- Character ownership/assignment has been removed from Moments gameplay.
-- Story text still contains the fictional characters; nodes no longer belong to one.
alter table nodes drop column if exists character;
