-- Counter table with a single row
CREATE TABLE IF NOT EXISTS counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value INTEGER NOT NULL DEFAULT 0
);

-- Seed the row (idempotent)
INSERT OR IGNORE INTO counter (id, value) VALUES (1, 0);
