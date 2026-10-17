import { describe, expect, it } from 'vitest';
import {
  applyPatch,
  byPosition,
  createTask,
  isPermutationOf,
  matchesQuery,
  nextPosition,
  reorder,
  type Task,
} from './task';

const CREATED_AT = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';

const aTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  userId: 'user-1',
  title: 'Buy milk',
  description: 'Semi-skimmed',
  completed: false,
  position: 0,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
});

const positionsOf = (tasks: Task[]) => tasks.map(({ id, position }) => [id, position]);

describe('createTask', () => {
  const context = { id: 'task-9', userId: 'user-1', now: CREATED_AT, position: 3 };

  it('builds an incomplete task stamped with the given context', () => {
    expect(createTask({ title: 'Walk dog', description: 'Before 9am' }, context)).toEqual({
      id: 'task-9',
      userId: 'user-1',
      title: 'Walk dog',
      description: 'Before 9am',
      completed: false,
      position: 3,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  });

  it('defaults the description to an empty string', () => {
    expect(createTask({ title: 'Walk dog' }, context).description).toBe('');
  });
});

describe('applyPatch', () => {
  it('changes only the supplied fields and bumps updatedAt', () => {
    const task = aTask();

    expect(applyPatch(task, { completed: true }, LATER)).toEqual({
      ...task,
      completed: true,
      updatedAt: LATER,
    });
  });

  it('ignores attempts to change identity or ordering fields', () => {
    const task = aTask();
    const hostilePatch = { title: 'Renamed', id: 'other', userId: 'intruder', position: 99 };

    const patched = applyPatch(task, hostilePatch, LATER);

    expect(patched).toMatchObject({ id: 'task-1', userId: 'user-1', position: 0 });
    expect(patched.title).toBe('Renamed');
  });

  it('does not mutate the original task', () => {
    const task = aTask();

    applyPatch(task, { title: 'Renamed' }, LATER);

    expect(task.title).toBe('Buy milk');
  });
});

describe('matchesQuery', () => {
  const task = aTask({ title: 'Buy Milk', description: 'From the corner shop' });

  it.each(['', '   '])('matches every task for a blank query %j', (query) => {
    expect(matchesQuery(query)(task)).toBe(true);
  });

  it.each(['milk', 'MILK', ' buy ', 'corner'])(
    'matches %j case-insensitively in title or description',
    (query) => {
      expect(matchesQuery(query)(task)).toBe(true);
    },
  );

  it('rejects tasks that contain the query nowhere', () => {
    expect(matchesQuery('bread')(task)).toBe(false);
  });
});

describe('byPosition', () => {
  it('sorts tasks by ascending position', () => {
    const tasks = [
      aTask({ id: 'c', position: 2 }),
      aTask({ id: 'a', position: 0 }),
      aTask({ id: 'b', position: 1 }),
    ];

    expect(tasks.toSorted(byPosition).map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });
});

describe('nextPosition', () => {
  it('starts at zero for an empty list', () => {
    expect(nextPosition([])).toBe(0);
  });

  it('is one past the highest position, even with gaps', () => {
    expect(nextPosition([aTask({ position: 4 }), aTask({ position: 1 })])).toBe(5);
  });
});

describe('isPermutationOf', () => {
  const tasks = [aTask({ id: 'a' }), aTask({ id: 'b' }), aTask({ id: 'c' })];

  it('accepts the same ids in any order', () => {
    expect(isPermutationOf(['c', 'a', 'b'], tasks)).toBe(true);
  });

  it.each([
    ['a missing id', ['a', 'b']],
    ['a duplicated id', ['a', 'a', 'b']],
    ['a foreign id', ['a', 'b', 'zzz']],
    ['an extra id', ['a', 'b', 'c', 'd']],
  ])('rejects %s', (_label, ids) => {
    expect(isPermutationOf(ids, tasks)).toBe(false);
  });
});

describe('reorder', () => {
  it('assigns each task the index of its id in the requested order', () => {
    const tasks = [
      aTask({ id: 'a', position: 0 }),
      aTask({ id: 'b', position: 1 }),
      aTask({ id: 'c', position: 2 }),
    ];

    expect(positionsOf(reorder(tasks, ['c', 'a', 'b']))).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('skips ids that match no task', () => {
    const tasks = [aTask({ id: 'a', position: 0 })];

    expect(positionsOf(reorder(tasks, ['ghost', 'a']))).toEqual([['a', 1]]);
  });

  it('does not mutate the original tasks', () => {
    const tasks = [aTask({ id: 'a', position: 0 }), aTask({ id: 'b', position: 1 })];

    reorder(tasks, ['b', 'a']);

    expect(positionsOf(tasks)).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });
});
