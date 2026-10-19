import { z } from 'zod';

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_QUERY_LENGTH = 200;
export const MIN_PASSWORD_LENGTH = 8;
// NIST SP 800-63B: at least 8, and allow at least 64 so people can use passphrases.
export const MAX_PASSWORD_LENGTH = 64;
// bcrypt only uses the first 72 bytes; refuse longer input instead of silently ignoring the rest.
const MAX_PASSWORD_BYTES = 72;

const title = z.string().trim().min(1, 'Title is required').max(MAX_TITLE_LENGTH);
const description = z.string().trim().max(MAX_DESCRIPTION_LENGTH);

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const passwordRule = `Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, passwordRule)
    .max(MAX_PASSWORD_LENGTH, passwordRule)
    .refine(
      (password) => new TextEncoder().encode(password).length <= MAX_PASSWORD_BYTES,
      'Too long: use fewer accented letters, symbols or emoji',
    ),
});

export const createTaskSchema = z.object({
  title,
  description: description.optional(),
});

export const updateTaskSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    completed: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Provide at least one field to update');

export const reorderTasksSchema = z.object({
  ids: z.array(z.string().min(1)),
});

export const listTasksQuerySchema = z.object({
  q: z.string().trim().max(MAX_QUERY_LENGTH).default(''),
});

export const taskSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  description: z.string(),
  completed: z.boolean(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
});

export const authResponseSchema = z.object({
  token: z.string(),
  user: publicUserSchema,
});
