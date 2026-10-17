import type { Task } from '@todo/shared';
import { render } from '@testing-library/react';
import type { RequestHandler } from 'msw';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App, ROUTER_FUTURE_FLAGS } from '../App';
import { createApiClient } from '../api/client';
import { createQueryClient } from '../api/queryClient';
import { createSessionStore } from '../auth/sessionStore';
import { createFakeApi, tokenFor } from './fakeApi';
import { server } from './server';

const EMAILS: Record<string, string> = { ada: 'ada@example.com', grace: 'grace@example.com' };

interface RenderAppOptions {
  route?: string;
  signedInAs?: 'ada' | 'grace';
  tasks?: Task[];
  // Extra MSW handlers that take precedence over the fake API, e.g. to simulate failures.
  handlers?: RequestHandler[];
}

// Renders the real app (providers + routes) against the in-memory fake API.
export const renderApp = ({
  route = '/',
  signedInAs,
  tasks = [],
  handlers = [],
}: RenderAppOptions = {}) => {
  window.sessionStorage.clear();
  const fakeApi = createFakeApi(tasks);
  server.use(...fakeApi.handlers);
  server.use(...handlers);

  const store = createSessionStore(window.sessionStorage);
  if (signedInAs) {
    store.setSession({
      token: tokenFor(signedInAs),
      user: { id: signedInAs, email: EMAILS[signedInAs] ?? '' },
    });
  }
  const client = createApiClient({
    baseUrl: '/api',
    getToken: () => store.getSession()?.token ?? null,
  });
  const queryClient = createQueryClient({ onUnauthorized: store.clearSession });

  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[route]} future={ROUTER_FUTURE_FLAGS}>
      <App store={store} client={client} queryClient={queryClient} />
    </MemoryRouter>,
  );

  return { ...view, user, store, fakeApi };
};
