import { useRef, useState } from 'react';
import { useChatContext } from '@/context/chat-context';
import { useUserContext } from '@/context/user-context';
import { conversationService } from '@/services/conversation';
import type { Conversation } from '@/types/conversation';
import { Dialog } from 'radix-ui';
export function GroupManagementDialog({
  group,
  action,
  onClose,
}: {
  group: Conversation;
  action: 'delete' | 'transfer' | 'leave';
  onClose: () => void;
}) {
  const { user } = useUserContext();
  const {
    handleGroupDeleted,
    handleGroupOwnerChanged,
    handleRemoveConversation,
  } = useChatContext();
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const member = group.members.find(
    (item) => item.userId === user?.id && !item.softDeletedAt,
  );
  const owner = member?.role === 'OWNER';
  const candidates = group.members.filter(
    (item) => item.userId !== user?.id && !item.softDeletedAt,
  );
  const permitted =
    !group.isDeleted &&
    !group.invitation &&
    (action === 'leave' ? member?.role === 'MEMBER' : owner);
  const title =
    action === 'delete'
      ? 'Eliminar grupo'
      : action === 'transfer'
        ? 'Transferir propiedad'
        : 'Salir del grupo';
  const description =
    action === 'delete'
      ? `¿Eliminar ${group.name}? Los miembros ya no podrán enviar mensajes.`
      : action === 'transfer'
        ? 'Selecciona al miembro que será el nuevo propietario. Tú pasarás a ser miembro.'
        : `¿Salir de ${group.name}? Dejarás de recibir mensajes de este grupo.`;
  async function submit() {
    if (
      pending.current ||
      !permitted ||
      (action === 'transfer' &&
        !candidates.some((item) => item.userId === selected))
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await conversationService.deleteGroup({
          conversationId: group.id,
        });
        handleGroupDeleted(group.id);
      } else if (action === 'leave') {
        await conversationService.leaveGroup({ conversationId: group.id });
        handleRemoveConversation(group.id);
      } else {
        await conversationService.transferOwnership({
          conversationId: group.id,
          newOwnerId: selected,
        });
        handleGroupOwnerChanged(group.id, selected);
      }
      onClose();
    } catch {
      setError('No se pudo completar la acción. Inténtalo de nuevo.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-60 bg-black/40' />
        <Dialog.Content className='fixed left-1/2 top-1/2 z-70 flex max-h-[85vh] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-bg-app p-5 shadow-xl'>
          <Dialog.Title className='text-lg font-semibold'>
            {title}
          </Dialog.Title>
          <Dialog.Description className='mt-2 text-sm text-text-secondary'>
            {description}
          </Dialog.Description>
          {action === 'transfer' && (
            <fieldset disabled={busy} className='my-4 overflow-y-auto'>
              <legend className='mb-2 text-sm font-medium'>
                Nuevo propietario
              </legend>
              {!candidates.length && (
                <p className='text-sm text-text-secondary'>
                  No hay otros miembros disponibles.
                </p>
              )}
              {candidates.map((item) => (
                <label
                  key={item.userId}
                  className='flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-slate-100'
                >
                  <input
                    type='radio'
                    name='new-owner'
                    value={item.userId}
                    checked={selected === item.userId}
                    onChange={() => setSelected(item.userId)}
                    className='size-4 accent-accent'
                  />
                  <span className='truncate text-sm'>{item.username}</span>
                </label>
              ))}
            </fieldset>
          )}
          {error && (
            <p role='alert' className='mt-4 text-sm text-danger'>
              {error}
            </p>
          )}
          <div className='mt-5 flex justify-end gap-3'>
            <button
              type='button'
              disabled={busy}
              onClick={onClose}
              className='rounded-lg px-4 py-2 text-sm hover:bg-slate-100'
            >
              Cancelar
            </button>
            <button
              type='button'
              aria-label='Confirmar acción del grupo'
              disabled={
                busy || !permitted || (action === 'transfer' && !selected)
              }
              onClick={submit}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40 ${action === 'transfer' ? 'bg-accent' : 'bg-danger'}`}
            >
              {busy ? 'Procesando...' : title}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
