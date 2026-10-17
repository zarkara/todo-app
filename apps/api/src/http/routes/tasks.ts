import {
  createTaskSchema,
  listTasksQuerySchema,
  reorderTasksSchema,
  updateTaskSchema,
} from '@todo/shared';
import { type Request, Router } from 'express';
import type { TaskService } from '../../services/taskService';
import { asyncHandler } from '../middleware';

const taskIdOf = (req: Request) => String(req.params.id);

export const taskRoutes = (tasks: TaskService) =>
  Router()
    .get(
      '/',
      asyncHandler(async (req, res) => {
        const { q } = listTasksQuerySchema.parse(req.query);
        res.json(await tasks.list(res.locals.userId, q));
      }),
    )
    .post(
      '/',
      asyncHandler(async (req, res) => {
        const input = createTaskSchema.parse(req.body);
        res.status(201).json(await tasks.create(res.locals.userId, input));
      }),
    )
    .put(
      '/order',
      asyncHandler(async (req, res) => {
        const { ids } = reorderTasksSchema.parse(req.body);
        res.json(await tasks.reorder(res.locals.userId, ids));
      }),
    )
    .get(
      '/:id',
      asyncHandler(async (req, res) => {
        res.json(await tasks.get(res.locals.userId, taskIdOf(req)));
      }),
    )
    .patch(
      '/:id',
      asyncHandler(async (req, res) => {
        const patch = updateTaskSchema.parse(req.body);
        res.json(await tasks.update(res.locals.userId, taskIdOf(req), patch));
      }),
    )
    .delete(
      '/:id',
      asyncHandler(async (req, res) => {
        await tasks.remove(res.locals.userId, taskIdOf(req));
        res.status(204).end();
      }),
    );
