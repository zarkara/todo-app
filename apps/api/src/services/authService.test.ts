import { beforeAll, describe, expect, it } from 'vitest';
import { EmailTakenError, UnauthorizedError } from '../domain/errors';
import { createInMemoryUserRepository } from '../repositories/userRepository';
import { hashPassword } from '../security/passwords';
import { createTokenService, type TokenService } from '../security/tokens';
import { type AuthService, createAuthService } from './authService';

const PASSWORD = 'correct horse';

describe('authService', () => {
  let service: AuthService;
  let tokens: TokenService;
  let registered = 0;

  beforeAll(async () => {
    const users = createInMemoryUserRepository([
      { id: 'ada', email: 'ada@example.com', passwordHash: await hashPassword(PASSWORD, 4) },
    ]);
    tokens = createTokenService({
      secret: 'test-secret-that-is-long-enough-for-hs256',
      ttlSeconds: 3600,
      clock: () => new Date(),
    });
    service = createAuthService({
      users,
      tokens,
      hash: (password) => hashPassword(password, 4),
      newId: () => `user-${++registered}`,
    });
  });

  describe('register', () => {
    it('creates the account and signs the new user in', async () => {
      const { token, user } = await service.register({
        email: 'lin@example.com',
        password: 'a-new-pass',
      });

      expect(user).toEqual({ id: `user-${registered}`, email: 'lin@example.com' });
      await expect(service.authenticate(token)).resolves.toEqual({ userId: user.id });
    });

    it('stores the password so the new user can sign in with it later', async () => {
      await service.register({ email: 'kim@example.com', password: 'kims-pass' });

      const { user } = await service.login({ email: 'kim@example.com', password: 'kims-pass' });

      expect(user.email).toBe('kim@example.com');
    });

    it('refuses an email that already has an account', async () => {
      await expect(
        service.register({ email: 'ada@example.com', password: 'another-pass' }),
      ).rejects.toBeInstanceOf(EmailTakenError);
    });
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
