import type { Task } from '@todo/shared';

export interface TaskRepository {
  listByUser(userId: string): Promise<Task[]>;
  findById(userId: string, id: string): Promise<Task | undefined>;
  save(task: Task): Promise<Task>;
  saveAll(tasks: Task[]): Promise<Task[]>;
  remove(userId: string, id: string): Promise<boolean>;
}

// Copies on the way in and out so callers can never mutate stored state, mirroring a real database.
const copy = (task: Task): Task => ({ ...task });

export const ownershipConflict = (taskId: string) =>
  new Error(`Task ${taskId} belongs to another user`);

export const createInMemoryTaskRepository = (seed: Task[] = []): TaskRepository => {
  const tasks = new Map(seed.map((task) => [task.id, copy(task)]));

  const findOwned = (userId: string, id: string) => {
    const task = tasks.get(id);
    return task?.userId === userId ? task : undefined;
  };

  const assertOwnership = (task: Task) => {
    const existing = tasks.get(task.id);
    if (existing && existing.userId !== task.userId) throw ownershipConflict(task.id);
  };

  const store = (task: Task) => {
    tasks.set(task.id, copy(task));
    return copy(task);
  };

  // Validates the whole batch before writing, matching the all-or-nothing transaction in Postgres.
  const storeAll = (batch: Task[]) => {
    batch.forEach(assertOwnership);
    return batch.map(store);
  };

  return {
    listByUser: async (userId) =>
      [...tasks.values()].filter((task) => task.userId === userId).map(copy),
    findById: async (userId, id) => {
      const task = findOwned(userId, id);
      return task && copy(task);
    },
    save: async (task) => {
      assertOwnership(task);
      return store(task);
    },
    saveAll: async (batch) => storeAll(batch),
    remove: async (userId, id) => Boolean(findOwned(userId, id)) && tasks.delete(id),
  };
};
