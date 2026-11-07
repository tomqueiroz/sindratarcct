-- 001_init.sql — todos demo table (libsql / SQLite dialect)
-- Matches apps/server/db/schema.ts and apps/server/services/todos.ts.
CREATE TABLE IF NOT EXISTS todos (
  id        TEXT    PRIMARY KEY,
  userId    TEXT    NOT NULL,
  title     TEXT    NOT NULL,
  done      INTEGER NOT NULL DEFAULT 0,            -- boolean as 0/1
  createdAt TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_todos_userId ON todos (userId);
