import { loadConfig } from './config';
import { createPool, poolOptions } from './db/database';
import { describeMigrationResult, runMigrations } from './db/migrations';

// One-off deploy step: `node migrate.cjs` before rolling out a release with MIGRATE_ON_START=false.
const writeError = (error: unknown) =>
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );

const migrate = async () => {
  const pool = createPool(poolOptions(loadConfig(process.env)), writeError);
  try {
    process.stdout.write(`${describeMigrationResult(await runMigrations(pool))}\n`);
  } finally {
    await pool.end();
  }
};

migrate().catch((error: unknown) => {
  writeError(error);
  process.exit(1);
});
