-- Operator-managed per-account allowance. Existing users keep three sends;
-- shared daily/monthly mail budgets and historical attempts remain authoritative.
ALTER TABLE users ADD COLUMN daily_send_limit INTEGER NOT NULL DEFAULT 3
  CHECK(daily_send_limit BETWEEN 1 AND 10);
