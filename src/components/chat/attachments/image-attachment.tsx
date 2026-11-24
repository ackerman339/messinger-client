import { ImageIcon, LoaderCircle } from 'lucide-react';
import { useAttachmentSource } from '@/hooks/use-attachment-source';

type ImageAttachmentProps = {
  attachmentId: string;
  fileName: string;
  contentType: string;
  visible: boolean;
};

export function ImageAttachment({ attachmentId, fileName, contentType, visible }: ImageAttachmentProps) {
  const { source, error, retry } = useAttachmentSource(attachmentId, contentType, visible);

  if (!source) {
    return (
      <div className='flex h-40 w-64 max-w-full items-center justify-center gap-2 rounded-lg bg-slate-100 text-sm text-text-secondary'>
        {error ? (
          <button type='button' onClick={retry} className='cursor-pointer underline'>
            Reintentar imagen
          </button>
        ) : visible ? (
          <LoaderCircle className='animate-spin text-accent' size={22} aria-label='Cargando imagen' />
        ) : (
          <ImageIcon size={22} aria-hidden='true' />
        )}
      </div>
    );
  }

  return (
    <a
      href={source.url}
      target='_blank'
      rel='noopener noreferrer'
      className='block overflow-hidden rounded-lg'
      title={fileName}
    >
      <img
        src={source.url}
        alt={fileName}
        className='block max-h-96 max-w-full rounded-lg object-contain'
      />
    </a>
  );
}
