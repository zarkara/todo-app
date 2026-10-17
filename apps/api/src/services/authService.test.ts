import { beforeAll, describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../domain/errors';
import { createInMemoryUserRepository } from '../repositories/userRepository';
import { hashPassword } from '../security/passwords';
import { createTokenService, type TokenService } from '../security/tokens';
import { type AuthService, createAuthService } from './authService';

const PASSWORD = 'correct horse';

describe('authService', () => {
  let service: AuthService;
  let tokens: TokenService;

  beforeAll(async () => {
    const users = createInMemoryUserRepository([
      { id: 'ada', email: 'ada@example.com', passwordHash: await hashPassword(PASSWORD, 4) },
    ]);
    tokens = createTokenService({
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
      await expect(service.authenticate(token)).resolves.toEqual({ userId: 'ada' });
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
    it('rejects an invalid token', async () => {
      await expect(service.authenticate('not-a-token')).rejects.toThrow(UnauthorizedError);
    });

    it('rejects a valid token whose user no longer exists', async () => {
      await expect(service.authenticate(tokens.issue('deleted-user'))).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });
});
