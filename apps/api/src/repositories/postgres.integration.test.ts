import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPool } from '../db/database';
import { runMigrations } from '../db/migrations';
import { createPostgresTaskRepository } from './postgresTaskRepository';
import { createPostgresUserRepository } from './postgresUserRepository';
import { describeTaskRepository } from './taskRepository.contract';
import { describeUserRepository } from './userRepository.contract';

const DATABASE_URL = String(process.env.DATABASE_URL);
const pool = createPool({ connectionString: DATABASE_URL }, () => {});
const TASK_OWNER_IDS = ['ada', 'grace'];

const resetDatabase = () => pool.query('TRUNCATE tasks, users');

beforeAll(() => runMigrations(pool));
afterAll(() => pool.end());

describeUserRepository('PostgresUserRepository', async (seed) => {
  await resetDatabase();
  const repository = createPostgresUserRepository(pool);
  await Promise.all(seed.map(repository.save));
  return repository;
});

describeTaskRepository('PostgresTaskRepository', async (seed) => {
  await resetDatabase();
  const users = createPostgresUserRepository(pool);
  await Promise.all(
    TASK_OWNER_IDS.map((id) => users.save({ id, email: `${id}@example.com`, passwordHash: 'x' })),
  );
  const repository = createPostgresTaskRepository(pool);
  await repository.saveAll(seed);
  return repository;
});

describe('pool timeouts', () => {
  it('cancels a statement that runs longer than the configured statement timeout', async () => {
    const strict = createPool({ connectionString: DATABASE_URL, statement_timeout: 200 }, () => {});

    await expect(strict.query('SELECT pg_sleep(2)')).rejects.toThrow(/statement timeout/);
    await strict.end();
  });
});

describe('idle connection loss', () => {
  it('reports a connection the server terminates while idle, instead of crashing the process', async () => {
    const onIdleError = vi.fn();
    const victim = createPool({ connectionString: DATABASE_URL }, onIdleError);
    const {
      rows: [backend],
    } = await victim.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');

    await pool.query('SELECT pg_terminate_backend($1)', [backend?.pid]);

    await vi.waitFor(() => expect(onIdleError).toHaveBeenCalledOnce());
    await victim.end();
  });
});
