export type LocationPoint = {
  latitude: number;
  longitude: number;
  capturedAt: number;
};

export type LocationInput = LocationPoint & { expiresAt?: number };
export type LocationState = LocationInput & { stoppedAt?: number };

export type LocationUpdate = {
  messageId: string;
  location: LocationState;
};

export const LOCATION_DURATIONS = [
  { minutes: 15, label: '15 minutos' },
  { minutes: 60, label: '1 hora' },
  { minutes: 480, label: '8 horas' },
] as const;

export function googleMapsUrl({ latitude, longitude }: LocationPoint) {
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(`${latitude},${longitude}`)
  );
}

export function mergeLocation(previous: LocationState | undefined, incoming: LocationState) {
  if (!previous) return incoming;
  if (incoming.capturedAt < previous.capturedAt && !incoming.stoppedAt) return previous;
  const newest = incoming.capturedAt >= previous.capturedAt ? incoming : previous;
  const stoppedAt = previous.stoppedAt ?? incoming.stoppedAt;
  return stoppedAt ? { ...newest, stoppedAt } : newest;
}
