import { messageSync } from '@/services/message-sync';
import { useEffect, useState } from 'react';

import { connect, disconnect } from '@clients/websocket-client';
import { authService } from '@services/auth';
import { webPushService } from '@services/web-push';
import { requestNotificationPermission } from '@/webpush/notification';
import { subscribeToPush } from '@/webpush/push-service';
import { UserContext } from '@context/user-context';

import type { ReactNode } from 'react';
import type { User } from '../types/user';

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function setupNotifications() {
    // if you want to test notification in local set VITE_ENV=staging
    // Then run pnpm build and pnpm preview
    if (import.meta.env.VITE_ENV === 'development') {
      return;
    }

    try {
      await navigator.serviceWorker.ready;
      const permission = await requestNotificationPermission();

      if (permission !== 'granted') {
        return;
      }

      const subscription = await subscribeToPush();
      await webPushService.subscribe(subscription);
    } catch (error) {
      console.error('[PUSH] Error:', error);
    }
  }

  async function removeNotifications() {
    // if you want to test notification in local set VITE_ENV=staging
    // Then run pnpm build and pnpm preview
    if (import.meta.env.VITE_ENV === 'development') {
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        return;
      }

      await webPushService.unsubscribe(subscription.endpoint);
      await subscription.unsubscribe();
    } catch (error) {
      console.error('[PUSH] Error removing subscription:', error);
    }
  }

  useEffect(() => {
    let active = true;
    async function bootstrapSession() {
      try {
        const user = await authService.me();
        if (!active) return;

        messageSync.setAccount(user.id);
        setUser(user);
        if (navigator.onLine) connect(import.meta.env.VITE_WEB_SOCKET_URL);
        void setupNotifications();
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    bootstrapSession();

    return () => {
      active = false;
      messageSync.setAccount();
      disconnect();
    };
  }, []);

  const logout = async () => {
    try {
      await removeNotifications();
      await authService.logout();
    } finally {
      messageSync.setAccount();
      disconnect();
      setUser(null);
    }
  };

  function updateProfile(profile: User) {
    setUser((current) => current?.id === profile.id ? profile : current);
  }

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        updateProfile,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
