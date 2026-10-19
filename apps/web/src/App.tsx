import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ApiClientProvider } from './api/ApiClientProvider';
import type { ApiClient } from './api/client';
import { SessionProvider } from './auth/SessionProvider';
import type { SessionStore } from './auth/sessionStore';
import { RequireAuth } from './components/RequireAuth';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { TaskListPage } from './pages/TaskListPage';

// Opt in to React Router v7 behaviour now, so the eventual upgrade is a no-op.
export const ROUTER_FUTURE_FLAGS = { v7_startTransition: true, v7_relativeSplatPath: true };

interface AppProps {
  store: SessionStore;
  client: ApiClient;
  queryClient: QueryClient;
}

// Dependencies are passed in so tests can render the real app against a fake API.
export const App = ({ store, client, queryClient }: AppProps) => (
  <QueryClientProvider client={queryClient}>
    <ApiClientProvider client={client}>
      <SessionProvider store={store}>
        <Routes>
          <Route path="/login" element={<SignInPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/tasks" element={<TaskListPage />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </SessionProvider>
    </ApiClientProvider>
  </QueryClientProvider>
);
