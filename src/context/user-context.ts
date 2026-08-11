import { createContext, useContext } from 'react';

import type { User } from '../types/user';
import type { SignInDto, SignUpDto } from '../services/auth';

interface UserContextValue {
  user: User | null;
  loading: boolean;
  signIn: (data: SignInDto) => Promise<void>;
  signUp: (data: SignUpDto) => Promise<{ loginKey: string }>;
  logout: () => Promise<void>;
}

export const UserContext = createContext<UserContextValue | undefined>(undefined);

export function useUserContext() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a <UserProvider>');
  return ctx;
}
