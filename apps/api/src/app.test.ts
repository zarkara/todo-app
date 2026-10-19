import type { Task } from '@todo/shared';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AppDependencies, buildApp } from './app';
import { createInMemoryTaskRepository } from './repositories/taskRepository';
import { createInMemoryUserRepository } from './repositories/userRepository';
import { hashPassword } from './security/passwords';
import { createTokenService } from './security/tokens';
import { createAuthService } from './services/authService';
import { createTaskService } from './services/taskService';

const PASSWORD = 'correct horse';
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD, 4);
});

const tokens = createTokenService({
  secret: 'test-secret-that-is-long-enough-for-hs256',
  ttlSeconds: 3600,
  clock: () => new Date(),
});

const buildTestApp = (overrides: Partial<AppDependencies> = {}) => {
  let nextId = 0;
  const users = createInMemoryUserRepository([
    { id: 'ada', email: 'ada@example.com', passwordHash },
    { id: 'grace', email: 'grace@example.com', passwordHash },
  ]);
  return buildApp({
    authService: createAuthService({ users, tokens }),
    taskService: createTaskService({
      tasks: createInMemoryTaskRepository(),
      clock: () => new Date('2026-03-01T12:00:00.000Z'),
      newId: () => `task-${++nextId}`,
    }),
    reportError: vi.fn(),
    ...overrides,
  });
};

const loginAs = async (app: ReturnType<typeof buildApp>, email: string) => {
  const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  return `Bearer ${response.body.token as string}`;
};

describe('GET /health', () => {
  it('reports the service is up', async () => {
    const response = await request(buildTestApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /ready', () => {
  it('reports ready when its dependencies respond', async () => {
    const response = await request(buildTestApp({ checkReadiness: async () => {} })).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
  });

  it('returns 503 without internal details when a dependency is down, and reports it', async () => {
    const reportError = vi.fn();
    const failure = new Error('connect ECONNREFUSED 10.0.0.5:5432');
    const app = buildTestApp({ checkReadiness: () => Promise.reject(failure), reportError });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: { code: 'NOT_READY', message: 'Service is not ready' },
    });
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
    expect(reportError).toHaveBeenCalledWith(failure);
  });
});

describe('POST /auth/login', () => {
  it('returns a token and the user for valid credentials', async () => {
    const response = await request(buildTestApp())
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      token: expect.any(String),
      user: { id: 'ada', email: 'ada@example.com' },
    });
  });

  it('rejects wrong credentials with 401', async () => {
    const response = await request(buildTestApp())
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: 'guess' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
    });
  });

  it('rejects an invalid body with 400 and field details', async () => {
    const response = await request(buildTestApp()).post('/auth/login').send({ email: 'nope' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['email'] })]),
    );
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await request(buildTestApp())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
  });
});

describe('authentication on /tasks', () => {
  it.each([
    ['no Authorization header', undefined],
    ['a non-Bearer scheme', 'Basic YWRhOnB3'],
    ['an invalid token', 'Bearer not-a-token'],
  ])('rejects %s with 401', async (_label, authorization) => {
    const call = request(buildTestApp()).get('/tasks');
    const response = await (authorization ? call.set('Authorization', authorization) : call);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a valid token for a user who no longer exists with 401, not 500', async () => {
    const app = buildTestApp();
    const ghost = `Bearer ${tokens.issue('deleted-user')}`;

    const reads = await request(app).get('/tasks').set('Authorization', ghost);
    const writes = await request(app)
      .post('/tasks')
      .set('Authorization', ghost)
      .send({ title: 'x' });

    expect([reads.status, writes.status]).toEqual([401, 401]);
  });

  it('accepts the Bearer scheme in any letter case', async () => {
    const app = buildTestApp();
    const token = (await loginAs(app, 'ada@example.com')).replace('Bearer ', '');

    const response = await request(app).get('/tasks').set('Authorization', `bearer ${token}`);

    expect(response.status).toBe(200);
  });
});

describe('/tasks', () => {
  let app: ReturnType<typeof buildApp>;
  let ada: string;

  const createTask = async (title: string, auth = ada): Promise<Task> =>
    (await request(app).post('/tasks').set('Authorization', auth).send({ title })).body;

  beforeEach(async () => {
    app = buildTestApp();
    ada = await loginAs(app, 'ada@example.com');
  });

  describe('POST /tasks', () => {
    it('creates a task and returns 201', async () => {
      const response = await request(app)
        .post('/tasks')
        .set('Authorization', ada)
        .send({ title: 'Buy milk', description: '2 litres' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: 'task-1',
        userId: 'ada',
        title: 'Buy milk',
        description: '2 litres',
        completed: false,
        position: 0,
      });
    });

    it('rejects a blank title with 400', async () => {
      const response = await request(app)
        .post('/tasks')
        .set('Authorization', ada)
        .send({ title: ' ' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /tasks', () => {
    it("lists only the caller's tasks in position order", async () => {
      await createTask('First');
      await createTask('Second');
      await createTask('Not yours', await loginAs(app, 'grace@example.com'));

      const response = await request(app).get('/tasks').set('Authorization', ada);

      expect(response.status).toBe(200);
      expect(response.body.map(({ title }: Task) => title)).toEqual(['First', 'Second']);
    });

    it('filters by the q search parameter', async () => {
      await createTask('Buy milk');
      await createTask('Walk dog');

      const response = await request(app).get('/tasks?q=MILK').set('Authorization', ada);

      expect(response.body.map(({ title }: Task) => title)).toEqual(['Buy milk']);
    });
  });

  describe('GET /tasks/:id', () => {
    it('returns the task', async () => {
      const { id } = await createTask('Buy milk');

      const response = await request(app).get(`/tasks/${id}`).set('Authorization', ada);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Buy milk');
    });

    it("returns 404 for another user's task", async () => {
      const { id } = await createTask('Secret', await loginAs(app, 'grace@example.com'));

      const response = await request(app).get(`/tasks/${id}`).set('Authorization', ada);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
    });
  });

  describe('PATCH /tasks/:id', () => {
    it('updates the supplied fields', async () => {
      const { id } = await createTask('Buy milk');

      const response = await request(app)
        .patch(`/tasks/${id}`)
        .set('Authorization', ada)
        .send({ completed: true });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ title: 'Buy milk', completed: true });
    });

    it('rejects an empty patch with 400', async () => {
      const { id } = await createTask('Buy milk');

      const response = await request(app).patch(`/tasks/${id}`).set('Authorization', ada).send({});

      expect(response.status).toBe(400);
    });

    it('returns 404 for a missing task', async () => {
      const response = await request(app)
        .patch('/tasks/missing')
        .set('Authorization', ada)
        .send({ title: 'x' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('deletes the task and returns 204', async () => {
      const { id } = await createTask('Buy milk');

      const response = await request(app).delete(`/tasks/${id}`).set('Authorization', ada);
      const followUp = await request(app).get(`/tasks/${id}`).set('Authorization', ada);

      expect(response.status).toBe(204);
      expect(followUp.status).toBe(404);
    });

    it('returns 404 for a missing task', async () => {
      const response = await request(app).delete('/tasks/missing').set('Authorization', ada);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /tasks/order', () => {
    it('reorders the tasks and returns them in the new order', async () => {
      const first = await createTask('First');
      const second = await createTask('Second');

      const response = await request(app)
        .put('/tasks/order')
        .set('Authorization', ada)
        .send({ ids: [second.id, first.id] });

      expect(response.status).toBe(200);
      expect(response.body.map(({ title }: Task) => title)).toEqual(['Second', 'First']);
    });

    it('rejects a list that is not exactly the caller’s tasks with 400', async () => {
      await createTask('First');

      const response = await request(app)
        .put('/tasks/order')
        .set('Authorization', ada)
        .send({ ids: ['someone-elses'] });

      expect(response.status).toBe(400);
    });
  });
});

describe('POST /auth/register', () => {
  const register = (app: ReturnType<typeof buildApp>, body: object) =>
    request(app).post('/auth/register').send(body);

  it('creates the account and returns a working session (201)', async () => {
    const app = buildTestApp();

    const response = await register(app, { email: 'Lin+1@Example.com', password: 'a-new-pass' });
    const tasks = await request(app)
      .get('/tasks')
      .set('authorization', `Bearer ${response.body.token}`);

    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({ id: expect.any(String), email: 'lin+1@example.com' });
    expect(tasks.status).toBe(200);
    expect(tasks.body).toEqual([]);
  });

  it('lets the new account sign in afterwards', async () => {
    const app = buildTestApp();
    await register(app, { email: 'lin@example.com', password: 'a-new-pass' });

    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'lin@example.com', password: 'a-new-pass' });

    expect(login.status).toBe(200);
  });

  it('refuses a password outside 8 to 64 characters with a field message (400)', async () => {
    const response = await register(buildTestApp(), {
      email: 'lin@example.com',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { path: ['password'], message: 'Use 8 to 64 characters' },
    ]);
  });

  it('refuses an email that already has an account, in any letter case (409)', async () => {
    const response = await register(buildTestApp(), {
      email: 'ADA@example.com',
      password: 'another-pass',
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'EMAIL_TAKEN',
      message: 'An account with this email already exists',
    });
  });

  it('limits sign-ups from one address, counting every attempt (429)', async () => {
    const app = buildTestApp({ registerRateLimit: { limit: 2, windowMs: 60_000 } });

    await register(app, { email: 'one@example.com', password: 'a-new-pass' });
    await register(app, { email: 'two@example.com', password: 'a-new-pass' });
    const blocked = await register(app, { email: 'three@example.com', password: 'a-new-pass' });

    expect(blocked.status).toBe(429);
  });
});

describe('hardening', () => {
  it('sets security headers on every response', async () => {
    const response = await request(buildTestApp()).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('rate limits repeated login attempts with a JSON 429', async () => {
    const app = buildTestApp({ loginRateLimit: { limit: 2, windowMs: 60_000 } });
    const attempt = () =>
      request(app).post('/auth/login').send({ email: 'ada@example.com', password: 'guess' });

    await attempt();
    await attempt();
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('counts only failed logins, so signing in again (a new tab, a second device) is never blocked', async () => {
    const app = buildTestApp({ loginRateLimit: { limit: 2, windowMs: 60_000 } });
    const signIn = (password: string) =>
      request(app).post('/auth/login').send({ email: 'ada@example.com', password });

    // One after another: a success is uncounted once it completes.
    const successes = [await signIn(PASSWORD), await signIn(PASSWORD), await signIn(PASSWORD)];
    await signIn('guess');
    await signIn('guess');
    const blocked = await signIn('guess');

    expect(successes.map(({ status }) => status)).toEqual([200, 200, 200]);
    expect(blocked.status).toBe(429);
  });

  it('does not rate limit the rest of the API', async () => {
    const app = buildTestApp({ loginRateLimit: { limit: 1, windowMs: 60_000 } });

    const responses = await Promise.all([1, 2, 3].map(() => request(app).get('/health')));

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200]);
  });
});

describe('error handling', () => {
  it('returns JSON 404 for unknown routes', async () => {
    const response = await request(buildTestApp()).get('/nope');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('hides unexpected failures behind a generic 500 and reports them', async () => {
    const reportError = vi.fn();
    const failure = new Error('connection refused');
    const healthyApp = buildTestApp();
    const ada = await loginAs(healthyApp, 'ada@example.com');
    const brokenTaskService = {
      ...createTaskService({
        tasks: createInMemoryTaskRepository(),
        clock: () => new Date(),
        newId: () => 'x',
      }),
      list: () => Promise.reject(failure),
    };
    const app = buildTestApp({ taskService: brokenTaskService, reportError });

    const response = await request(app).get('/tasks').set('Authorization', ada);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
    expect(JSON.stringify(response.body)).not.toContain('connection refused');
    expect(reportError).toHaveBeenCalledWith(failure);
  });
});
