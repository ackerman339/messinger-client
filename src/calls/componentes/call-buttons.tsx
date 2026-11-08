import { Phone, Video } from 'lucide-react';
import { useCallActions } from '@hooks/use-call-actions';

export function CallButtons({ participantId }: { participantId: string }) {
  const { busy, startAudio, startVideo } = useCallActions(participantId);

  return (
    <>
      <button
        type='button'
        className='call-header-button'
        disabled={busy}
        aria-label='Llamar'
        title='Llamar'
        onClick={startAudio}
      >
        <Phone size={21} />
      </button>
      <button
        type='button'
        className='call-header-button'
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
