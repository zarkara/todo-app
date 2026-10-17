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

const buildTestApp = (overrides: Partial<AppDependencies> = {}) => {
  let nextId = 0;
  const users = createInMemoryUserRepository([
    { id: 'ada', email: 'ada@example.com', passwordHash },
    { id: 'grace', email: 'grace@example.com', passwordHash },
  ]);
  const tokens = createTokenService({
    secret: 'test-secret-that-is-long-enough-for-hs256',
    ttlSeconds: 3600,
    clock: () => new Date(),
  });
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
