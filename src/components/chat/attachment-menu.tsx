import { useRef } from 'react';
import { DropdownMenu } from 'radix-ui';
import { FileText, Image, Paperclip, Plus, Video } from 'lucide-react';

type AttachmentMenuProps = {
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
};

export function AttachmentMenu({ disabled = false, onFilesSelected }: AttachmentMenuProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 0) {
      onFilesSelected(files);
    }

    event.target.value = '';
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type='button'
            disabled={disabled}
            className='grid size-11 place-items-center rounded-full text-text-secondary transition hover:bg-slate-100 hover:text-text-primary disabled:opacity-40 cursor-pointer'
            aria-label='enviar archivo'
            title='Enviar archivo'
          >
            <Plus className='size-5' />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side='top'
            align='start'
            sideOffset={8}
            className='z-50 min-w-52 rounded-xl border border-border bg-bg-app p-1.5 shadow-lg'
          >
            <DropdownMenu.Item
              className='flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-slate-100'
              onSelect={(event) => {
                event.preventDefault();
                imageInputRef.current?.click();
              }}
            >
              <Image className='size-5' />
              <span>Fotos</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className='flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-slate-100'
              onSelect={(event) => {
                event.preventDefault();
                videoInputRef.current?.click();
              }}
            >
              <Video className='size-5' />
              <span>Videos</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className='flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-slate-100'
              onSelect={(event) => {
                event.preventDefault();
                pdfInputRef.current?.click();
              }}
            >
              <FileText className='size-5' />
              <span>PDF</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className='flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-slate-100'
              onSelect={(event) => {
                event.preventDefault();
                documentInputRef.current?.click();
              }}
            >
              <Paperclip className='size-5' />
              <span>Documentos</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <input
        ref={imageInputRef}
        type='file'
        accept='image/*'
        multiple
        hidden
        onChange={handleFileChange}
      />

      <input
        ref={videoInputRef}
        type='file'
        accept='video/*'
        multiple
        hidden
        onChange={handleFileChange}
      />

      <input
        ref={pdfInputRef}
        type='file'
        accept='application/pdf'
        multiple
        hidden
        onChange={handleFileChange}
      />

      <input
        ref={documentInputRef}
        type='file'
        accept='.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv'
        multiple
        hidden
        onChange={handleFileChange}
      />
    </>
  );
}
