import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { Config } from '../config';
import { SCHEMA } from './schema';

export type Queryable = Pick<pg.ClientBase, 'query'>;

type DatabaseConfig = Pick<
  Config,
  'databaseUrl' | 'databaseSsl' | 'databaseSslCaFile' | 'dbPoolMax'
>;

// Every wait is bounded so a stalled or failing-over database surfaces as an error, not a hang.
const CONNECTION_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 30_000;
const STATEMENT_TIMEOUT_MS = 10_000;
// Client-side backstop, longer than the server-side limit, for when the server never answers.
const QUERY_TIMEOUT_MS = 15_000;

const sslOptions = (
  { databaseSsl, databaseSslCaFile }: DatabaseConfig,
  readCa: (path: string) => string,
): pg.PoolConfig['ssl'] => {
  if (databaseSsl === 'disable') return false;
  if (databaseSsl === 'require') return { rejectUnauthorized: false };
  return {
    rejectUnauthorized: true,
    ...(databaseSslCaFile ? { ca: readCa(databaseSslCaFile) } : {}),
  };
};

export const poolOptions = (
  config: DatabaseConfig,
  readCa: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): pg.PoolConfig => ({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: IDLE_TIMEOUT_MS,
  statement_timeout: STATEMENT_TIMEOUT_MS,
  query_timeout: QUERY_TIMEOUT_MS,
  ssl: sslOptions(config, readCa),
});

// pg emits 'error' when the server drops a connection idling in the pool (restart, failover).
// Unhandled, that event kills the process, so a handler is required, not optional.
export const createPool = (
  options: pg.PoolConfig,
  onIdleClientError: (error: Error) => void,
): pg.Pool => new pg.Pool(options).on('error', onIdleClientError);

export const migrate = async (pool: pg.Pool): Promise<void> => {
  await pool.query(SCHEMA);
};

export const withTransaction = async <T>(
  pool: pg.Pool,
  work: (client: Queryable) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
