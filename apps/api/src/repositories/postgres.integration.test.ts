import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate } from '../db/database';
import { createPostgresTaskRepository } from './postgresTaskRepository';
import { createPostgresUserRepository } from './postgresUserRepository';
import { describeTaskRepository } from './taskRepository.contract';
import { describeUserRepository } from './userRepository.contract';

const pool = createPool(String(process.env.DATABASE_URL));
const TASK_OWNER_IDS = ['ada', 'grace'];

const resetDatabase = () => pool.query('TRUNCATE tasks, users');

beforeAll(() => migrate(pool));
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

describe('migrate', () => {
  it('can be re-run safely on an existing schema', async () => {
    await expect(migrate(pool)).resolves.toBeUndefined();
  });
});
