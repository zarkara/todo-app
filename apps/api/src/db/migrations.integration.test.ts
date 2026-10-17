import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from './database';
import { MIGRATIONS, runMigrations } from './migrations';

// A private schema isolates these destructive tests from suites running in parallel.
const SCHEMA = 'migration_test';
const pool = createPool(
  {
    connectionString: String(process.env.DATABASE_URL),
    options: `-c search_path=${SCHEMA}`,
    max: 5,
  },
  () => {},
);
const ALL_VERSIONS = MIGRATIONS.map(({ version }) => version);

const tableNames = async () =>
  (
    await pool.query<{ name: string }>(
      'SELECT tablename AS name FROM pg_tables WHERE schemaname = $1 ORDER BY tablename',
      [SCHEMA],
    )
  ).rows.map(({ name }) => name);

beforeEach(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.query(`CREATE SCHEMA ${SCHEMA}`);
});
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.end();
});

describe('runMigrations', () => {
  it('applies every migration to an empty database and records it', async () => {
    expect(await runMigrations(pool)).toEqual(ALL_VERSIONS);
    expect(await tableNames()).toEqual(['schema_migrations', 'tasks', 'users']);
  });

  it('is idempotent: a second run applies nothing', async () => {
    await runMigrations(pool);

    expect(await runMigrations(pool)).toEqual([]);
  });

  it('is safe when several instances start at once: exactly one applies each migration', async () => {
    const results = await Promise.all([1, 2, 3].map(() => runMigrations(pool)));

    expect(results.flat().toSorted()).toEqual(ALL_VERSIONS);
    expect(results.filter((applied) => applied.length > 0)).toHaveLength(1);
  });

  it('adopts a database created before migrations were versioned, keeping its data', async () => {
    await pool.query(String(MIGRATIONS[0]?.sql));
    await pool.query(
      "INSERT INTO users (id, email, password_hash) VALUES ('legacy', 'legacy@example.com', 'x')",
    );

    expect(await runMigrations(pool)).toEqual(ALL_VERSIONS);
    expect((await pool.query('SELECT id FROM users')).rows).toEqual([{ id: 'legacy' }]);
  });
});
