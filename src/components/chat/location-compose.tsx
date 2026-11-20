import { Dialog } from 'radix-ui';
import { useLocationDraft } from '@/hooks/use-location-draft';
import { LOCATION_DURATIONS } from '@/types/location';
import type { LocationInput } from '@/types/location';
import { LocationMap } from './location-map';

export function LocationCompose({
  onClose,
  onSend,
}: {
  onClose: () => void;
  onSend: (location: LocationInput) => boolean;
}) {
  const { point, mode, setMode, duration, setDuration, error, locate, submit } =
    useLocationDraft(onSend);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[900] bg-black/40' />
        <Dialog.Content className='fixed top-1/2 left-1/2 z-[901] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl border border-border bg-bg-app p-4 text-text-primary shadow-xl'>
          <Dialog.Title className='font-semibold'>Compartir ubicación</Dialog.Title>
          <Dialog.Description className='sr-only'>
            Revisa el punto y elige cuándo compartirlo.
          </Dialog.Description>
          {point ? (
            <LocationMap point={point} eager />
          ) : (
            <p role='status' className='text-sm text-text-secondary'>
              {error ? 'Vista previa no disponible' : 'Obteniendo ubicación…'}
            </p>
          )}
          {error && (
            <div role='alert' className='space-y-1 text-sm text-red-600'>
              <p>{error}</p>
              {!point && (
                <button type='button' className='underline' onClick={locate}>
                  Reintentar
                </button>
              )}
            </div>
          )}
          <fieldset className='flex flex-wrap gap-4 text-sm'>
            <legend className='sr-only'>Tipo de ubicación</legend>
            <label className='flex items-center gap-2'>
              <input
                type='radio'
                name='location-mode'
                checked={mode === 'current'}
                onChange={() => setMode('current')}
              />
              Ubicación actual
            </label>
            <label className='flex items-center gap-2'>
              <input
                type='radio'
                name='location-mode'
                checked={mode === 'live'}
                onChange={() => setMode('live')}
              />
              En tiempo real
            </label>
          </fieldset>
          {mode === 'live' && (
            <div className='space-y-2 text-sm'>
              <label className='flex items-center justify-between gap-3'>
                Compartir durante
                <select
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className='rounded-md border border-border bg-bg-app p-1.5'
                >
                  {LOCATION_DURATIONS.map(({ minutes, label }) => (
                    <option key={minutes} value={minutes}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <p className='text-xs text-text-secondary'>
                Mantén la pestaña visible para actualizar la posición.
              </p>
            </div>
          )}
          <div className='flex justify-end gap-2'>
            <Dialog.Close className='rounded-lg px-3 py-2 text-sm hover:bg-bg-bubble-other'>
              Cancelar
            </Dialog.Close>
            <button
              type='button'
              onClick={submit}
              disabled={!point || !mode}
              className='rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50'
            >
              Enviar
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
