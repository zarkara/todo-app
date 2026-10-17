// Idempotent, so it runs on every start; replace with versioned migrations once the schema evolves.
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    completed   BOOLEAN NOT NULL DEFAULT FALSE,
    position    INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tasks_user_position_idx ON tasks (user_id, position);
`;
