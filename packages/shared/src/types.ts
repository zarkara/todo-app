import type { z } from 'zod';
import type {
  authResponseSchema,
  createTaskSchema,
  loginSchema,
  publicUserSchema,
  reorderTasksSchema,
  taskSchema,
  updateTaskSchema,
} from './schemas';

export type Credentials = z.infer<typeof loginSchema>;
export type NewTask = z.infer<typeof createTaskSchema>;
export type TaskPatch = z.infer<typeof updateTaskSchema>;
export type ReorderRequest = z.infer<typeof reorderTasksSchema>;
export type Task = z.infer<typeof taskSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
