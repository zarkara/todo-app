import type { Task } from '@todo/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiClientProvider } from '../api/ApiClientProvider';
import { createApiClient } from '../api/client';
import { server } from '../test/server';
import {
  useCreateTask,
  useDeleteTask,
  useReorderTasks,
  useTask,
  useTasks,
  useUpdateTask,
} from './tasks';

const BASE_URL = 'http://localhost/api';

const aTask = (id: string, position: number): Task => ({
  id,
  userId: 'ada',
  title: `Task ${id}`,
  description: '',
  completed: false,
  position,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const titlesOf = (tasks: Task[] | undefined) => tasks?.map(({ title }) => title);

const renderWithProviders = <T,>(hook: () => T) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const client = createApiClient({ baseUrl: BASE_URL, getToken: () => 'token' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={client}>{children}</ApiClientProvider>
    </QueryClientProvider>
  );
  return renderHook(hook, { wrapper });
};

// A minimal in-memory stand-in for the API so cache invalidation can be observed.
let serverTasks: Task[];

beforeEach(() => {
  serverTasks = [aTask('a', 0), aTask('b', 1)];
  server.use(
    http.get(`${BASE_URL}/tasks`, ({ request }) => {
      const query = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json(serverTasks.filter(({ title }) => title.includes(query)));
    }),
    http.get(`${BASE_URL}/tasks/:id`, ({ params }) =>
      HttpResponse.json(serverTasks.find(({ id }) => id === params.id)),
    ),
  );
});

describe('useTasks', () => {
  it('loads the task list for a query', async () => {
    const { result } = renderWithProviders(() => useTasks('b'));

    await waitFor(() => expect(titlesOf(result.current.data)).toEqual(['Task b']));
  });
});

describe('useTask', () => {
  it('loads a single task', async () => {
    const { result } = renderWithProviders(() => useTask('a'));

    await waitFor(() => expect(result.current.data?.title).toBe('Task a'));
  });
});

describe('useCreateTask', () => {
  it('refreshes the list after creating a task', async () => {
    server.use(
      http.post(`${BASE_URL}/tasks`, () => {
        const created = aTask('c', 2);
        serverTasks = [...serverTasks, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const { result } = renderWithProviders(() => ({ list: useTasks(''), create: useCreateTask() }));
    await waitFor(() => expect(result.current.list.data).toHaveLength(2));

    await act(() => result.current.create.mutateAsync({ title: 'Task c' }));

    await waitFor(() =>
      expect(titlesOf(result.current.list.data)).toEqual(['Task a', 'Task b', 'Task c']),
    );
  });
});

describe('useUpdateTask', () => {
  it('writes the saved task into the detail cache', async () => {
    server.use(
      http.patch(`${BASE_URL}/tasks/a`, () => {
        const updated = { ...aTask('a', 0), completed: true };
        serverTasks = [updated, aTask('b', 1)];
        return HttpResponse.json(updated);
      }),
    );
    const { result } = renderWithProviders(() => ({ task: useTask('a'), update: useUpdateTask() }));
    await waitFor(() => expect(result.current.task.data).toBeDefined());

    await act(() => result.current.update.mutateAsync({ id: 'a', patch: { completed: true } }));

    await waitFor(() => expect(result.current.task.data?.completed).toBe(true));
  });
});

describe('useDeleteTask', () => {
  it('refreshes the list after deleting a task', async () => {
    server.use(
      http.delete(`${BASE_URL}/tasks/a`, () => {
        serverTasks = serverTasks.filter(({ id }) => id !== 'a');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = renderWithProviders(() => ({ list: useTasks(''), remove: useDeleteTask() }));
    await waitFor(() => expect(result.current.list.data).toHaveLength(2));

    await act(() => result.current.remove.mutateAsync('a'));

    await waitFor(() => expect(titlesOf(result.current.list.data)).toEqual(['Task b']));
  });
});

describe('useReorderTasks', () => {
  const renderList = async () => {
    const rendered = renderWithProviders(() => ({
      list: useTasks(''),
      reorder: useReorderTasks(),
    }));
    await waitFor(() => expect(rendered.result.current.list.data).toHaveLength(2));
    return rendered;
  };

  it('shows the new order immediately, before the server answers', async () => {
    let releaseResponse = () => {};
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    server.use(
      http.put(`${BASE_URL}/tasks/order`, async () => {
        await responseReleased;
        serverTasks = [aTask('b', 0), aTask('a', 1)];
        return HttpResponse.json(serverTasks);
      }),
    );
    const { result } = await renderList();

    act(() => result.current.reorder.mutate([aTask('b', 1), aTask('a', 0)]));

    await waitFor(() => expect(titlesOf(result.current.list.data)).toEqual(['Task b', 'Task a']));
    expect(result.current.list.data?.map(({ position }) => position)).toEqual([0, 1]);
    releaseResponse();
    await waitFor(() => expect(result.current.reorder.isSuccess).toBe(true));
  });

  it('rolls back to the previous order when the server rejects it', async () => {
    let listRequests = 0;
    server.use(
      http.get(`${BASE_URL}/tasks`, async () => {
        listRequests += 1;
        // After the first load, hang refetches so only the rollback can restore the order.
        if (listRequests > 1) await delay('infinite');
        return HttpResponse.json(serverTasks);
      }),
      http.put(`${BASE_URL}/tasks/order`, () =>
        HttpResponse.json(
          {
            error: { code: 'VALIDATION', message: 'ids must list each of your tasks exactly once' },
          },
          { status: 400 },
        ),
      ),
    );
    const { result } = await renderList();

    act(() => result.current.reorder.mutate([aTask('b', 1), aTask('a', 0)]));

    await waitFor(() => expect(result.current.reorder.isError).toBe(true));
    expect(titlesOf(result.current.list.data)).toEqual(['Task a', 'Task b']);
  });
});
