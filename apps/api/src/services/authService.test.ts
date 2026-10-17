import { beforeAll, describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../domain/errors';
import { createInMemoryUserRepository } from '../repositories/userRepository';
import { hashPassword } from '../security/passwords';
import { createTokenService } from '../security/tokens';
import { type AuthService, createAuthService } from './authService';

const PASSWORD = 'correct horse';

describe('authService', () => {
  let service: AuthService;

  beforeAll(async () => {
    const users = createInMemoryUserRepository([
      { id: 'ada', email: 'ada@example.com', passwordHash: await hashPassword(PASSWORD, 4) },
    ]);
    const tokens = createTokenService({
      secret: 'test-secret-that-is-long-enough-for-hs256',
      ttlSeconds: 3600,
      clock: () => new Date(),
    });
    service = createAuthService({ users, tokens });
  });

  describe('login', () => {
    it('returns a token and the public user for valid credentials', async () => {
      const { token, user } = await service.login({ email: 'ada@example.com', password: PASSWORD });

      expect(user).toEqual({ id: 'ada', email: 'ada@example.com' });
      expect(service.authenticate(token)).toEqual({ userId: 'ada' });
    });

    it('never exposes the password hash', async () => {
      const { user } = await service.login({ email: 'ada@example.com', password: PASSWORD });

      expect(user).not.toHaveProperty('passwordHash');
    });

    it.each([
      ['a wrong password', { email: 'ada@example.com', password: 'guess' }],
      ['an unknown email', { email: 'nobody@example.com', password: PASSWORD }],
    ])('rejects %s with the same generic error', async (_label, credentials) => {
      await expect(service.login(credentials)).rejects.toThrow(
        new UnauthorizedError('Invalid email or password'),
      );
    });
  });

  describe('authenticate', () => {
    it('rejects an invalid token', () => {
      expect(() => service.authenticate('not-a-token')).toThrow(UnauthorizedError);
    });
  });
});
