import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../domain/errors';
import { createTokenService } from './tokens';

const SECRET = 'test-secret-that-is-long-enough-for-hs256';
const ISSUED_AT = new Date('2026-03-01T12:00:00.000Z');
const TTL_SECONDS = 3600;

const tokenServiceAt = (now: Date, secret = SECRET) =>
  createTokenService({ secret, ttlSeconds: TTL_SECONDS, clock: () => now });

describe('tokenService', () => {
  const token = tokenServiceAt(ISSUED_AT).issue('ada');

  it('verifies its own token and returns the user id', () => {
    expect(tokenServiceAt(ISSUED_AT).verify(token)).toEqual({ userId: 'ada' });
  });

  it('accepts the token until it expires', () => {
    const justBeforeExpiry = new Date(ISSUED_AT.getTime() + (TTL_SECONDS - 1) * 1000);

    expect(tokenServiceAt(justBeforeExpiry).verify(token)).toEqual({ userId: 'ada' });
  });

  it('rejects an expired token', () => {
    const afterExpiry = new Date(ISSUED_AT.getTime() + (TTL_SECONDS + 1) * 1000);

    expect(() => tokenServiceAt(afterExpiry).verify(token)).toThrow(UnauthorizedError);
  });

  it('rejects a token signed with a different secret', () => {
    const forged = tokenServiceAt(ISSUED_AT, 'another-secret-entirely-of-similar-length').issue(
      'ada',
    );

    expect(() => tokenServiceAt(ISSUED_AT).verify(forged)).toThrow(UnauthorizedError);
  });

  it('rejects an unsigned token', () => {
    const unsigned = jwt.sign({ sub: 'ada' }, '', { algorithm: 'none' });

    expect(() => tokenServiceAt(ISSUED_AT).verify(unsigned)).toThrow(UnauthorizedError);
  });

  it('rejects a token without a subject', () => {
    const anonymous = jwt.sign({}, SECRET, { algorithm: 'HS256' });

    expect(() => tokenServiceAt(ISSUED_AT).verify(anonymous)).toThrow(UnauthorizedError);
  });

  it('rejects garbage', () => {
    expect(() => tokenServiceAt(ISSUED_AT).verify('not-a-token')).toThrow(UnauthorizedError);
  });
});
