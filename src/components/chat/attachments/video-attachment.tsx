import { LoaderCircle, Play } from 'lucide-react';
import { useState } from 'react';
import { useAttachmentSource } from '@/hooks/use-attachment-source';

type VideoAttachmentProps = {
  attachmentId: string;
  fileName: string;
  contentType: string;
};

export function VideoAttachment({ attachmentId, fileName, contentType }: VideoAttachmentProps) {
  const [requested, setRequested] = useState(false);
  const { source, error, retry } = useAttachmentSource(attachmentId, contentType, requested);

  if (source) {
    return (
      <video
        controls
        autoPlay
        playsInline
        src={source.url}
        className='max-h-96 max-w-full rounded-lg'
        aria-label={fileName}
      />
    );
  }

  return (
    <button
      type='button'
      onClick={error ? retry : () => setRequested(true)}
      disabled={requested && !error}
      className='flex h-40 w-64 max-w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 text-sm text-text-secondary enabled:cursor-pointer'
      aria-label={error ? 'Reintentar video' : `Reproducir video ${fileName}`}
    >
      {requested && !error ? (
        <LoaderCircle className='shrink-0 animate-spin text-accent' size={22} aria-label='Cargando video' />
      ) : (
        <Play className='shrink-0 text-accent' size={22} />
      )}
      <span className='truncate'>{error ? 'Reintentar video' : fileName}</span>
    </button>
  );
}
