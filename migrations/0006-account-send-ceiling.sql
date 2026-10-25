-- Widen operator-managed allowances without changing account values or mail history.
ALTER TABLE users ADD COLUMN daily_send_limit_new INTEGER NOT NULL DEFAULT 3
  CHECK(daily_send_limit_new BETWEEN 1 AND 20);
UPDATE users SET daily_send_limit_new=daily_send_limit;
ALTER TABLE users DROP COLUMN daily_send_limit;
ALTER TABLE users RENAME COLUMN daily_send_limit_new TO daily_send_limit;
