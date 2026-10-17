import type { AuthResponse } from '@todo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore, SESSION_STORAGE_KEY } from './sessionStore';

const session: AuthResponse = { token: 'token-ada', user: { id: 'ada', email: 'ada@example.com' } };

describe('sessionStore', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('starts signed out', () => {
    expect(createSessionStore(window.sessionStorage).getSession()).toBeNull();
  });

  it('persists a session and notifies subscribers', () => {
    const store = createSessionStore(window.sessionStorage);
    const listener = vi.fn();
    store.subscribe(listener);

    store.setSession(session);

    expect(store.getSession()).toEqual(session);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createSessionStore(window.sessionStorage).getSession()).toEqual(session);
  });

  it('clears the session and notifies subscribers', () => {
    const store = createSessionStore(window.sessionStorage);
    store.setSession(session);
    const listener = vi.fn();
    store.subscribe(listener);

    store.clearSession();

    expect(store.getSession()).toBeNull();
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['the wrong shape', JSON.stringify({ token: 42 })],
  ])('ignores %s left in storage', (_label, stored) => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, stored);

    expect(createSessionStore(window.sessionStorage).getSession()).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const store = createSessionStore(window.sessionStorage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.setSession(session);

    expect(listener).not.toHaveBeenCalled();
  });
});
