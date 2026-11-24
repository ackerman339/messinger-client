import { Download, File, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAttachmentSource } from '@/hooks/use-attachment-source';

type FileAttachmentProps = {
  attachmentId: string;
  fileName: string;
  contentType: string;
};

const rowClass = 'flex max-w-xs items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 text-left';
const availableClass = 'cursor-pointer transition hover:bg-slate-200';

export function FileAttachment({ attachmentId, fileName, contentType }: FileAttachmentProps) {
  const [requested, setRequested] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  const startDownload = useRef(false);
  const { source, error, retry } = useAttachmentSource(attachmentId, contentType, requested);

  useEffect(() => {
    if (!source || !startDownload.current) return;
    startDownload.current = false;
    link.current?.click();
  }, [source]);

  const loading = requested && !source && !error;
  const label = error ? 'Reintentar descarga' : contentType;
  const body = (
    <>
      <File size={24} className='shrink-0 text-accent' />
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium text-text-primary'>{fileName}</p>
        <p className='truncate text-xs text-text-secondary'>{label}</p>
      </div>
      {loading ? (
        <LoaderCircle size={20} className='shrink-0 animate-spin text-accent' aria-label='Descargando' />
      ) : (
        <Download size={20} className='shrink-0 text-text-secondary' />
      )}
    </>
  );

  if (source) {
    return (
      <a ref={link} href={source.url} download={fileName} className={`${rowClass} ${availableClass}`}>
        {body}
      </a>
    );
  }

  return (
    <button
      type='button'
      disabled={loading}
      className={`${rowClass} ${availableClass}`}
      onClick={() => {
        startDownload.current = true;
        setRequested(true);
        if (error) retry();
      }}
      aria-label={error ? `Reintentar descarga de ${fileName}` : `Descargar ${fileName}`}
    >
      {body}
    </button>
  );
}
