import bcrypt from 'bcryptjs';

const DEFAULT_COST = 12;

export const hashPassword = (password: string, cost = DEFAULT_COST): Promise<string> =>
  bcrypt.hash(password, cost);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);
