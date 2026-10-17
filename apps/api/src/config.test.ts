import { describe, expect, it } from 'vitest';
import { KNOWN_DEVELOPMENT_SECRETS, loadConfig } from './config';

const SECRET = 'a'.repeat(32);
const minimalEnv = { DATABASE_URL: 'postgres://todo:todo@db:5432/todo', JWT_SECRET: SECRET };

describe('loadConfig', () => {
  it('applies defaults for optional settings', () => {
    expect(loadConfig(minimalEnv)).toEqual({
      environment: 'development',
      port: 4000,
      databaseUrl: 'postgres://todo:todo@db:5432/todo',
      databaseSsl: 'disable',
      databaseSslCaFile: null,
      dbPoolMax: 10,
      jwtSecret: SECRET,
      tokenTtlSeconds: 28_800,
      trustProxyHops: 0,
      demoUsers: [],
    });
  });

  it('parses explicit settings', () => {
    const config = loadConfig({
      ...minimalEnv,
      PORT: '8081',
      TOKEN_TTL_SECONDS: '60',
      TRUST_PROXY_HOPS: '1',
      DATABASE_SSL: 'verify-full',
      DATABASE_SSL_CA_FILE: '/etc/ssl/rds-ca.pem',
      DB_POOL_MAX: '20',
      DEMO_USERS: 'ada@example.com:pass:word, grace@example.com:secret',
    });

    expect(config).toMatchObject({
      port: 8081,
      tokenTtlSeconds: 60,
      trustProxyHops: 1,
      databaseSsl: 'verify-full',
      databaseSslCaFile: '/etc/ssl/rds-ca.pem',
      dbPoolMax: 20,
      demoUsers: [
        { email: 'ada@example.com', password: 'pass:word' },
        { email: 'grace@example.com', password: 'secret' },
      ],
    });
  });

  it.each([
    ['DATABASE_URL is missing', { JWT_SECRET: SECRET }, /DATABASE_URL/],
    ['JWT_SECRET is too short', { ...minimalEnv, JWT_SECRET: 'short' }, /JWT_SECRET/],
    ['PORT is not a number', { ...minimalEnv, PORT: 'http' }, /PORT/],
    [
      'a demo user lacks a password',
      { ...minimalEnv, DEMO_USERS: 'ada@example.com' },
      /DEMO_USERS/,
    ],
  ])('fails fast with a named setting when %s', (_label, env, message) => {
    expect(() => loadConfig(env)).toThrow(message);
  });

  describe('in production', () => {
    const production = {
      ...minimalEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'p'.repeat(48),
      DATABASE_SSL: 'verify-full',
    };

    it('accepts a unique secret, no demo users and verified database TLS', () => {
      expect(loadConfig(production)).toMatchObject({ environment: 'production', demoUsers: [] });
    });

    it.each(KNOWN_DEVELOPMENT_SECRETS)('refuses the published development secret %j', (secret) => {
      expect(() => loadConfig({ ...production, JWT_SECRET: secret })).toThrow(
        /JWT_SECRET: .*development secret/,
      );
    });

    it('refuses demo users', () => {
      expect(() =>
        loadConfig({ ...production, DEMO_USERS: 'demo@example.com:password123' }),
      ).toThrow(/DEMO_USERS: .*not allowed in production/);
    });

    it('refuses unencrypted database connections', () => {
      expect(() => loadConfig({ ...production, DATABASE_SSL: 'disable' })).toThrow(
        /DATABASE_SSL: .*require or verify-full/,
      );
    });

    it('reports every violation at once', () => {
      expect(() =>
        loadConfig({
          ...production,
          JWT_SECRET: KNOWN_DEVELOPMENT_SECRETS[0],
          DEMO_USERS: 'demo@example.com:password123',
          DATABASE_SSL: 'disable',
        }),
      ).toThrow(/JWT_SECRET.*DEMO_USERS.*DATABASE_SSL/);
    });
  });

  it('rejects an unknown DATABASE_SSL mode', () => {
    expect(() => loadConfig({ ...minimalEnv, DATABASE_SSL: 'maybe' })).toThrow(/DATABASE_SSL/);
  });
});
