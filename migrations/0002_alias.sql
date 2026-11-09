-- Optional player-chosen display name (validated server-side). Empty = use the generated name.
ALTER TABLE users ADD COLUMN alias TEXT NOT NULL DEFAULT '';
