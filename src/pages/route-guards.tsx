import { Navigate } from 'react-router-dom';
import { useUserContext } from '@context/user-context';
import { useEffect, useState, type ReactNode } from 'react';
import { ServerOff, WifiOff } from 'lucide-react';
import { httpClient } from '@clients/http-client';
import { connect, disconnect } from '@clients/websocket-client';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useUserContext();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (user) connect(import.meta.env.VITE_WEB_SOCKET_URL);
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (user) disconnect();
    };
    if (user && !navigator.onLine) disconnect();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  useEffect(() => {
    if (user || loading || !isOnline) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function checkServer() {
      try {
        await httpClient.get('/', {
          timeout: 5000,
          validateStatus: () => true,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setServerStatus('online');
      } catch {
        if (controller.signal.aborted) return;
        setServerStatus('offline');
        timer = window.setTimeout(checkServer, 5000);
      }
    }
    void checkServer();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [user, loading, isOnline]);

  // Keep mounted chat history and composers available during an outage.
  if (user) return children;
  if (!isOnline) return <UnavailablePage offline />;
  if (loading || serverStatus === 'checking') {
    return (
      <main className='grid min-h-screen place-items-center bg-bg-chat text-sm text-text-secondary'>
        <div className='flex flex-col items-center gap-3'>
          <div className='size-8 animate-spin rounded-full border-2 border-border border-t-accent' />
          <span>Cargando...</span>
        </div>
      </main>
    );
  }
  if (serverStatus === 'offline') return <UnavailablePage />;
  return <Navigate to='/sign-in' replace />;
}

function UnavailablePage({ offline = false }: { offline?: boolean }) {
  const Icon = offline ? WifiOff : ServerOff;
  return (
    <main className='grid min-h-screen place-items-center bg-bg-chat px-6 text-text-secondary'>
      <div className='flex max-w-sm flex-col items-center text-center'>
        <div className='mb-5 flex size-16 items-center justify-center rounded-full bg-bg-bubble-other shadow-sm'>
          <Icon className='size-7 text-text-secondary' strokeWidth={1.8} />
        </div>
        <h1 className='mb-2 text-base font-medium text-text-primary'>
          {offline ? 'Sin conexión a Internet' : 'Servidor no disponible'}
        </h1>
        <p className='text-sm leading-5'>
          {offline ? 'Comprueba tu conexión a Internet.' : 'Volveremos a intentar conectar en unos segundos.'}
        </p>
      </div>
    </main>
  );
}
