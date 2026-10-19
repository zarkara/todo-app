import type { NewTask, Task } from '@todo/shared';
import { http, HttpResponse } from 'msw';

// A small in-memory stand-in for the REST API, so page tests exercise real request flows.

export const API_URL = new URL('/api', window.location.href).href;
export const PASSWORD = 'secret';

const USERS = [
  { id: 'ada', email: 'ada@example.com' },
  { id: 'grace', email: 'grace@example.com' },
];

export const tokenFor = (userId: string) => `token-${userId}`;

export const aTask = (overrides: Partial<Task> & Pick<Task, 'id'>): Task => ({
  userId: 'ada',
  title: `Task ${overrides.id}`,
  description: '',
  completed: false,
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

// JSON bodies omit absent fields rather than sending undefined.
type PatchBody = Partial<Pick<Task, 'title' | 'description' | 'completed'>>;

const errorResponse = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });

export const createFakeApi = (seed: Task[] = []) => {
  let tasks = [...seed];
  let createdCount = 0;

  const users = [...USERS];

  const userIdOf = (request: Request) =>
    users.find(({ id }) => request.headers.get('Authorization') === `Bearer ${tokenFor(id)}`)?.id;

  const ownTasks = (userId: string) =>
    tasks.filter((task) => task.userId === userId).toSorted((a, b) => a.position - b.position);

  const withUser =
    (handle: (userId: string, request: Request, id: string) => Promise<Response> | Response) =>
    ({ request, params }: { request: Request; params: Record<string, unknown> }) => {
      const userId = userIdOf(request);
      if (!userId) return errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
      return handle(userId, request, String(params.id));
    };

  const findOwn = (userId: string, id: string) =>
    tasks.find((task) => task.id === id && task.userId === userId);

  const notFound = () => errorResponse(404, 'NOT_FOUND', 'Task not found');

  const handlers = [
    http.post(`${API_URL}/auth/login`, async ({ request }) => {
      const { email, password } = (await request.json()) as { email: string; password: string };
      const user = users.find((candidate) => candidate.email === email);
      return user && password === PASSWORD
        ? HttpResponse.json({ token: tokenFor(user.id), user })
        : errorResponse(401, 'UNAUTHORIZED', 'Invalid email or password');
    }),
    http.post(`${API_URL}/auth/register`, async ({ request }) => {
      const { email } = (await request.json()) as { email: string };
      if (users.some((candidate) => candidate.email === email)) {
        return errorResponse(409, 'EMAIL_TAKEN', 'An account with this email already exists');
      }
      const user = { id: `user-${users.length + 1}`, email };
      users.push(user);
      return HttpResponse.json({ token: tokenFor(user.id), user }, { status: 201 });
    }),
    http.get(
      `${API_URL}/tasks`,
      withUser((userId, request) => {
        const query = (new URL(request.url).searchParams.get('q') ?? '').toLowerCase();
        return HttpResponse.json(
          ownTasks(userId).filter(({ title, description }) =>
            `${title} ${description}`.toLowerCase().includes(query),
          ),
        );
      }),
    ),
    http.post(
      `${API_URL}/tasks`,
      withUser(async (userId, request) => {
        const { title, description = '' } = (await request.json()) as NewTask;
        const position = ownTasks(userId).length;
        const created = aTask({
          id: `new-${++createdCount}`,
          userId,
          title,
          description,
          position,
        });
        tasks = [...tasks, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    ),
    http.put(
      `${API_URL}/tasks/order`,
      withUser(async (userId, request) => {
        const { ids } = (await request.json()) as { ids: string[] };
        const current = ownTasks(userId);
        const isPermutation =
          ids.length === current.length && current.every(({ id }) => ids.includes(id));
        if (!isPermutation) {
          return errorResponse(400, 'VALIDATION', 'ids must list each of your tasks exactly once');
        }
        tasks = tasks.map((task) =>
          task.userId === userId ? { ...task, position: ids.indexOf(task.id) } : task,
        );
        return HttpResponse.json(ownTasks(userId));
      }),
    ),
    http.get(
      `${API_URL}/tasks/:id`,
      withUser((userId, _request, id) => {
        const task = findOwn(userId, id);
        return task ? HttpResponse.json(task) : notFound();
      }),
    ),
    http.patch(
      `${API_URL}/tasks/:id`,
      withUser(async (userId, request, id) => {
        const task = findOwn(userId, id);
        if (!task) return notFound();
        const updated = { ...task, ...((await request.json()) as PatchBody) };
        tasks = tasks.map((candidate) => (candidate.id === id ? updated : candidate));
        return HttpResponse.json(updated);
      }),
    ),
    http.delete(
      `${API_URL}/tasks/:id`,
      withUser((userId, _request, id) => {
        if (!findOwn(userId, id)) return notFound();
        tasks = tasks.filter((task) => task.id !== id);
        return new HttpResponse(null, { status: 204 });
      }),
    ),
  ];

  return { handlers, tasksOf: ownTasks };
};
