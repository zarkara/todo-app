import { EmailTakenError } from '../domain/errors';
import type { User } from '../domain/user';

export interface UserRepository {
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  // Inserts a new account; rejects with EmailTakenError when the email is in use, in any case.
  create(user: User): Promise<User>;
  // Inserts or replaces by id (demo seeding).
  save(user: User): Promise<User>;
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const createInMemoryUserRepository = (seed: User[] = []): UserRepository => {
  const usersById = new Map(seed.map((user) => [user.id, { ...user }]));

  const findByEmail = (email: string) =>
    [...usersById.values()].find(
      (candidate) => normaliseEmail(candidate.email) === normaliseEmail(email),
    );

  return {
    findByEmail: async (email) => {
      const user = findByEmail(email);
      return user && { ...user };
    },
    findById: async (id) => {
      const user = usersById.get(id);
      return user && { ...user };
    },
    create: async (user) => {
      if (findByEmail(user.email)) throw new EmailTakenError();
      usersById.set(user.id, { ...user });
      return { ...user };
    },
    save: async (user) => {
      usersById.set(user.id, { ...user });
      return { ...user };
    },
  };
};
