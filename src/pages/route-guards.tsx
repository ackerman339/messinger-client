import { Navigate } from 'react-router-dom';
import { useUserContext } from '../context/user-context';
import type { ReactNode } from 'react';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useUserContext();

  if (loading) {
    return <RouteLoader />;
  }

  if (!user) {
    return <Navigate to='/signin' replace />;
  }

  return children;
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useUserContext();

  if (loading) {
    return <RouteLoader />;
  }

  if (user) {
    return <Navigate to='/chat' replace />;
  }

  return children;
}

function RouteLoader() {
  return (
    <main className='grid min-h-screen place-items-center bg-bg-chat text-sm text-text-secondary'>
      Loading...
    </main>
  );
}
