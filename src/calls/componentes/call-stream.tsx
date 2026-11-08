import { Volume2 } from 'lucide-react';
import { useStreamPlayback } from '@hooks/use-stream-playback';

export function CallStream({
  stream,
  muted = false,
  audioOnly = false,
}: {
  stream?: MediaStream;
  muted?: boolean;
  audioOnly?: boolean;
}) {
  const { ref, blocked, play } = useStreamPlayback(stream);

  return (
    <div className={audioOnly ? 'call-stream call-stream--audio' : 'call-stream'}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        hidden={audioOnly}
        aria-label={muted ? 'Vista de tu cámara' : 'Medios del participante'}
      />
      {blocked && (
        <button type='button' className='call-play-button' onClick={play}>
          <Volume2 size={16} /> Reproducir {audioOnly ? 'audio' : 'audio y video'}
        </button>
      )}
    </div>
  );
}
