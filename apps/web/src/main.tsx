import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App, ROUTER_FUTURE_FLAGS } from './App';
import { createApiClient } from './api/client';
import { createQueryClient } from './api/queryClient';
import { createSessionStore } from './auth/sessionStore';
import './styles.css';

const store = createSessionStore(window.sessionStorage);
const client = createApiClient({
  baseUrl: '/api',
  getToken: () => store.getSession()?.token ?? null,
});
const queryClient = createQueryClient({ onUnauthorized: store.clearSession });

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter future={ROUTER_FUTURE_FLAGS}>
      <App store={store} client={client} queryClient={queryClient} />
    </BrowserRouter>
  </StrictMode>,
);
