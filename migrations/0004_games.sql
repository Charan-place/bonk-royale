-- Bonk Games: per-game best scores (all-time + today) and per-game saved progress.
CREATE TABLE scores (
  game       TEXT    NOT NULL,
  user_id    INTEGER NOT NULL,
  best       INTEGER NOT NULL DEFAULT 0,
  plays      INTEGER NOT NULL DEFAULT 0,
  day        TEXT    NOT NULL DEFAULT '',
  day_best   INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (game, user_id)
);
CREATE INDEX idx_scores_best ON scores (game, best DESC);
CREATE INDEX idx_scores_day ON scores (game, day, day_best DESC);

CREATE TABLE game_saves (
  user_id    INTEGER NOT NULL,
  game       TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game)
);
