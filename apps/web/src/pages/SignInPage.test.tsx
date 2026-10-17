import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PASSWORD } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';

describe('SignInPage', () => {
  const fillIn = async (
    user: ReturnType<typeof renderApp>['user'],
    email: string,
    password: string,
  ) => {
    if (email) await user.type(await screen.findByLabelText('Email'), email);
    if (password) await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
  };

  it('signs in with valid credentials and shows the task list', async () => {
    const { user, store } = renderApp({ route: '/login' });

    await fillIn(user, 'ada@example.com', PASSWORD);

    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
    expect(store.getSession()?.user.email).toBe('ada@example.com');
  });

  it('shows the server message for wrong credentials', async () => {
    const { user } = renderApp({ route: '/login' });

    await fillIn(user, 'ada@example.com', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('validates the fields before calling the API', async () => {
    const { user } = renderApp({ route: '/login' });

    await fillIn(user, 'not-an-email', '');

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('skips the form when already signed in', async () => {
    renderApp({ route: '/login', signedInAs: 'ada' });

    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
  });
});
