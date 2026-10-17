import type { Task } from '@todo/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server';
import { ApiError, createApiClient } from './client';

const BASE_URL = 'http://localhost/api';

const aTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  userId: 'ada',
  title: 'Buy milk',
  description: '',
  completed: false,
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const clientWithToken = (token: string | null = 'token-123') =>
  createApiClient({ baseUrl: BASE_URL, getToken: () => token });

describe('apiClient', () => {
  it('logs in with the credentials and returns the auth response', async () => {
    server.use(
      http.post(`${BASE_URL}/auth/login`, async ({ request }) =>
        HttpResponse.json({
          token: 'token-123',
          user: { id: 'ada', email: ((await request.json()) as { email: string }).email },
        }),
      ),
    );

    expect(
      await clientWithToken(null).login({ email: 'ada@example.com', password: 'secret' }),
    ).toEqual({ token: 'token-123', user: { id: 'ada', email: 'ada@example.com' } });
  });

  it('sends the bearer token and the search query', async () => {
    let seen = { authorization: '', query: '' };
    server.use(
      http.get(`${BASE_URL}/tasks`, ({ request }) => {
        seen = {
          authorization: request.headers.get('Authorization') ?? '',
          query: new URL(request.url).searchParams.get('q') ?? '',
        };
        return HttpResponse.json([aTask()]);
      }),
    );

    expect(await clientWithToken().listTasks('buy milk')).toEqual([aTask()]);
    expect(seen).toEqual({ authorization: 'Bearer token-123', query: 'buy milk' });
  });

  it('omits the search parameter for a blank query', async () => {
    let url = '';
    server.use(
      http.get(`${BASE_URL}/tasks`, ({ request }) => {
        url = request.url;
        return HttpResponse.json([]);
      }),
    );

    await clientWithToken().listTasks('');

    expect(url).toBe(`${BASE_URL}/tasks`);
  });

  it('sends JSON bodies for writes', async () => {
    let body: unknown;
    server.use(
      http.put(`${BASE_URL}/tasks/order`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json([aTask()]);
      }),
    );

    await clientWithToken().reorderTasks(['t1']);

    expect(body).toEqual({ ids: ['t1'] });
  });

  it('resolves a 204 delete with no value', async () => {
    server.use(http.delete(`${BASE_URL}/tasks/t1`, () => new HttpResponse(null, { status: 204 })));

    await expect(clientWithToken().deleteTask('t1')).resolves.toBeUndefined();
  });

  it('turns an API error body into an ApiError', async () => {
    server.use(
      http.get(`${BASE_URL}/tasks/missing`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Task not found' } },
          { status: 404 },
        ),
      ),
    );

    const error = await clientWithToken()
      .getTask('missing')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Task not found' });
  });

  it('reports a non-JSON failure, such as a proxy error page, generically', async () => {
    server.use(
      http.get(
        `${BASE_URL}/tasks`,
        () => new HttpResponse('<html>Bad Gateway</html>', { status: 502 }),
      ),
    );

    await expect(clientWithToken().listTasks('')).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN',
    });
  });

  it('rejects a success response that breaks the shared contract', async () => {
    server.use(http.get(`${BASE_URL}/tasks/t1`, () => HttpResponse.json({ id: 't1' })));

    await expect(clientWithToken().getTask('t1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
