import { useEffect, useState } from 'react';
import { authApi } from '../api/auth';
import { connect, disconnect } from '../clients/websocket-client';
import { UserContext } from '../context/user-context';

import type { ReactNode } from 'react';
import type { SignInDto, SignUpDto } from '../api/auth';
import type { User } from '../context/user-context';

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // On mount, try to restore the session from the httpOnly cookie
  useEffect(() => {
    async function bootstrapSession() {
      try {
        const res = await authApi.me();
        setUser(res.data.result);
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
    const res = await authApi.signIn(data);
    setUser(res.data.result);
    connect(import.meta.env.VITE_WEB_SOCKET_URL);
  };

  const signUp = async (data: SignUpDto) => {
    const res = await authApi.signUp(data);
    return res.data.result; // expected: { loginKey: string }
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
