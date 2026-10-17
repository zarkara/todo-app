import type { PublicUser } from '@todo/shared';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

export const toPublicUser = ({ id, email }: User): PublicUser => ({ id, email });
