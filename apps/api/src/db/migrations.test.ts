import { describe, expect, it } from 'vitest';
import { describeMigrationResult, MIGRATIONS, pendingMigrations } from './migrations';

const migration = (version: number) => ({ version, name: `m${version}`, sql: 'SELECT 1' });

describe('pendingMigrations', () => {
  it('returns unapplied migrations in ascending version order', () => {
    const migrations = [migration(3), migration(1), migration(2)];

    expect(pendingMigrations(migrations, new Set([1])).map(({ version }) => version)).toEqual([
      2, 3,
    ]);
  });

  it('returns nothing when every migration is applied', () => {
    expect(pendingMigrations([migration(1)], new Set([1]))).toEqual([]);
  });

  it('refuses a migration list with duplicate versions', () => {
    expect(() => pendingMigrations([migration(1), migration(1)], new Set())).toThrow(
      /duplicate migration version 1/,
    );
  });
});

describe('MIGRATIONS', () => {
  it('has unique, positive, contiguous versions starting at 1', () => {
    expect(MIGRATIONS.map(({ version }) => version)).toEqual(
      MIGRATIONS.map((_, index) => index + 1),
    );
  });
});

describe('describeMigrationResult', () => {
  it.each([
    [[], 'Database schema is up to date'],
    [[1, 2], 'Applied database migrations: 1, 2'],
  ])('describes %j for the deploy log', (applied, message) => {
    expect(describeMigrationResult(applied)).toBe(message);
  });
});
