import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, type ErrorCode } from '../domain/errors';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION: 400,
  UNAUTHORIZED: 401,
};

interface ErrorResponse {
  status: number;
  body: { error: { code: string; message: string; details?: unknown } };
}

const errorResponse = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
): ErrorResponse => ({
  status,
  body: { error: { code, message, ...(details === undefined ? {} : { details }) } },
});

// body-parser signals malformed or oversized bodies with an http-errors object.
const isClientRequestError = (error: unknown): error is { status: number } =>
  typeof error === 'object' &&
  error !== null &&
  'type' in error &&
  'status' in error &&
  typeof error.status === 'number' &&
  error.status < 500;

const describeError = (error: unknown): ErrorResponse => {
  if (error instanceof AppError) {
    return errorResponse(STATUS_BY_CODE[error.code], error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    const details = error.issues.map(({ path, message }) => ({ path, message }));
    return errorResponse(400, 'VALIDATION', 'Invalid request', details);
  }
  if (isClientRequestError(error)) {
    return errorResponse(error.status, 'VALIDATION', 'Malformed request body');
  }
  return errorResponse(500, 'INTERNAL', 'Something went wrong');
};

export const createErrorHandler =
  (reportError: (error: unknown) => void): ErrorRequestHandler =>
  (error, _req, res, _next) => {
    const { status, body } = describeError(error);
    if (status >= 500) reportError(error);
    res.status(status).json(body);
  };
