import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

describe('SignUpPage', () => {
  const fillIn = async (
    user: ReturnType<typeof renderApp>['user'],
    email: string,
    password: string,
  ) => {
    if (email) await user.type(await screen.findByLabelText('Email'), email);
    if (password) await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
  };

  it('creates the account, signs in and lands on the empty task list', async () => {
    const { user, store } = renderApp({ route: '/signup' });

    await fillIn(user, 'lin@example.com', 'a-new-pass');

    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
    expect(await screen.findByText('No tasks yet. Add your first one above.')).toBeInTheDocument();
    expect(store.getSession()?.user.email).toBe('lin@example.com');
  });

  it('explains when the email already has an account, and links to sign in', async () => {
    const { user } = renderApp({ route: '/signup' });

    await fillIn(user, 'ada@example.com', 'a-new-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists',
    );
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('states the password rule up front and checks the fields before calling the API', async () => {
    const { user } = renderApp({ route: '/signup' });

    expect(await screen.findByText('8 to 64 characters')).toBeInTheDocument();
    await fillIn(user, 'not-an-email', 'short');

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Use 8 to 64 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('is reachable from the sign-in page', async () => {
    const { user } = renderApp({ route: '/login' });

    await user.click(await screen.findByRole('link', { name: 'Create an account' }));

    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
  });

  it('skips the form when already signed in', async () => {
    renderApp({ route: '/signup', signedInAs: 'ada' });

    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
  });
});
