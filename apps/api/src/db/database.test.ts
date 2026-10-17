import { describe, expect, it, vi } from 'vitest';
import { poolOptions } from './database';

const base = {
  databaseUrl: 'postgres://todo:todo@db:5432/todo',
  databaseSsl: 'disable' as const,
  databaseSslCaFile: null,
  dbPoolMax: 10,
};

describe('poolOptions', () => {
  it('bounds the pool and every wait, so a stalled database cannot hang requests', () => {
    expect(poolOptions(base)).toMatchObject({
      connectionString: base.databaseUrl,
      max: 10,
      connectionTimeoutMillis: expect.any(Number),
      idleTimeoutMillis: expect.any(Number),
      statement_timeout: expect.any(Number),
      query_timeout: expect.any(Number),
    });
  });

  it('keeps the client-side query timeout longer than the server-side statement timeout', () => {
    const { statement_timeout, query_timeout } = poolOptions(base);

    expect(query_timeout).toBeGreaterThan(Number(statement_timeout));
  });

  it('disables TLS only when asked to', () => {
    expect(poolOptions(base).ssl).toBe(false);
  });

  it('encrypts without verifying the server in require mode', () => {
    expect(poolOptions({ ...base, databaseSsl: 'require' }).ssl).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('verifies the server against the configured CA bundle in verify-full mode', () => {
    const readCa = vi.fn(() => 'PEM DATA');

    const options = poolOptions(
      { ...base, databaseSsl: 'verify-full', databaseSslCaFile: '/etc/ssl/rds-ca.pem' },
      readCa,
    );

    expect(options.ssl).toEqual({ rejectUnauthorized: true, ca: 'PEM DATA' });
    expect(readCa).toHaveBeenCalledWith('/etc/ssl/rds-ca.pem');
  });

  it('verifies against the system trust store when no CA bundle is given', () => {
    expect(poolOptions({ ...base, databaseSsl: 'verify-full' }).ssl).toEqual({
      rejectUnauthorized: true,
    });
  });
});
