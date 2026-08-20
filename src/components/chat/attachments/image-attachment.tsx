import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fileService } from '@/services/files';

type ImageAttachmentProps = {
  attachmentId: string;
  fileName: string;
};

export function ImageAttachment({ attachmentId, fileName }: ImageAttachmentProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(false);

        const result = await fileService.downloadFile({
          attachmentId,
        });

        if (cancelled) {
          return;
        }

        setUrl(result.url);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error('[attachment:image] failed to load:', error);

        setError(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  if (isLoading) {
    return (
      <div className='flex h-40 w-64 items-center justify-center rounded-lg bg-slate-100'>
        <LoaderCircle className='animate-spin text-accent' size={22} />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className='flex h-20 w-64 items-center justify-center rounded-lg bg-slate-100 text-sm text-text-secondary'>
        No se pudo cargar la imagen
      </div>
    );
  }

  return (
    <a
      href={url}
      target='_blank'
      rel='noopener noreferrer'
      className='block overflow-hidden rounded-lg'
      title={fileName}
    >
      <img
        src={url}
        alt={fileName}
        loading='lazy'
        className='block max-h-96 max-w-full rounded-lg object-contain'
      />
    </a>
  );
}
