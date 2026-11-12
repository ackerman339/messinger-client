import { Phone, Video } from 'lucide-react';
import { useCallActions } from '@hooks/use-call-actions';

export function CallButtons({ participantId }: { participantId: string }) {
  const { busy, startAudio, startVideo } = useCallActions(participantId);

  return (
    <>
      <button
        type='button'
        className='grid size-11 cursor-pointer place-items-center rounded-full text-accent transition-colors duration-200 enabled:hover:bg-accent/12 focus-visible:outline-3 focus-visible:outline-offset-5 focus-visible:outline-accent disabled:cursor-default disabled:opacity-35'
        disabled={busy}
        aria-label='Llamar'
        title='Llamar'
        onClick={startAudio}
      >
        <Phone size={21} />
      </button>
      <button
        type='button'
        className='grid size-11 cursor-pointer place-items-center rounded-full text-accent transition-colors duration-200 enabled:hover:bg-accent/12 focus-visible:outline-3 focus-visible:outline-offset-5 focus-visible:outline-accent disabled:cursor-default disabled:opacity-35'
        disabled={busy}
        aria-label='Videollamada'
        title='Videollamada'
        onClick={startVideo}
      >
        <Video size={23} />
      </button>
    </>
  );
}
