import type { Task } from '@todo/shared';
import type pg from 'pg';
import { type Queryable, withTransaction } from '../db/database';
import { ownershipConflict, type TaskRepository } from './taskRepository';

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  completed: boolean;
  position: number;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, user_id, title, description, completed, position, created_at, updated_at';

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description,
  completed: row.completed,
  position: row.position,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

// The WHERE clause makes an id collision with another user's task update nothing, instead of hijacking it.
const UPSERT = `
  INSERT INTO tasks (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    completed = EXCLUDED.completed,
    position = EXCLUDED.position,
    updated_at = EXCLUDED.updated_at
  WHERE tasks.user_id = EXCLUDED.user_id
  RETURNING ${COLUMNS}`;

const upsert = async (db: Queryable, task: Task): Promise<Task> => {
  const { rows } = await db.query<TaskRow>(UPSERT, [
    task.id,
    task.userId,
    task.title,
    task.description,
    task.completed,
    task.position,
    task.createdAt,
    task.updatedAt,
  ]);
  const [saved] = rows.map(toTask);
  if (!saved) throw ownershipConflict(task.id);
  return saved;
};

export const createPostgresTaskRepository = (pool: pg.Pool): TaskRepository => ({
  listByUser: async (userId) => {
    const { rows } = await pool.query<TaskRow>(
      `SELECT ${COLUMNS} FROM tasks WHERE user_id = $1 ORDER BY position, id`,
      [userId],
    );
    return rows.map(toTask);
  },
  findById: async (userId, id) => {
    const { rows } = await pool.query<TaskRow>(
      `SELECT ${COLUMNS} FROM tasks WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows.map(toTask)[0];
  },
  save: (task) => upsert(pool, task),
  // One transaction so a reorder is applied completely or not at all.
  saveAll: (tasks) =>
    withTransaction(pool, (client) => Promise.all(tasks.map((task) => upsert(client, task)))),
  remove: async (userId, id) => {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [
      id,
      userId,
    ]);
    return rowCount === 1;
  },
});
