import { Phone, Users, Video } from 'lucide-react';
import { useGroupCall } from './group-call-context';

export function GroupCallButtons() {
  const { available, active, busy, individualBusy, open } = useGroupCall();
  if (!available) return null;
  const disabled = busy || individualBusy;
  const iconClass =
    'grid size-10 place-items-center rounded-full text-accent enabled:cursor-pointer disabled:cursor-not-allowed enabled:hover:bg-accent/15 disabled:opacity-40';

  return active ? (
    <button
      type='button'
      className='flex items-center gap-2 rounded-full bg-accent/15 px-3 py-2 text-sm font-medium text-accent enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40'
      disabled={disabled}
      aria-label='Unirse a la llamada grupal'
      title='Unirse a la llamada grupal'
      onClick={() => open(active.media)}
    >
      <Users size={18} />
      <span className='hidden sm:inline'>Unirse</span>
    </button>
  ) : (
    <>
      <button
        type='button'
        className={iconClass}
        disabled={disabled}
        aria-label='Iniciar llamada grupal'
        title='Iniciar llamada grupal'
        onClick={() => open('audio')}
      >
        <Phone size={20} />
      </button>
      <button
        type='button'
        className={iconClass}
        disabled={disabled}
        aria-label='Iniciar videollamada grupal'
        title='Iniciar videollamada grupal'
        onClick={() => open('video')}
      >
        <Video size={22} />
      </button>
    </>
  );
}
