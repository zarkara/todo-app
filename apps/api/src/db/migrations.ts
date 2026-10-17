import type pg from 'pg';
import { withTransaction } from './database';
import { SCHEMA } from './schema';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Append only: never edit or reorder a migration once it has shipped.
export const MIGRATIONS: readonly Migration[] = [
  // Baseline. Its IF NOT EXISTS statements let databases created before versioning adopt it.
  { version: 1, name: 'create users and tasks', sql: SCHEMA },
];

// Arbitrary but fixed: every instance contends for the same advisory lock.
const MIGRATION_LOCK_KEY = 7_215_001;

export const pendingMigrations = (
  migrations: readonly Migration[],
  appliedVersions: ReadonlySet<number>,
): Migration[] => {
  const duplicate = migrations.find(
    ({ version }, index) => migrations.findIndex((other) => other.version === version) !== index,
  );
  if (duplicate) throw new Error(`duplicate migration version ${duplicate.version}`);

  return migrations
    .filter(({ version }) => !appliedVersions.has(version))
    .toSorted((a, b) => a.version - b.version);
};

// Idempotent and safe under concurrency: the transaction-scoped lock serialises instances, and
// each one applies only what the previous ones have not. Returns the versions it applied.
export const runMigrations = (
  pool: pg.Pool,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<number[]> =>
  withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: number }>(
      'SELECT version FROM schema_migrations',
    );
    const pending = pendingMigrations(migrations, new Set(rows.map(({ version }) => version)));

    // Sequential on purpose: each migration may depend on the one before it.
    for (const { version, name, sql } of pending) {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
        version,
        name,
      ]);
    }
    return pending.map(({ version }) => version);
  });

export const describeMigrationResult = (applied: readonly number[]): string =>
  applied.length === 0
    ? 'Database schema is up to date'
    : `Applied database migrations: ${applied.join(', ')}`;
