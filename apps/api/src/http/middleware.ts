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

const bearerTokenOf = (header = ''): string | undefined => {
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : undefined;
};

export const requireAuth =
  (authenticate: (token: string) => { userId: string }): RequestHandler =>
  (req, res, next) => {
    try {
      const token = bearerTokenOf(req.headers.authorization);
      if (!token) throw new UnauthorizedError();
      res.locals.userId = authenticate(token).userId;
      next();
    } catch (error) {
      next(error);
    }
  };

export const routeNotFound = (_req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError('Route not found'));
};
