import type pg from 'pg';
import type { User } from '../domain/user';
import type { UserRepository } from './userRepository';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

const toUser = ({ id, email, password_hash }: UserRow): User => ({
  id,
  email,
  passwordHash: password_hash,
});

export const createPostgresUserRepository = (pool: pg.Pool): UserRepository => ({
  findByEmail: async (email) => {
    const { rows } = await pool.query<UserRow>(
      'SELECT id, email, password_hash FROM users WHERE lower(email) = lower($1)',
      [email.trim()],
    );
    return rows.map(toUser)[0];
  },
  save: async (user) => {
    await pool.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash`,
      [user.id, user.email, user.passwordHash],
    );
    return { ...user };
  },
});
