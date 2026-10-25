-- Additive migration: preserve saved addresses, defaults and historical delivery evidence.
-- Legacy confirmed_at/challenges data is retained for audit, never used by current delivery.
ALTER TABLE users ADD COLUMN sender_alias TEXT CHECK(sender_alias IS NULL OR (length(sender_alias)=32 AND sender_alias NOT GLOB '*[^0-9a-f]*'));
CREATE UNIQUE INDEX users_sender_alias ON users(sender_alias) WHERE sender_alias IS NOT NULL;
ALTER TABLE deliveries ADD COLUMN sender TEXT;
