import express, { type Express } from 'express';
import { createErrorHandler } from './http/errorHandler';
import { requireAuth, routeNotFound } from './http/middleware';
import { authRoutes } from './http/routes/auth';
import { taskRoutes } from './http/routes/tasks';
import type { AuthService } from './services/authService';
import type { TaskService } from './services/taskService';

const MAX_BODY_SIZE = '100kb';

export interface AppDependencies {
  authService: AuthService;
  taskService: TaskService;
  reportError: (error: unknown) => void;
}

export const buildApp = ({ authService, taskService, reportError }: AppDependencies): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: MAX_BODY_SIZE }));
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/auth', authRoutes(authService));
  app.use('/tasks', requireAuth(authService.authenticate), taskRoutes(taskService));
  app.use(routeNotFound);
  app.use(createErrorHandler(reportError));

  return app;
};
