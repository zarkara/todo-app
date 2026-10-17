import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { aTask, API_URL, PASSWORD } from './test/fakeApi';
import { renderApp } from './test/renderApp';

describe('routing and authentication', () => {
  it('sends a signed-out visitor to the sign-in page', async () => {
    renderApp({ route: '/tasks' });

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('returns to the originally requested page after signing in', async () => {
    const { user } = renderApp({
      route: '/tasks/t1',
      tasks: [aTask({ id: 't1', title: 'Buy milk' })],
    });

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Edit task' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Buy milk');
  });

  it('redirects unknown routes to the task list', async () => {
    renderApp({ route: '/nowhere', signedInAs: 'ada' });

    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
  });

  it('shows who is signed in and signs out', async () => {
    const { user, store } = renderApp({ route: '/tasks', signedInAs: 'ada' });

    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(store.getSession()).toBeNull();
  });

  it('signs the user out when the API rejects their token', async () => {
    renderApp({
      route: '/tasks',
      signedInAs: 'ada',
      handlers: [
        http.get(`${API_URL}/tasks`, () =>
          HttpResponse.json(
            { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } },
            { status: 401 },
          ),
        ),
      ],
    });

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
