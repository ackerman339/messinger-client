import { Volume2 } from 'lucide-react';
import { useStreamPlayback } from '@hooks/use-stream-playback';

export function CallStream({
  stream,
  muted = false,
  audioOnly = false,
  onElement,
}: {
  stream?: MediaStream;
  muted?: boolean;
  audioOnly?: boolean;
  onElement?: (element: HTMLVideoElement | null) => void;
}) {
  const { ref, blocked, play } = useStreamPlayback(stream, onElement);

  return (
    <div className={`relative w-full ${audioOnly ? 'h-auto text-center' : 'h-full'}`}>
      <video
        ref={ref}
        className='size-full object-cover'
        autoPlay
        playsInline
        muted={muted}
        hidden={audioOnly}
        aria-label={muted ? 'Vista de tu cámara' : 'Medios del participante'}
      />
      {blocked && (
        <button
          type='button'
          className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-[20px] bg-bg-app px-[15px] py-[9px] text-xs whitespace-nowrap text-text-primary focus-visible:outline-3 focus-visible:outline-offset-5 focus-visible:outline-accent ${audioOnly ? 'static mb-3' : 'absolute bottom-4 left-1/2 -translate-x-1/2'}`}
          onClick={play}
        >
          <Volume2 size={16} /> Reproducir {audioOnly ? 'audio' : 'audio y video'}
        </button>
      )}
    </div>
  );
}
