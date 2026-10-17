import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { NotFoundError, UnauthorizedError } from '../domain/errors';

declare module 'express-serve-static-core' {
  interface Locals {
    userId: string;
  }
}

type AsyncRoute = (req: Request, res: Response) => Promise<void>;

// Express 4 ignores rejected promises; forward them to the error handler instead.
export const asyncHandler =
  (route: AsyncRoute): RequestHandler =>
  (req, res, next) => {
    route(req, res).catch(next);
  };

// RFC 7235: the scheme name is case-insensitive.
const BEARER = /^Bearer\s+(\S+)$/i;

const bearerTokenOf = (header = ''): string | undefined => BEARER.exec(header)?.[1];

export const requireAuth =
  (authenticate: (token: string) => Promise<{ userId: string }>): RequestHandler =>
  (req, res, next) => {
    const token = bearerTokenOf(req.headers.authorization);
    if (!token) {
      next(new UnauthorizedError());
      return;
    }
    // Errors thrown by later handlers must not be routed back through this rejection path.
    authenticate(token).then(({ userId }) => {
      res.locals.userId = userId;
      next();
    }, next);
  };

export const routeNotFound = (_req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError('Route not found'));
};
