import { randomUUID } from 'node:crypto';
import type { DemoUser } from './config';
import type { UserRepository } from './repositories/userRepository';
import { hashPassword } from './security/passwords';

// The app has no sign-up flow, so demo accounts are upserted on every start.
export const seedUsers = async (
  users: UserRepository,
  demoUsers: DemoUser[],
  hash: (password: string) => Promise<string> = hashPassword,
): Promise<void> => {
  await Promise.all(
    demoUsers.map(async ({ email, password }) => {
      const existing = await users.findByEmail(email);
      await users.save({
        id: existing?.id ?? randomUUID(),
        email,
        passwordHash: await hash(password),
      });
    }),
  );
};
