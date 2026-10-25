-- Keep destination IDs, ownership and defaults intact while allowing saved-only entries.
ALTER TABLE reader_destinations RENAME COLUMN confirmed_at TO previous_confirmed_at;
ALTER TABLE reader_destinations ADD COLUMN confirmed_at INTEGER;
UPDATE reader_destinations SET confirmed_at=previous_confirmed_at;
ALTER TABLE reader_destinations DROP COLUMN previous_confirmed_at;
