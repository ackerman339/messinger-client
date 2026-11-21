import { Navigate } from 'react-router-dom';
import { useUserContext } from '@context/user-context';
import type { ReactNode } from 'react';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { signedOut } = useUserContext();
  return signedOut ? <Navigate to='/sign-in' replace /> : children;
}
