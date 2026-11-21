import { messageSync } from '@/services/message-sync';
import { useEffect, useRef, useState } from 'react';

import { connect, disconnect } from '@clients/websocket-client';
import { authService } from '@services/auth';
import { webPushService } from '@services/web-push';
import { requestNotificationPermission } from '@/webpush/notification';
import { subscribeToPush } from '@/webpush/push-service';
import { UserContext } from '@context/user-context';
import { clearOfflineSession, isSessionRejected, readOfflineSession, saveOfflineUser } from '@/services/offline-session';

import type { ReactNode } from 'react';
import type { User } from '../types/user';

export function UserProvider({ children }: { children: ReactNode }) {
  const [cachedSession] = useState(readOfflineSession);
  const [user, setUser] = useState<User | null>(cachedSession?.user ?? null);
  const [status, setStatus] = useState<'checking' | 'ready' | 'unavailable' | 'signedOut'>(
    cachedSession?.user === null ? 'signedOut' : 'checking',
  );
  const loggedOut = useRef(false);

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
    if (cachedSession?.user === null) return;
    let disposed = false;
    let controller: AbortController | undefined;
    let retry: number | undefined;
    let notificationsReady = false;
    if (cachedSession?.user) messageSync.setAccount(cachedSession.user.id);

    function goOffline() {
      window.clearTimeout(retry);
      controller?.abort();
      disconnect();
      if (!loggedOut.current) setStatus('unavailable');
    }

    async function verifySession() {
      if (disposed || loggedOut.current) return;
      if (!navigator.onLine) {
        goOffline();
        return;
      }
      window.clearTimeout(retry);
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const profile = await authService.me(current.signal);
        if (disposed || loggedOut.current || current.signal.aborted) return;
        if (cachedSession?.user && cachedSession.user.id !== profile.id) {
          clearOfflineSession(cachedSession.user.id);
        }
        saveOfflineUser(profile);
        setUser(profile);
        messageSync.setAccount(profile.id);
        setStatus('ready');
        connect(import.meta.env.VITE_WEB_SOCKET_URL);
        if (!notificationsReady) {
          notificationsReady = true;
          void setupNotifications();
        }
      } catch (error) {
        if (disposed || loggedOut.current || current.signal.aborted) return;
        if (isSessionRejected(error)) {
          clearOfflineSession();
          messageSync.setAccount();
          disconnect();
          setUser(null);
          setStatus('signedOut');
        } else {
          setStatus('unavailable');
          retry = window.setTimeout(() => void verifySession(), 5000);
        }
      }
    }

    window.addEventListener('online', verifySession);
    window.addEventListener('offline', goOffline);
    void verifySession();

    return () => {
      disposed = true;
      window.clearTimeout(retry);
      controller?.abort();
      window.removeEventListener('online', verifySession);
      window.removeEventListener('offline', goOffline);
      messageSync.setAccount();
      disconnect();
    };
  }, [cachedSession]);

  const logout = async () => {
    loggedOut.current = true;
    clearOfflineSession(user?.id);
    messageSync.setAccount();
    disconnect();
    if (navigator.onLine) {
      void removeNotifications();
      void authService.logout().catch(() => {});
    }
    setUser(null);
    setStatus('signedOut');
  };

  function updateProfile(profile: User) {
    if (user?.id !== profile.id || loggedOut.current) return;
    saveOfflineUser(profile);
    setUser(profile);
  }

  return (
    <UserContext.Provider
      value={{
        user,
        loading: status === 'checking',
        canSync: status === 'ready',
        signedOut: status === 'signedOut',
        updateProfile,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
