import type { AuthResponse, Credentials } from '@todo/shared';
import { UnauthorizedError } from '../domain/errors';
import { toPublicUser } from '../domain/user';
import type { UserRepository } from '../repositories/userRepository';
import { verifyPassword } from '../security/passwords';
import type { TokenService } from '../security/tokens';

// Hash of a random throwaway value: checking unknown emails against it makes both failure
// paths cost one bcrypt comparison, so response times don't reveal which emails exist.
const TIMING_SAFE_DUMMY_HASH = '$2b$12$FP2fu2cT5L.hWCbFbl49OOCYVl7P.l5TGhG37l01mA3C0fgzqmI7i';

interface AuthServiceDependencies {
  users: UserRepository;
  tokens: TokenService;
}

export const createAuthService = ({ users, tokens }: AuthServiceDependencies) => ({
  login: async ({ email, password }: Credentials): Promise<AuthResponse> => {
    const user = await users.findByEmail(email);
    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? TIMING_SAFE_DUMMY_HASH,
    );
    if (!user || !passwordMatches) throw new UnauthorizedError('Invalid email or password');

    return { token: tokens.issue(user.id), user: toPublicUser(user) };
  },

  // A valid signature isn't enough: the account must still exist (it may have been removed).
  authenticate: async (token: string): Promise<{ userId: string }> => {
    const { userId } = tokens.verify(token);
    if (!(await users.findById(userId))) throw new UnauthorizedError('Invalid or expired token');
    return { userId };
  },
});

export type AuthService = ReturnType<typeof createAuthService>;
