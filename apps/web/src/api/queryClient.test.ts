import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { shouldRetry } from './queryClient';

describe('shouldRetry', () => {
  it.each([
    ['a server error', new ApiError(503, 'UNKNOWN', 'down'), 0, true],
    ['a network failure', new TypeError('Failed to fetch'), 1, true],
    ['a client error', new ApiError(404, 'NOT_FOUND', 'gone'), 0, false],
    ['a failure that already retried twice', new TypeError('Failed to fetch'), 2, false],
  ])('decides whether to retry %s', (_label, error, failureCount, expected) => {
    expect(shouldRetry(failureCount, error)).toBe(expected);
  });
});
