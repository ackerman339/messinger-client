import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useChatContext } from '../../context/chat-context';
import { MessageComposer } from './message-composer';

type NewMessageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewMessageDialog({ open, onOpenChange }: NewMessageDialogProps) {
  const { getUserByCode, receiverId, handleReceiverId } = useChatContext();

  const [userCode, setUserCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!userCode.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const user = await getUserByCode(userCode.trim());
      handleReceiverId(user.id);
    } catch {
      setError('No encontramos ese usuario');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(value: boolean) {
    onOpenChange(value);

    if (!value) {
      setUserCode('');
      handleReceiverId('');
      setError(null);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-50 bg-black/40' />

        <Dialog.Content className='fixed left-1/2 top-1/2 z-50 w-[min(95vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg-app shadow-xl'>
          <div className='flex items-center justify-between border-b border-border px-4 py-3'>
            <Dialog.Title className='font-semibold'>Nuevo mensaje</Dialog.Title>

            <Dialog.Close asChild>
              <button
                type='button'
                className='grid size-8 place-items-center rounded-full hover:bg-slate-100'
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {!receiverId ? (
            <div className='p-4'>
              <label className='mb-2 block text-sm font-medium'>Código del usuario</label>

              <input
                autoFocus
                value={userCode}
                onChange={(event) => setUserCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleContinue();
                  }
                }}
                placeholder='Ej: A7F92K'
                className='h-11 w-full rounded-lg bg-slate-100 px-3 outline-none focus:ring-2 focus:ring-accent'
              />

              {error && <p className='mt-2 text-sm text-red-500'>{error}</p>}

              <button
                type='button'
                disabled={loading || !userCode.trim()}
                onClick={handleContinue}
                className='mt-4 h-11 w-full rounded-lg bg-accent text-white disabled:opacity-40'
              >
                {loading ? 'Buscando...' : 'Continuar'}
              </button>
            </div>
          ) : (
            <MessageComposer />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
