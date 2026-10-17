import type { NewTask, Task, TaskPatch } from '@todo/shared';
import type { Clock } from '../clock';
import { NotFoundError, ValidationError } from '../domain/errors';
import {
  applyPatch,
  byPosition,
  createTask,
  isPermutationOf,
  matchesQuery,
  nextPosition,
  reorder,
} from '../domain/task';
import type { TaskRepository } from '../repositories/taskRepository';

interface TaskServiceDependencies {
  tasks: TaskRepository;
  clock: Clock;
  newId: () => string;
}

export const createTaskService = ({ tasks, clock, newId }: TaskServiceDependencies) => {
  const now = () => clock().toISOString();

  const get = async (userId: string, id: string): Promise<Task> => {
    const task = await tasks.findById(userId, id);
    if (!task) throw new NotFoundError('Task not found');
    return task;
  };

  return {
    get,

    list: async (userId: string, query = ''): Promise<Task[]> =>
      (await tasks.listByUser(userId)).filter(matchesQuery(query)).toSorted(byPosition),

    create: async (userId: string, input: NewTask): Promise<Task> => {
      const position = nextPosition(await tasks.listByUser(userId));
      return tasks.save(createTask(input, { id: newId(), userId, now: now(), position }));
    },

    update: async (userId: string, id: string, patch: TaskPatch): Promise<Task> =>
      tasks.save(applyPatch(await get(userId, id), patch, now())),

    remove: async (userId: string, id: string): Promise<void> => {
      if (!(await tasks.remove(userId, id))) throw new NotFoundError('Task not found');
    },

    reorder: async (userId: string, orderedIds: string[]): Promise<Task[]> => {
      const current = await tasks.listByUser(userId);
      if (!isPermutationOf(orderedIds, current)) {
        throw new ValidationError('ids must list each of your tasks exactly once');
      }
      return (await tasks.saveAll(reorder(current, orderedIds))).toSorted(byPosition);
    },
  };
};

export type TaskService = ReturnType<typeof createTaskService>;
