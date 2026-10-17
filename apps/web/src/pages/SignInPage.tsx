import { loginSchema } from '@todo/shared';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession, useSignIn } from '../auth/SessionProvider';
import { TextField } from '../components/TextField';

type FieldErrors = Partial<Record<'email' | 'password', string[]>>;

const DEFAULT_DESTINATION = '/tasks';

// RequireAuth stores the page the visitor wanted in router state; return there after sign-in.
const destinationFrom = (state: unknown): string =>
  typeof state === 'object' && state !== null && 'from' in state && typeof state.from === 'string'
    ? state.from
    : DEFAULT_DESTINATION;

export const SignInPage = () => {
  const session = useSession();
  const location = useLocation();
  const signIn = useSignIn();
  const [errors, setErrors] = useState<FieldErrors>({});

  if (session) return <Navigate to={destinationFrom(location.state)} replace />;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = loginSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors);
      return;
    }
    setErrors({});
    signIn.mutate(result.data);
  };

  return (
    <main className="page page-narrow">
      <form className="card" onSubmit={handleSubmit} noValidate>
        <h1>Sign in</h1>
        {signIn.isError && (
          <p role="alert" className="error-banner">
            {signIn.error.message}
          </p>
        )}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          error={errors.email?.[0]}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.[0]}
        />
        <button type="submit" className="button button-block" disabled={signIn.isPending}>
          Sign in
        </button>
      </form>
    </main>
  );
};
