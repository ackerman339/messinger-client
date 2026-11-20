import type { LocationPoint } from '../types/location';

function toPoint(position: GeolocationPosition): LocationPoint {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    capturedAt: Math.round(position.timestamp),
  };
}

const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 };

export function getDeviceLocation(): Promise<LocationPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Este navegador no puede obtener la ubicación. Usa una conexión HTTPS.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toPoint(position)),
      ({ code }) =>
        reject(
          new Error(
            code === 1
              ? 'Permite el acceso a la ubicación en el navegador.'
              : code === 3
                ? 'No se pudo obtener la ubicación a tiempo.'
                : 'La ubicación no está disponible.',
          ),
        ),
      options,
    );
  });
}

export function watchDeviceLocation(onPoint: (point: LocationPoint) => void) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return () => {};
  const id = navigator.geolocation.watchPosition(
    (position) => onPoint(toPoint(position)),
    undefined,
    options,
  );
  return () => navigator.geolocation.clearWatch(id);
}
