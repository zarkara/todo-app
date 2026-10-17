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

export const createInMemoryTaskRepository = (seed: Task[] = []): TaskRepository => {
  const tasks = new Map(seed.map((task) => [task.id, copy(task)]));

  const findOwned = (userId: string, id: string) => {
    const task = tasks.get(id);
    return task?.userId === userId ? task : undefined;
  };

  const store = (task: Task) => {
    tasks.set(task.id, copy(task));
    return copy(task);
  };

  return {
    listByUser: async (userId) =>
      [...tasks.values()].filter((task) => task.userId === userId).map(copy),
    findById: async (userId, id) => {
      const task = findOwned(userId, id);
      return task && copy(task);
    },
    save: async (task) => store(task),
    saveAll: async (batch) => batch.map(store),
    remove: async (userId, id) => Boolean(findOwned(userId, id)) && tasks.delete(id),
  };
};
