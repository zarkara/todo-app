import pg from 'pg';

// Vitest global setup: integration suites get their own database, so they never write into the
// development stack's data. Creating it is idempotent.
export default async function createIntegrationDatabase() {
  const target = new URL(String(process.env.DATABASE_URL));
  const name = target.pathname.slice(1);
  const admin = new URL(target);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
  } finally {
    await client.end();
  }
}
