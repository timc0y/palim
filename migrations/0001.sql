PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  destination TEXT,
  destination_version TEXT NOT NULL DEFAULT '',
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  hash TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_states (
  hash TEXT PRIMARY KEY,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE challenges (
  owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  generation TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('document','image')),
  filename TEXT NOT NULL,
  type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes > 0),
  object_key TEXT NOT NULL UNIQUE,
  generated INTEGER NOT NULL CHECK(generated IN (0,1)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX artifacts_owner_expiry ON artifacts(owner,expires_at);
CREATE INDEX artifacts_expiry ON artifacts(expires_at);
CREATE TABLE operations (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('render','upload')),
  created_at INTEGER NOT NULL
);
CREATE INDEX operations_owner_day ON operations(owner,kind,created_at);
CREATE INDEX operations_day ON operations(kind,created_at);
CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  send_key TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('document','challenge')),
  artifact_id TEXT,
  sha256 TEXT NOT NULL,
  destination_hash TEXT NOT NULL,
  destination_mask TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('submitting','submitted','rejected','unknown')),
  provider_id TEXT,
  error_code TEXT,
  resend_of TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner,send_key)
);
CREATE INDEX deliveries_owner_date ON deliveries(owner,created_at);
CREATE INDEX deliveries_date ON deliveries(created_at);
CREATE INDEX deliveries_destination ON deliveries(destination_hash,purpose,created_at);
CREATE INDEX deliveries_provider ON deliveries(provider_id);
