create table "auth_users" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);

create table "auth_sessions" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "auth_users" ("id") on delete cascade);

create table "auth_accounts" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "auth_users" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

create table "auth_verifications" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);

create table "auth_rate_limits" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "auth_sessions_userId_idx" on "auth_sessions" ("userId");

create index "auth_accounts_userId_idx" on "auth_accounts" ("userId");

create index "auth_verifications_identifier_idx" on "auth_verifications" ("identifier");

CREATE TABLE reader_destinations (
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 label TEXT NOT NULL,
 email TEXT NOT NULL,
 confirmed_at INTEGER NOT NULL,
 UNIQUE(owner,email)
);
INSERT INTO reader_destinations(id,owner,label,email,confirmed_at)
 SELECT destination_version,id,'My reader',destination,created_at FROM users WHERE destination IS NOT NULL AND destination_version<>'';
ALTER TABLE users ADD COLUMN default_destination_id TEXT REFERENCES reader_destinations(id) ON DELETE SET NULL;
UPDATE users SET default_destination_id=destination_version WHERE destination IS NOT NULL AND destination_version<>'';
ALTER TABLE users DROP COLUMN destination;
ALTER TABLE users DROP COLUMN destination_version;
ALTER TABLE challenges ADD COLUMN label TEXT NOT NULL DEFAULT 'My reader';
DROP TABLE sessions;
DROP TABLE login_states;
CREATE TABLE mail_attempts (
 id TEXT PRIMARY KEY,
 purpose TEXT NOT NULL CHECK(purpose IN ('login','document','challenge')),
 owner TEXT,
 recipient_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 dispatched INTEGER NOT NULL DEFAULT 0 CHECK(dispatched IN (0,1))
);
CREATE INDEX mail_attempts_date ON mail_attempts(created_at);
CREATE INDEX mail_attempts_recipient ON mail_attempts(recipient_hash,purpose,created_at);
INSERT INTO mail_attempts(id,purpose,owner,recipient_hash,created_at,dispatched)
 SELECT id,purpose,owner,destination_hash,created_at,1 FROM deliveries;
ALTER TABLE deliveries ADD COLUMN destination_id TEXT;
ALTER TABLE deliveries ADD COLUMN default_intent_key TEXT;
CREATE UNIQUE INDEX deliveries_default_intent ON deliveries(owner,default_intent_key);
