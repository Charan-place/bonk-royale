-- Bonk Royale schema. Accounts are anonymous: a random token (hashed here) identifies the device.
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,
  token_hash  TEXT    NOT NULL UNIQUE,
  name_a      INTEGER NOT NULL,
  name_b      INTEGER NOT NULL,
  name_n      INTEGER NOT NULL,
  kind        INTEGER NOT NULL DEFAULT 0,
  col         INTEGER NOT NULL DEFAULT 0,
  hat         INTEGER NOT NULL DEFAULT 0,
  trail       INTEGER NOT NULL DEFAULT 0,
  xp          INTEGER NOT NULL DEFAULT 0,
  coins       INTEGER NOT NULL DEFAULT 0,
  capsules    INTEGER NOT NULL DEFAULT 0,
  meter       INTEGER NOT NULL DEFAULT 2,
  pity        INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,
  last_day    TEXT    NOT NULL DEFAULT '',
  gift_day    TEXT    NOT NULL DEFAULT '',
  matches     INTEGER NOT NULL DEFAULT 0,
  wins        INTEGER NOT NULL DEFAULT 0,
  kos         INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE inventory (
  user_id INTEGER NOT NULL,
  item    TEXT    NOT NULL,
  PRIMARY KEY (user_id, item)
);

-- Two rows per relationship. state: 'friend' (both), 'out' (I asked), 'in' (they asked me).
CREATE TABLE friends (
  user_id   INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  state     TEXT    NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE INDEX idx_friends_user ON friends (user_id, state);

-- "Players you met": recent opponents, so a friend request is one tap after a match.
CREATE TABLE met (
  user_id  INTEGER NOT NULL,
  other_id INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (user_id, other_id)
);
CREATE INDEX idx_met_user ON met (user_id, at DESC);
