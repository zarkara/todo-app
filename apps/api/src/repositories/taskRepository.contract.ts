import type { Task } from '@todo/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TaskRepository } from './taskRepository';

const aTask = (overrides: Partial<Task> = {}): Task => ({
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

const idsOf = (tasks: Task[]) => tasks.map(({ id }) => id).toSorted();

// Behaviour every TaskRepository adapter must honour; run it against each implementation.
export const describeTaskRepository = (
  name: string,
  createRepository: (seed: Task[]) => TaskRepository | Promise<TaskRepository>,
) =>
  describe(`${name} (TaskRepository contract)`, () => {
    const adasTask = aTask({ id: 'a1', userId: 'ada' });
    const adasOtherTask = aTask({ id: 'a2', userId: 'ada', position: 1 });
    const gracesTask = aTask({ id: 'g1', userId: 'grace' });
    let repository: TaskRepository;

    beforeEach(async () => {
      repository = await createRepository([adasTask, adasOtherTask, gracesTask]);
    });

    describe('listByUser', () => {
      it("lists only the given user's tasks", async () => {
        expect(idsOf(await repository.listByUser('ada'))).toEqual(['a1', 'a2']);
      });

      it('returns an empty list for a user without tasks', async () => {
        expect(await repository.listByUser('nobody')).toEqual([]);
      });
    });

    describe('findById', () => {
      it("finds the user's own task", async () => {
        expect(await repository.findById('ada', 'a1')).toEqual(adasTask);
      });

      it("does not find another user's task", async () => {
        expect(await repository.findById('ada', 'g1')).toBeUndefined();
      });

      it('does not find a missing task', async () => {
        expect(await repository.findById('ada', 'missing')).toBeUndefined();
      });
    });

    describe('save', () => {
      it('inserts a new task', async () => {
        const newTask = aTask({ id: 'a3', userId: 'ada' });

        expect(await repository.save(newTask)).toEqual(newTask);
        expect(await repository.findById('ada', 'a3')).toEqual(newTask);
      });

      it('replaces an existing task', async () => {
        await repository.save({ ...adasTask, title: 'Renamed' });

        expect((await repository.findById('ada', 'a1'))?.title).toBe('Renamed');
      });

      it("refuses to overwrite another user's task with the same id", async () => {
        await expect(repository.save({ ...gracesTask, userId: 'ada' })).rejects.toThrow(
          'belongs to another user',
        );
        expect(await repository.findById('grace', 'g1')).toEqual(gracesTask);
      });
    });

    describe('saveAll', () => {
      it('stores every task in one call', async () => {
        await repository.saveAll([
          { ...adasTask, position: 1 },
          { ...adasOtherTask, position: 0 },
        ]);

        const positions = (await repository.listByUser('ada')).map(({ id, position }) => [
          id,
          position,
        ]);
        expect(positions.toSorted()).toEqual([
          ['a1', 1],
          ['a2', 0],
        ]);
      });

      it('stores nothing when any task in the batch is rejected', async () => {
        const batch = [
          { ...adasTask, title: 'Renamed' },
          { ...gracesTask, userId: 'ada' },
        ];

        await expect(repository.saveAll(batch)).rejects.toThrow('belongs to another user');
        expect((await repository.findById('ada', 'a1'))?.title).toBe('Buy milk');
      });
    });

    describe('remove', () => {
      it("removes the user's own task and reports success", async () => {
        expect(await repository.remove('ada', 'a1')).toBe(true);
        expect(await repository.findById('ada', 'a1')).toBeUndefined();
      });

      it("refuses to remove another user's task", async () => {
        expect(await repository.remove('ada', 'g1')).toBe(false);
        expect(await repository.findById('grace', 'g1')).toEqual(gracesTask);
      });

      it('reports failure for a missing task', async () => {
        expect(await repository.remove('ada', 'missing')).toBe(false);
      });
    });

    describe('isolation', () => {
      it('does not let callers mutate stored tasks through returned objects', async () => {
        const found = await repository.findById('ada', 'a1');
        if (found) found.title = 'Tampered';

        expect((await repository.findById('ada', 'a1'))?.title).toBe('Buy milk');
      });

      it('does not let callers mutate stored tasks through saved objects', async () => {
        const task = aTask({ id: 'a3', userId: 'ada' });
        await repository.save(task);
        task.title = 'Tampered';

        expect((await repository.findById('ada', 'a3'))?.title).toBe('Buy milk');
      });
    });
  });
