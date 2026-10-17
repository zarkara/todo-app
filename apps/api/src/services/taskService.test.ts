import type { Task } from '@todo/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../domain/errors';
import { createInMemoryTaskRepository } from '../repositories/taskRepository';
import { createTaskService, type TaskService } from './taskService';

const NOW = new Date('2026-03-01T12:00:00.000Z');

const aTask = (overrides: Partial<Task>): Task => ({
  id: 'task-1',
  userId: 'ada',
  title: 'Buy milk',
  description: '',
  completed: false,
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const sequentialIds = () => {
  let count = 0;
  return () => `new-${++count}`;
};

const titlesOf = (tasks: Task[]) => tasks.map(({ title }) => title);

describe('taskService', () => {
  let service: TaskService;

  beforeEach(() => {
    const tasks = createInMemoryTaskRepository([
      aTask({ id: 'a2', title: 'Walk dog', position: 1 }),
      aTask({ id: 'a1', title: 'Buy milk', description: 'From the corner shop', position: 0 }),
      aTask({ id: 'g1', userId: 'grace', title: 'Fix compiler', position: 0 }),
    ]);
    service = createTaskService({ tasks, clock: () => NOW, newId: sequentialIds() });
  });

  describe('list', () => {
    it("returns the user's tasks in position order", async () => {
      expect(titlesOf(await service.list('ada'))).toEqual(['Buy milk', 'Walk dog']);
    });

    it('filters by the search query', async () => {
      expect(titlesOf(await service.list('ada', 'corner'))).toEqual(['Buy milk']);
    });
  });

  describe('get', () => {
    it("returns the user's task", async () => {
      expect((await service.get('ada', 'a1')).title).toBe('Buy milk');
    });

    it("hides another user's task as not found", async () => {
      await expect(service.get('ada', 'g1')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('create', () => {
    it('appends the task after the existing ones, stamped with id and time', async () => {
      expect(await service.create('ada', { title: 'Call mum' })).toEqual({
        id: 'new-1',
        userId: 'ada',
        title: 'Call mum',
        description: '',
        completed: false,
        position: 2,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
    });

    it('starts a new user at position zero', async () => {
      expect((await service.create('alan', { title: 'First' })).position).toBe(0);
    });
  });

  describe('update', () => {
    it('applies the patch and persists it', async () => {
      await service.update('ada', 'a1', { completed: true });

      expect(await service.get('ada', 'a1')).toMatchObject({
        completed: true,
        updatedAt: NOW.toISOString(),
      });
    });

    it("refuses to update another user's task", async () => {
      await expect(service.update('ada', 'g1', { title: 'Mine now' })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('remove', () => {
    it("deletes the user's task", async () => {
      await service.remove('ada', 'a1');

      await expect(service.get('ada', 'a1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('reports a missing task as not found', async () => {
      await expect(service.remove('ada', 'missing')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('reorder', () => {
    it('persists the requested order and returns the tasks in it', async () => {
      expect(titlesOf(await service.reorder('ada', ['a2', 'a1']))).toEqual([
        'Walk dog',
        'Buy milk',
      ]);
      expect(titlesOf(await service.list('ada'))).toEqual(['Walk dog', 'Buy milk']);
    });

    it.each([
      ['an incomplete list', ['a1']],
      ['a duplicated id', ['a1', 'a1']],
      ["another user's task", ['a1', 'a2', 'g1']],
    ])('rejects %s', async (_label, ids) => {
      await expect(service.reorder('ada', ids)).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
