import { beforeEach, describe, expect, it } from 'vitest';
import { EmailTakenError } from '../domain/errors';
import type { User } from '../domain/user';
import type { UserRepository } from './userRepository';

const ada: User = { id: 'ada', email: 'ada@example.com', passwordHash: 'hash-1' };

// Behaviour every UserRepository adapter must honour; run it against each implementation.
export const describeUserRepository = (
  name: string,
  createRepository: (seed: User[]) => UserRepository | Promise<UserRepository>,
) =>
  describe(`${name} (UserRepository contract)`, () => {
    let repository: UserRepository;

    beforeEach(async () => {
      repository = await createRepository([ada]);
    });

    describe('findByEmail', () => {
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

    describe('findById', () => {
      it('finds a user by id', async () => {
        expect(await repository.findById('ada')).toEqual(ada);
      });

      it('returns undefined for an unknown id', async () => {
        expect(await repository.findById('nobody')).toBeUndefined();
      });
    });

    describe('create', () => {
      it('inserts a new user', async () => {
        const grace: User = { id: 'grace', email: 'grace@example.com', passwordHash: 'hash-2' };

        expect(await repository.create(grace)).toEqual(grace);
        expect(await repository.findById('grace')).toEqual(grace);
      });

      it('refuses an email that is already taken, in any letter case, and keeps the existing user', async () => {
        const impostor: User = { id: 'impostor', email: 'ADA@example.com', passwordHash: 'hash-3' };

        await expect(repository.create(impostor)).rejects.toBeInstanceOf(EmailTakenError);
        expect(await repository.findByEmail('ada@example.com')).toEqual(ada);
        expect(await repository.findById('impostor')).toBeUndefined();
      });

      it('lets only one of two simultaneous sign-ups for the same email succeed', async () => {
        const results = await Promise.allSettled(
          ['first', 'second'].map((id) =>
            repository.create({ id, email: 'race@example.com', passwordHash: id }),
          ),
        );

        expect(results.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
      });

      it('treats a + suffix as a different address', async () => {
        const plus: User = { id: 'ada-1', email: 'ada+1@example.com', passwordHash: 'hash-4' };

        expect(await repository.create(plus)).toEqual(plus);
      });
    });

    describe('save', () => {
      it('inserts a new user', async () => {
        const grace: User = { id: 'grace', email: 'grace@example.com', passwordHash: 'hash-2' };

        expect(await repository.save(grace)).toEqual(grace);
        expect(await repository.findByEmail('grace@example.com')).toEqual(grace);
      });

      it('replaces the user with the same id, so seeding can be re-run safely', async () => {
        await repository.save({ ...ada, passwordHash: 'rotated' });

        expect((await repository.findByEmail('ada@example.com'))?.passwordHash).toBe('rotated');
      });
    });
  });
