import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { TooManyRequestsError } from './domain/errors';
import { createErrorHandler } from './http/errorHandler';
import { requireAuth, routeNotFound } from './http/middleware';
import { authRoutes } from './http/routes/auth';
import { taskRoutes } from './http/routes/tasks';
import type { AuthService } from './services/authService';
import type { TaskService } from './services/taskService';

const MAX_BODY_SIZE = '100kb';
const DEFAULT_LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

export interface AppDependencies {
  authService: AuthService;
  taskService: TaskService;
  reportError: (error: unknown) => void;
  // Throws when a dependency the API needs (the database) is unavailable.
  checkReadiness?: () => Promise<void>;
  // Proxies in front of the API (nginx in compose); needed to rate limit by the real client IP.
  trustProxyHops?: number;
  loginRateLimit?: { limit: number; windowMs: number };
}

// Slows password guessing; errors flow through the shared handler so the body shape is uniform.
// Only failed attempts count, so signing in from another tab or device is never blocked.
const loginLimiter = ({ limit, windowMs }: { limit: number; windowMs: number }) =>
  rateLimit({
    limit,
    windowMs,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new TooManyRequestsError()),
  });

export const buildApp = ({
  authService,
  taskService,
  reportError,
  checkReadiness = async () => {},
  trustProxyHops = 0,
  loginRateLimit = DEFAULT_LOGIN_RATE_LIMIT,
}: AppDependencies): Express => {
  const app = express();

  app.set('trust proxy', trustProxyHops);
  app.use(helmet());
  app.use(express.json({ limit: MAX_BODY_SIZE }));
  // Liveness: the process is up. Readiness: it can also serve requests (database reachable).
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/ready', (_req, res) => {
    checkReadiness().then(
      () => res.json({ status: 'ready' }),
      (error: unknown) => {
        reportError(error);
        res.status(503).json({ error: { code: 'NOT_READY', message: 'Service is not ready' } });
      },
    );
  });
  app.use('/auth/login', loginLimiter(loginRateLimit));
  app.use('/auth', authRoutes(authService));
  app.use('/tasks', requireAuth(authService.authenticate), taskRoutes(taskService));
  app.use(routeNotFound);
  app.use(createErrorHandler(reportError));

  return app;
};
