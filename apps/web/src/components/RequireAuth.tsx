import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession, useSignOut } from '../auth/SessionProvider';

// Layout route: signed-in users get the app shell, everyone else goes to sign in.
export const RequireAuth = () => {
  const session = useSession();
  const signOut = useSignOut();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return (
    <>
      <header className="app-header">
        <Link to="/tasks" className="brand">
          To-Do
        </Link>
        <span className="app-user">{session.user.email}</span>
        <button type="button" className="button button-quiet" onClick={signOut}>
          Sign out
        </button>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
};
