import type { User } from '../domain/user';

export interface UserRepository {
  findByEmail(email: string): Promise<User | undefined>;
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const createInMemoryUserRepository = (seed: User[] = []): UserRepository => {
  const usersByEmail = new Map(seed.map((user) => [normaliseEmail(user.email), user]));

  return {
    findByEmail: async (email) => usersByEmail.get(normaliseEmail(email)),
  };
};
