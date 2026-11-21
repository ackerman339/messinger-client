import { ExternalLink } from 'lucide-react';
import { useLocationStatus } from '@/hooks/use-location-status';
import { googleMapsUrl } from '@/types/location';
import type { LocationState } from '@/types/location';
import { LocationMap } from './location-map';

export function LocationContent({
  location,
  onStop,
  pending,
}: {
  location: LocationState;
  onStop?: () => void;
  pending: boolean;
}) {
  const { live, label } = useLocationStatus(location);

  return (
    <div className='w-64 max-w-full space-y-1.5'>
      <div className='relative isolate'>
        <LocationMap point={location} />
        <a
          href={googleMapsUrl(location)}
          target='_blank'
          rel='noopener noreferrer'
          onClick={(event) => event.stopPropagation()}
          className='absolute inset-0 z-[550] rounded-lg'
          aria-label={label + '. Abrir en Google Maps'}
        />
      </div>
      <span className='flex items-center justify-between gap-2 text-sm font-medium text-accent'>
        {label}
        <ExternalLink size={15} aria-hidden='true' />
      </span>
      {location.expiresAt && !pending && (
        <p className='text-[0.6875rem] text-text-secondary'>
          Última posición ·{' '}
          {new Date(location.capturedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}
      {live && onStop && (
        <button
          type='button'
          onClick={(event) => {
            event.stopPropagation();
            onStop();
          }}
          className='rounded px-1 py-1 text-xs text-text-secondary underline'
        >
          {pending ? 'Cancelar envío' : 'Dejar de compartir'}
        </button>
      )}
    </div>
  );
}
