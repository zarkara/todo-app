import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const SECRET = 'a'.repeat(32);
const minimalEnv = { DATABASE_URL: 'postgres://todo:todo@db:5432/todo', JWT_SECRET: SECRET };

describe('loadConfig', () => {
  it('applies defaults for optional settings', () => {
    expect(loadConfig(minimalEnv)).toEqual({
      port: 4000,
      databaseUrl: 'postgres://todo:todo@db:5432/todo',
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
      DEMO_USERS: 'ada@example.com:pass:word, grace@example.com:secret',
    });

    expect(config).toMatchObject({
      port: 8081,
      tokenTtlSeconds: 60,
      trustProxyHops: 1,
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
});
