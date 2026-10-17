import { beforeEach, describe, expect, it } from 'vitest';
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
