import { Download, File, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fileService } from '@/services/files';

type FileAttachmentProps = {
  attachmentId: string;
  fileName: string;
  contentType: string;
};

export function FileAttachment({ attachmentId, fileName, contentType }: FileAttachmentProps) {
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

        console.error('[attachment:file] failed to load:', error);

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
      <div className='flex max-w-xs items-center gap-3 rounded-lg bg-slate-100 px-3 py-2'>
        <LoaderCircle className='shrink-0 animate-spin text-accent' size={20} />

        <span className='truncate text-sm text-text-secondary'>{fileName}</span>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className='flex max-w-xs items-center gap-3 rounded-lg bg-slate-100 px-3 py-2'>
        <File size={22} className='shrink-0 text-text-secondary' />

        <div className='min-w-0'>
          <p className='truncate text-sm font-medium'>{fileName}</p>

          <p className='text-xs text-text-secondary'>No se pudo cargar</p>
        </div>
      </div>
    );
  }

  return (
    <a
      href={url}
      download={fileName}
      target='_blank'
      rel='noopener noreferrer'
      className='flex max-w-xs items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 transition hover:bg-slate-200'
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <File size={24} className='shrink-0 text-accent' />

      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium text-text-primary'>{fileName}</p>
        <p className='truncate text-xs text-text-secondary'>{contentType}</p>
      </div>

      <Download size={20} className='shrink-0 text-text-secondary' />
    </a>
  );
}
