import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

const MAX_RETRIES = 2;
const STALE_TIME_MS = 30_000;

// Client errors (4xx) will not succeed on a retry; transient failures might.
export const shouldRetry = (failureCount: number, error: Error): boolean =>
  failureCount < MAX_RETRIES && !(error instanceof ApiError && error.status < 500);

const isUnauthorized = (error: Error) => error instanceof ApiError && error.status === 401;

export const createQueryClient = ({ onUnauthorized }: { onUnauthorized: () => void }) => {
  const signOutIfUnauthorized = (error: Error) => {
    if (isUnauthorized(error)) onUnauthorized();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: signOutIfUnauthorized }),
    mutationCache: new MutationCache({ onError: signOutIfUnauthorized }),
    defaultOptions: { queries: { retry: shouldRetry, staleTime: STALE_TIME_MS } },
  });
};
