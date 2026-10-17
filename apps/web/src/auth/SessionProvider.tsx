import type { Credentials } from '@todo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';
import { useApiClient } from '../api/ApiClientProvider';
import type { SessionStore } from './sessionStore';

const SessionContext = createContext<SessionStore | null>(null);

export const SessionProvider = ({
  store,
  children,
}: {
  store: SessionStore;
  children: ReactNode;
}) => <SessionContext.Provider value={store}>{children}</SessionContext.Provider>;

const useSessionStore = (): SessionStore => {
  const store = useContext(SessionContext);
  if (!store) throw new Error('useSessionStore must be used inside a SessionProvider');
  return store;
};

export const useSession = () => {
  const store = useSessionStore();
  return useSyncExternalStore(store.subscribe, store.getSession);
};

export const useSignIn = () => {
  const api = useApiClient();
  const store = useSessionStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: Credentials) => api.login(credentials),
    onSuccess: (session) => {
      // Never show one user's cached tasks to the next.
      queryClient.removeQueries();
      store.setSession(session);
    },
  });
};

export const useSignOut = () => {
  const store = useSessionStore();
  const queryClient = useQueryClient();
  return useCallback(() => {
    store.clearSession();
    queryClient.removeQueries();
  }, [store, queryClient]);
};
