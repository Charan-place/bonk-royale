-- Optional Google sign-in. google_sub is Google's stable account id (never the email).
ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN linked_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN prefs TEXT NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX idx_users_google ON users (google_sub) WHERE google_sub IS NOT NULL;

-- One account can be signed in on many devices; each device has its own token (hash stored).
CREATE TABLE devices (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_devices_user ON devices (user_id);
