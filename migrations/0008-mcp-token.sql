ALTER TABLE users ADD COLUMN mcp_token_digest TEXT;
CREATE UNIQUE INDEX users_mcp_token ON users(mcp_token_digest) WHERE mcp_token_digest IS NOT NULL;
