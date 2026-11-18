import { useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { useChatContext } from '@/context/chat-context';
import {
  getAllConversations,
  groupError,
  groupService,
} from '@/services/groups';

export function GroupInvitationPanel() {
  const {
    activeConversation,
    handleNewConversation,
    handleRemoveConversation,
  } = useChatContext();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  if (!activeConversation?.invitation) return null;
  const conversation = activeConversation;
  async function respond(action: 'accept' | 'reject') {
    if (pending.current) return;
    pending.current = true;
    setBusy(action);
    setError('');
    try {
      if (action === 'reject') {
        await groupService.reject(conversation.id);
        handleRemoveConversation(conversation.id);
      } else {
        if (!accepted) {
          await groupService.accept(conversation.id);
          setAccepted(true);
        }
        const group = (await getAllConversations()).find(
          (item) => item.id === conversation.id,
        );
        if (!group)
          throw new Error(
            'No se pudo cargar el grupo. Inténtalo de nuevo.',
          );
        handleNewConversation(group);
      }
    } catch (error) {
      setError(groupError(error));
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }
  return (
    <section className='chat-paper flex min-h-0 flex-1 items-center justify-center p-6'>
      <div className='w-full max-w-md rounded-xl border border-border bg-bg-app p-6 text-center shadow-sm'>
        <Users size={40} className='mx-auto mb-4 text-accent' />
        <h2 className='text-lg font-semibold'>
          Invitación a {conversation.name}
        </h2>
        <p className='mt-2 text-sm text-text-secondary'>
          {accepted
            ? 'Ya aceptaste la invitación. Abre el grupo para comenzar.'
            : 'Te han invitado a este grupo. Acepta para ver la conversación y enviar mensajes.'}
        </p>
        {error && (
          <p role='alert' className='mt-4 text-sm text-danger'>
            {error}
          </p>
        )}
        <div className='mt-6 flex justify-center gap-3'>
          {!accepted && (
            <button
              type='button'
              disabled={!!busy}
              onClick={() => respond('reject')}
              className='rounded-lg border border-border px-5 py-2 text-sm hover:bg-slate-100 disabled:opacity-40'
            >
              {busy === 'reject' ? 'Rechazando...' : 'Rechazar'}
            </button>
          )}
          <button
            type='button'
            disabled={!!busy}
            onClick={() => respond('accept')}
            className='rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-40'
          >
            {busy === 'accept'
              ? 'Cargando...'
              : accepted
                ? 'Abrir grupo'
                : 'Aceptar'}
          </button>
        </div>
      </div>
    </section>
  );
}
