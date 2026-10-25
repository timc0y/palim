-- Separate operator-managed creation allowance; existing attempts remain authoritative.
ALTER TABLE users ADD COLUMN daily_render_limit INTEGER NOT NULL DEFAULT 2
  CHECK(daily_render_limit BETWEEN 1 AND 20);
