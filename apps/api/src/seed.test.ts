import { describe, expect, it } from 'vitest';
import { createInMemoryUserRepository } from './repositories/userRepository';
import { hashPassword, verifyPassword } from './security/passwords';
import { seedUsers } from './seed';

const demoUsers = [{ email: 'ada@example.com', password: 'correct horse' }];
const fastHash = (password: string) => hashPassword(password, 4);

describe('seedUsers', () => {
  it('stores each demo user with a hashed password', async () => {
    const users = createInMemoryUserRepository();

    await seedUsers(users, demoUsers, fastHash);

    const ada = await users.findByEmail('ada@example.com');
    expect(ada?.passwordHash).not.toBe('correct horse');
    expect(await verifyPassword('correct horse', ada?.passwordHash ?? '')).toBe(true);
  });

  it('keeps existing user ids when re-run, so tasks stay attached', async () => {
    const users = createInMemoryUserRepository();

    await seedUsers(users, demoUsers, fastHash);
    const firstId = (await users.findByEmail('ada@example.com'))?.id;
    await seedUsers(users, demoUsers, fastHash);

    expect((await users.findByEmail('ada@example.com'))?.id).toBe(firstId);
  });
});
