import { useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { useChatContext } from '@/context/chat-context';
import { useUserContext } from '@/context/user-context';
import { conversationService } from '@/services/conversation';
import { groupConversation } from '@/services/groups';

export function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useUserContext();
  const {
    handleNewConversation,
    handleCurrentConversation,
    handleReceiverId,
  } = useChatContext();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function create(event: React.SubmitEvent) {
    event.preventDefault();
    if (pending.current || !name.trim() || !user) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await conversationService.createGroup({
        name: name.trim(),
        members: [],
      });
      handleNewConversation(
        groupConversation(result.id, result.name || name.trim(), [
          {
            userId: user.id,
            username: user.username,
            lastSeenAt: null,
            unreadCount: 0,
            role: 'OWNER',
          },
        ]),
      );
      handleReceiverId('');
      handleCurrentConversation(result.id);
      setName('');
      onOpenChange(false);
    } catch {
      setError('No se pudo crear el grupo. Inténtalo de nuevo.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          onOpenChange(value);
          setError('');
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-60 bg-black/40' />
        <Dialog.Content className='fixed left-1/2 top-1/2 z-70 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg-app p-5 shadow-xl'>
          <div className='flex items-center justify-between'>
            <Dialog.Title className='text-lg font-semibold'>
              Crear nuevo grupo
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type='button'
                aria-label='Cerrar'
                disabled={busy}
                className='rounded-full p-2 hover:bg-slate-100'
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className='mt-2 text-sm text-text-secondary'>
            Elige un nombre. Después podrás invitar personas desde el menú
            del grupo.
          </Dialog.Description>
          <form onSubmit={create} className='mt-4 space-y-4'>
            <label className='block text-sm font-medium'>
              Nombre del grupo
              <input
                autoFocus
                required
                maxLength={100}
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                className='mt-2 h-11 w-full rounded-lg bg-slate-100 px-3 outline-none focus:ring-2 focus:ring-accent'
              />
            </label>
            {error && (
              <p role='alert' className='text-sm text-danger'>
                {error}
              </p>
            )}
            <button
              type='submit'
              disabled={busy || !name.trim()}
              className='h-11 w-full rounded-lg bg-accent font-medium text-white disabled:opacity-40'
            >
              {busy ? 'Creando...' : 'Crear grupo'}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
