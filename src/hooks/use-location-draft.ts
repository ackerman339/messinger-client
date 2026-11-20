import { useEffect, useState } from 'react';
import { getDeviceLocation } from '../services/location-device';
import type { LocationInput, LocationPoint } from '../types/location';

export function useLocationDraft(onSend: (location: LocationInput) => boolean) {
  const [point, setPoint] = useState<LocationPoint>();
  const [mode, setMode] = useState<'current' | 'live'>();
  const [duration, setDuration] = useState(15);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getDeviceLocation().then(
      (location) => {
        if (!cancelled) setPoint(location);
      },
      (failure: unknown) => {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : 'No se pudo obtener la ubicación.');
        }
      },
    );
    return () => { cancelled = true; };
  }, [attempt]);

  function locate() {
    setError('');
    setPoint(undefined);
    setAttempt((attempt) => attempt + 1);
  }

  function submit() {
    if (!mode || !point) return;
    const location = mode === 'live'
      ? { ...point, expiresAt: Date.now() + duration * 60_000 }
      : point;
    if (!onSend(location)) setError('No se pudo guardar la ubicación en este dispositivo.');
  }

  return { point, mode, setMode, duration, setDuration, error, locate, submit };
}
