import { createContext, type ReactNode, useContext } from 'react';
import type { ApiClient } from './client';

const ApiClientContext = createContext<ApiClient | null>(null);

interface ApiClientProviderProps {
  client: ApiClient;
  children: ReactNode;
}

export const ApiClientProvider = ({ client, children }: ApiClientProviderProps) => (
  <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>
);

export const useApiClient = (): ApiClient => {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error('useApiClient must be used inside an ApiClientProvider');
  return client;
};
