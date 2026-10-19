import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, registerSchema } from '@todo/shared';
import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useRegister, useSession } from '../auth/SessionProvider';
import { TextField } from '../components/TextField';

type FieldErrors = Partial<Record<'email' | 'password', string[]>>;

// A new account is signed straight in and starts on its (empty) task list.
export const SignUpPage = () => {
  const session = useSession();
  const register = useRegister();
  const [errors, setErrors] = useState<FieldErrors>({});

  if (session) return <Navigate to="/tasks" replace />;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = registerSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors);
      return;
    }
    setErrors({});
    register.mutate(result.data);
  };

  return (
    <main className="page page-narrow">
      <form className="card" onSubmit={handleSubmit} noValidate>
        <h1>Create an account</h1>
        {register.isError && (
          <p role="alert" className="error-banner">
            {register.error.message}
          </p>
        )}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={errors.email?.[0]}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint={`${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`}
          error={errors.password?.[0]}
        />
        <button type="submit" className="button button-block" disabled={register.isPending}>
          Create account
        </button>
        <p className="form-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
};
