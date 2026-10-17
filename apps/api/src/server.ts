import { randomUUID } from 'node:crypto';
import { buildApp } from './app';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { createPool, poolOptions } from './db/database';
import { describeMigrationResult, runMigrations } from './db/migrations';
import { createPostgresTaskRepository } from './repositories/postgresTaskRepository';
import { createPostgresUserRepository } from './repositories/postgresUserRepository';
import { seedUsers } from './seed';
import { createTokenService } from './security/tokens';
import { createAuthService } from './services/authService';
import { createTaskService } from './services/taskService';

const describe = (error: unknown) =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

const writeError = (error: unknown) => process.stderr.write(`${describe(error)}\n`);

const start = async () => {
  const config = loadConfig(process.env);
  const pool = createPool(poolOptions(config), writeError);
  if (config.migrateOnStart) {
    process.stdout.write(`${describeMigrationResult(await runMigrations(pool))}\n`);
  }

  const users = createPostgresUserRepository(pool);
  await seedUsers(users, config.demoUsers);

  const tokens = createTokenService({
    secret: config.jwtSecret,
    ttlSeconds: config.tokenTtlSeconds,
    clock: systemClock,
  });
  const app = buildApp({
    authService: createAuthService({ users, tokens }),
    taskService: createTaskService({
      tasks: createPostgresTaskRepository(pool),
      clock: systemClock,
      newId: randomUUID,
    }),
    reportError: writeError,
    checkReadiness: async () => {
      await pool.query('SELECT 1');
    },
    trustProxyHops: config.trustProxyHops,
  });

  const server = app.listen(config.port, () => {
    process.stdout.write(`API listening on port ${config.port}\n`);
  });

  const shutdown = () => {
    server.close(() => {
      pool.end().catch(writeError);
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
};

start().catch((error: unknown) => {
  writeError(error);
  process.exit(1);
});
