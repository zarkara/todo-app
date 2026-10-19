import type { AuthResponse, Credentials, Registration } from '@todo/shared';
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

// Signing in and signing up both end by starting a session for the returned user.
const useStartSession = <Input,>(request: (input: Input) => Promise<AuthResponse>) => {
  const store = useSessionStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (session) => {
      // Never show one user's cached tasks to the next.
      queryClient.removeQueries();
      store.setSession(session);
    },
  });
};

export const useSignIn = () => {
  const api = useApiClient();
  return useStartSession((credentials: Credentials) => api.login(credentials));
};

export const useRegister = () => {
  const api = useApiClient();
  return useStartSession((registration: Registration) => api.register(registration));
};

export const useSignOut = () => {
  const store = useSessionStore();
  const queryClient = useQueryClient();
  return useCallback(() => {
    store.clearSession();
    queryClient.removeQueries();
  }, [store, queryClient]);
};
