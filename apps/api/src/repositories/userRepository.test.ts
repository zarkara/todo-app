import { describe, expect, it } from 'vitest';
import type { User } from '../domain/user';
import { createInMemoryUserRepository } from './userRepository';

const ada: User = { id: 'ada', email: 'ada@example.com', passwordHash: 'hash' };

describe('InMemoryUserRepository', () => {
  const repository = createInMemoryUserRepository([ada]);

  it('finds a user by email', async () => {
    expect(await repository.findByEmail('ada@example.com')).toEqual(ada);
  });

  it('matches email addresses case-insensitively', async () => {
    expect(await repository.findByEmail('ADA@Example.com')).toEqual(ada);
  });

  it('returns undefined for an unknown email', async () => {
    expect(await repository.findByEmail('grace@example.com')).toBeUndefined();
  });
});
