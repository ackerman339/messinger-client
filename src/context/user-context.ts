import { createContext, useContext } from 'react';
import { UserRole, UserStatus } from '../api/auth';

import type { SignInDto, SignUpDto } from '../api/auth';

export interface User {
  id: string;
  username: string;
  userCode: string;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

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
