import { useEffect, useState } from 'react';
import { authApi } from '../api/auth';
import { connect, disconnect } from '../clients/websocket-client';
import { UserContext } from '../context/user-context';

import type { ReactNode } from 'react';
import type { SignInDto, SignUpDto } from '../api/auth';
import type { User } from '../types/user';

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, try to restore the session from the httpOnly cookie
  useEffect(() => {
    async function bootstrapSession() {
      try {
        const user = await authApi.me();
        setUser(user);
        connect(import.meta.env.VITE_WEB_SOCKET_URL);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    bootstrapSession();
  }, []);

  const signIn = async (data: SignInDto) => {
    const user = await authApi.signIn(data);
    setUser(user);
    connect(import.meta.env.VITE_WEB_SOCKET_URL);
  };

  const signUp = async (data: SignUpDto) => {
    const response = await authApi.signUp(data);
    return response;
  };

  const logout = async () => {
    await authApi.logout();
    disconnect();
    setUser(null);
  };

  return (
    <UserContext.Provider value={{ user, loading, signIn, signUp, logout }}>
      {children}
    </UserContext.Provider>
  );
}
