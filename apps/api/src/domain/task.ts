export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  completed: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewTask {
  title: string;
  description?: string;
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'completed'>>;

export interface TaskContext {
  id: string;
  userId: string;
  now: string;
  position: number;
}

const EDITABLE_FIELDS = ['title', 'description', 'completed'] as const;

export const createTask = (
  { title, description = '' }: NewTask,
  { id, userId, now, position }: TaskContext,
): Task => ({
  id,
  userId,
  title,
  description,
  completed: false,
  position,
  createdAt: now,
  updatedAt: now,
});

const editableFieldsOf = (patch: TaskPatch): TaskPatch =>
  Object.fromEntries(
    EDITABLE_FIELDS.filter((field) => patch[field] !== undefined).map((field) => [
      field,
      patch[field],
    ]),
  );

export const applyPatch = (task: Task, patch: TaskPatch, now: string): Task => ({
  ...task,
  ...editableFieldsOf(patch),
  updatedAt: now,
});

export const matchesQuery =
  (query: string) =>
  ({ title, description }: Task): boolean => {
    const needle = query.trim().toLowerCase();
    return [title, description].some((text) => text.toLowerCase().includes(needle));
  };

export const byPosition = (a: Task, b: Task): number => a.position - b.position;

export const nextPosition = (tasks: Task[]): number =>
  tasks.reduce((next, { position }) => Math.max(next, position + 1), 0);

export const isPermutationOf = (ids: string[], tasks: Task[]): boolean => {
  const taskIds = new Set(tasks.map(({ id }) => id));
  return (
    ids.length === taskIds.size &&
    new Set(ids).size === ids.length &&
    ids.every((id) => taskIds.has(id))
  );
};

export const reorder = (tasks: Task[], orderedIds: string[]): Task[] => {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  return orderedIds.flatMap((id, position) => {
    const task = tasksById.get(id);
    return task ? [{ ...task, position }] : [];
  });
};
