import type { User } from '../domain/user';

export interface UserRepository {
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  save(user: User): Promise<User>;
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const createInMemoryUserRepository = (seed: User[] = []): UserRepository => {
  const usersById = new Map(seed.map((user) => [user.id, { ...user }]));

  return {
    findByEmail: async (email) => {
      const user = [...usersById.values()].find(
        (candidate) => normaliseEmail(candidate.email) === normaliseEmail(email),
      );
      return user && { ...user };
    },
    findById: async (id) => {
      const user = usersById.get(id);
      return user && { ...user };
    },
    save: async (user) => {
      usersById.set(user.id, { ...user });
      return { ...user };
    },
  };
};
