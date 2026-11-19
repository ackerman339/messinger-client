import { ChevronDown } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';

export function GroupCallDialog({
  title,
  status,
  children,
  minimize,
}: {
  title: string;
  status: string;
  children: ReactNode;
  minimize?: () => void;
}) {
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-60 grid place-items-center bg-text-primary/45 p-6 backdrop-blur-sm max-[481px]:p-0'>
          <Dialog.Content
            className='flex max-h-[calc(100dvh-48px)] min-h-72 w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-border bg-bg-app p-5 text-text-primary shadow-2xl lg:h-[calc(100dvh-48px)] lg:min-h-0 lg:max-w-7xl lg:p-6 max-[481px]:h-dvh max-[481px]:max-h-none max-[481px]:rounded-none'
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              minimize?.();
            }}
          >
            <header className='relative border-b border-border px-10 pb-4 pt-2 text-center'>
              <Dialog.Title className='truncate text-2xl font-semibold'>
                {title}
              </Dialog.Title>
              <Dialog.Description
                role='status'
                className='mt-1 text-sm text-text-secondary'
              >
                {status}
              </Dialog.Description>
              {minimize && (
                <button
                  type='button'
                  aria-label='Minimizar llamada'
                  className='absolute right-0 top-0 grid size-10 cursor-pointer place-items-center rounded-full hover:bg-bg-chat'
                  onClick={minimize}
                >
                  <ChevronDown size={22} />
                </button>
              )}
            </header>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
