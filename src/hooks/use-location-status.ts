import { useEffect, useState } from 'react';
import type { LocationState } from '../types/location';

export function useLocationStatus(location: LocationState) {
  const [now, setNow] = useState(Date.now);
  const expiration = location.stoppedAt ? undefined : location.expiresAt;

  useEffect(() => {
    if (expiration === undefined) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, expiration - Date.now()));
    return () => clearTimeout(timer);
  }, [expiration]);

  const live = expiration !== undefined && expiration > now;
  const label = !location.expiresAt
    ? 'Ubicación compartida'
    : live
      ? 'Ubicación en tiempo real'
      : 'Ubicación finalizada';
  return { live, label };
}
