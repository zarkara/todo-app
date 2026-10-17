import { type AuthResponse, authResponseSchema } from '@todo/shared';

export const SESSION_STORAGE_KEY = 'todo.session';

export interface SessionStore {
  getSession(): AuthResponse | null;
  setSession(session: AuthResponse): void;
  clearSession(): void;
  subscribe(listener: () => void): () => void;
}

const readSession = (storage: Storage): AuthResponse | null => {
  const stored = storage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = authResponseSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    // A corrupt entry just means "signed out"; anything else is a real fault.
    if (error instanceof SyntaxError) return null;
    throw error;
  }
};

// sessionStorage keeps the token per tab and drops it when the tab closes.
export const createSessionStore = (storage: Storage): SessionStore => {
  let session = readSession(storage);
  const listeners = new Set<() => void>();

  const publish = (next: AuthResponse | null) => {
    session = next;
    listeners.forEach((listener) => listener());
  };

  return {
    getSession: () => session,
    setSession: (next) => {
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      publish(next);
    },
    clearSession: () => {
      storage.removeItem(SESSION_STORAGE_KEY);
      publish(null);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
