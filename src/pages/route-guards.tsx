import { Navigate } from 'react-router-dom';
import { useUserContext } from '@context/user-context';
import { useEffect, useState, type ReactNode } from 'react';
import { ServerOff, WifiOff } from 'lucide-react';
import { httpClient } from '@clients/http-client';
import { connect, disconnect } from '@clients/websocket-client';

type ServerStatus = 'checking' | 'online' | 'offline';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useUserContext();

  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      connect(import.meta.env.VITE_WEB_SOCKET_URL);
    };

    const handleOffline = () => {
      setIsOnline(false);
      disconnect();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) {
      return;
    }

    let cancelled = false;

    const checkServer = async () => {
      try {
        await httpClient.get('/', {
          timeout: 5000,
          validateStatus: () => true,
        });

        if (!cancelled) {
          setServerStatus('online');
        }
      } catch {
        if (!cancelled) {
          setServerStatus('offline');
        }
      }
    };

    checkServer();

    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  if (loading || serverStatus === 'checking') {
    return <RouteLoader />;
  }

  if (!isOnline) {
    return <OfflinePage />;
  }

  if (serverStatus === 'offline') {
    return <ServerOfflinePage />;
  }

  if (!user) {
    return <Navigate to='/sign-in' replace />;
  }

  return children;
}

function RouteLoader() {
  return (
    <main className='grid min-h-screen place-items-center bg-bg-chat text-sm text-text-secondary'>
      <div className='flex flex-col items-center gap-3'>
        <div className='size-8 animate-spin rounded-full border-2 border-border border-t-accent' />

        <span>Cargando...</span>
      </div>
    </main>
  );
}

function OfflinePage() {
  return (
    <main className='grid min-h-screen place-items-center bg-bg-chat px-6 text-text-secondary'>
      <div className='flex max-w-sm flex-col items-center text-center'>
        <div className='mb-5 flex size-16 items-center justify-center rounded-full bg-bg-bubble-other shadow-sm'>
          <WifiOff className='size-7 text-text-secondary' strokeWidth={1.8} />
        </div>

        <h1 className='mb-2 text-base font-medium text-text-primary'>Sin conexión a Internet</h1>

        <p className='text-sm leading-5'>
          No tienes conexión a Internet. Comprueba tu conexión e inténtalo nuevamente.
        </p>
      </div>
    </main>
  );
}

function ServerOfflinePage() {
  return (
    <main className='grid min-h-screen place-items-center bg-bg-chat px-6 text-text-secondary'>
      <div className='flex max-w-sm flex-col items-center text-center'>
        <div className='mb-5 flex size-16 items-center justify-center rounded-full bg-bg-bubble-other shadow-sm'>
          <ServerOff className='size-7 text-text-secondary' strokeWidth={1.8} />
        </div>

        <h1 className='mb-2 text-base font-medium text-text-primary'>Servidor no disponible</h1>

        <p className='text-sm leading-5'>
          No podemos conectarnos al servidor. Inténtalo nuevamente en unos momentos.
        </p>
      </div>
    </main>
  );
}
