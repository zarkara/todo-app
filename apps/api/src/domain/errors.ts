export type ErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'UNAUTHORIZED' | 'RATE_LIMITED';

// Expected business failures; the HTTP layer maps each code to a status.
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many attempts, please try again later') {
    super('RATE_LIMITED', message);
  }
}
