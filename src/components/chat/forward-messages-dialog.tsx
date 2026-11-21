import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useForwardMessages } from '@/hooks/use-forward-messages';
import type { Message } from '@/types/conversation';

export function ForwardMessagesDialog({
  messages,
  onClose,
  onDone,
}: {
  messages: Message[];
  onClose: () => void;
  onDone: () => void;
}) {
  const forward = useForwardMessages(messages, onDone);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !forward.busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-60 bg-black/40' />
        <Dialog.Content className='fixed left-1/2 top-1/2 z-70 flex max-h-[85dvh] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl bg-bg-app p-5 shadow-xl'>
          <div className='flex items-center justify-between gap-2'>
            <Dialog.Title className='text-lg font-semibold'>Reenviar mensajes</Dialog.Title>
            <Dialog.Close
              aria-label='Cerrar'
              disabled={forward.busy}
              className='cursor-pointer rounded-full p-2 hover:bg-bg-chat'
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className='text-sm text-text-secondary'>
            Elige la conversación de destino.
          </Dialog.Description>
          <input
            aria-label='Buscar destino'
            placeholder='Buscar destino'
            type='search'
            value={forward.query}
            onChange={(event) => forward.setQuery(event.target.value)}
            className='rounded-lg bg-bg-chat px-3 py-2'
          />
          <div className='min-h-0 overflow-y-auto'>
            {forward.results.length ? (
              forward.results.map((item) => (
                <label
                  key={item.id}
                  className='flex cursor-pointer items-center gap-2 rounded-lg px-2 py-3 hover:bg-bg-chat'
                >
                  <input
                    type='radio'
                    name='forward-destination'
                    checked={item.id === forward.targetId}
                    disabled={forward.busy || forward.sent > 0}
                    onChange={() => forward.setTargetId(item.id)}
                    className='accent-accent'
                  />
                  <span className='min-w-0 truncate'>{forward.title(item)}</span>
                </label>
              ))
            ) : (
              <p className='text-sm text-text-secondary'>No hay conversaciones disponibles.</p>
            )}
          </div>
          {forward.error && (
            <p role='alert' className='text-sm text-danger'>
              {forward.error}
            </p>
          )}
          <button
            type='button'
            onClick={() => void forward.send()}
            disabled={forward.busy || !forward.canSend}
            className='rounded-lg bg-accent p-2 font-semibold text-white enabled:cursor-pointer disabled:opacity-40'
          >
            {forward.busy ? 'Reenviando…' : `Reenviar (${forward.pending})`}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
