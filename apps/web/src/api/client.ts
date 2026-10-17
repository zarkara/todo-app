import {
  authResponseSchema,
  type Credentials,
  type NewTask,
  type TaskPatch,
  taskSchema,
} from '@todo/shared';
import { z, type ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const errorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

const tasksSchema = z.array(taskSchema);

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
}

const toApiError = async (response: Response): Promise<ApiError> => {
  const parsed = errorBodySchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return new ApiError(response.status, 'UNKNOWN', `Request failed (${response.status})`);
  }
  const { code, message, details } = parsed.data.error;
  return new ApiError(response.status, code, message, details);
};

const searchSuffix = (query: string) =>
  query.trim() ? `?${new URLSearchParams({ q: query.trim() })}` : '';

export const createApiClient = ({ baseUrl, getToken }: ApiClientOptions) => {
  const send = async (path: string, { method = 'GET', body }: RequestOptions = {}) => {
    const token = getToken();
    const response = await fetch(new URL(`${baseUrl}${path}`, window.location.href), {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
    if (!response.ok) throw await toApiError(response);
    return response;
  };

  const sendForJson = async <T>(path: string, schema: ZodType<T>, options?: RequestOptions) => {
    const response = await send(path, options);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ApiError(
        response.status,
        'INVALID_RESPONSE',
        'Unexpected response from the server',
        parsed.error.issues,
      );
    }
    return parsed.data;
  };

  const taskPath = (id: string) => `/tasks/${encodeURIComponent(id)}`;

  return {
    login: (credentials: Credentials) =>
      sendForJson('/auth/login', authResponseSchema, { method: 'POST', body: credentials }),
    listTasks: (query = '') => sendForJson(`/tasks${searchSuffix(query)}`, tasksSchema),
    getTask: (id: string) => sendForJson(taskPath(id), taskSchema),
    createTask: (input: NewTask) =>
      sendForJson('/tasks', taskSchema, { method: 'POST', body: input }),
    updateTask: (id: string, patch: TaskPatch) =>
      sendForJson(taskPath(id), taskSchema, { method: 'PATCH', body: patch }),
    deleteTask: async (id: string): Promise<void> => {
      await send(taskPath(id), { method: 'DELETE' });
    },
    reorderTasks: (ids: string[]) =>
      sendForJson('/tasks/order', tasksSchema, { method: 'PUT', body: { ids } }),
  };
};

export type ApiClient = ReturnType<typeof createApiClient>;
