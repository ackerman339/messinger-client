import { useContactsContext } from '@/context/contacts-context';
import { ContactDialog } from './contact-dialog';
import { AlertDialog, DropdownMenu } from 'radix-ui';
import {
  BrushCleaning,
  EllipsisVertical,
  LoaderCircle,
  MicSignal,
  UserPlus,
  Trash2,
  LogOut,
  ArrowRightLeft,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useChatContext } from '@/context/chat-context';
import { useUserContext } from '@/context/user-context';
import { conversationService } from '@/services/conversation';

import { InviteGroupDialog } from './invite-group-dialog';
import { GroupManagementDialog } from './group-management-dialog';

type Notice = { title: string; description: string; error?: boolean };

export function HeaderButton() {
  const { user } = useUserContext();
  const { contacts, status } = useContactsContext();
  const { activeConversation, handleEmptyChat } = useChatContext();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [groupAction, setGroupAction] = useState<
    'delete' | 'transfer' | 'leave' | null
  >(null);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const pending = useRef(false);
  const groupMember = activeConversation?.members.find(
    (member) => member.userId === user?.id && !member.softDeletedAt,
  );
  const isActiveGroup =
    activeConversation?.type === 'GROUP' &&
    !activeConversation.invitation &&
    !activeConversation.isDeleted;
  const isOwner = groupMember?.role === 'OWNER';
  const participant = activeConversation?.members.find(
    (member) => member.userId !== user?.id,
  );

  async function handleRequestConnection() {
    if (
      pending.current ||
      !user ||
      !participant ||
      activeConversation?.type !== 'PRIVATE'
    )
      return;
    pending.current = true;
    setBusy(true);
    setOpen(false);
    setNotice(null);
    try {
      await conversationService.requestUserConnection({
        senderName: user.username || 'Usuario',
        conversationId: activeConversation.id,
        targetUserId: participant.userId,
      });
      setNotice({
        title: 'Solicitud enviada',
        description: 'Se le notificó que necesitas que se conecte.',
      });
    } catch {
      setNotice({
        title: 'No se pudo enviar la solicitud',
        description: 'Inténtalo de nuevo.',
        error: true,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function handleEmptyMessages() {
    const conversationId = activeConversation?.id;
    if (pending.current || !conversationId) return;
    pending.current = true;
    setBusy(true);
    setConfirmEmpty(false);
    setNotice(null);
    try {
      await conversationService.emptyMessages({ conversationId });
      handleEmptyChat(conversationId);
    } catch {
      setNotice({
        title: 'No se pudo vaciar el chat',
        description: 'Inténtalo de nuevo.',
        error: true,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function renderGroupAction(action: 'delete' | 'transfer' | 'leave') {
    const Icon =
      action === 'delete'
        ? Trash2
        : action === 'transfer'
          ? ArrowRightLeft
          : LogOut;
    return (
      <DropdownMenu.Item
        key={action}
        disabled={busy}
        aria-label={
          action === 'delete'
            ? 'Eliminar grupo'
            : action === 'transfer'
              ? 'Transferir propiedad'
              : 'Salir del grupo'
        }
        onSelect={() => {
          setOpen(false);
          setGroupAction(action);
        }}
        className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100 ${action === 'transfer' ? '' : 'text-danger'}`}
      >
        <Icon size={18} aria-hidden='true' />
        <span>
          {action === 'delete'
            ? 'Eliminar grupo'
            : action === 'transfer'
              ? 'Transferir propiedad'
              : 'Salir del grupo'}
        </span>
      </DropdownMenu.Item>
    );
  }

  if (!activeConversation) return null;
  return (
    <>
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            type='button'
            disabled={busy}
            aria-label='Más opciones'
            className='grid size-10 place-items-center rounded-full text-text-secondary hover:bg-slate-100 disabled:opacity-50'
          >
            {busy ? (
              <LoaderCircle size={20} className='animate-spin' />
            ) : (
              <EllipsisVertical size={22} />
            )}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align='end'
            sideOffset={8}
            className='z-50 min-w-52 rounded-lg border border-border bg-bg-app p-1 shadow-lg'
          >
            {activeConversation.type === 'GROUP' &&
              !activeConversation.isDeleted &&
              !activeConversation.invitation &&
              activeConversation.members.some(
                (member) =>
                  member.userId === user?.id && member.role === 'OWNER',
              ) && (
                <DropdownMenu.Item
                  aria-label='Invitar personas'
                  onSelect={() => {
                    setOpen(false);
                    setInviteOpen(true);
                  }}
                  className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100'
                >
                  <UserPlus size={18} />
                  <span>Invitar personas</span>
                </DropdownMenu.Item>
              )}
            {isActiveGroup && isOwner && renderGroupAction('transfer')}
            {activeConversation.type === 'PRIVATE' &&
              participant &&
              status === 'ready' &&
              !contacts.has(participant.userId) && (
                <DropdownMenu.Item
                  className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100'
                  aria-label='Agregar como contacto'
                  onSelect={() => {
                    setOpen(false);
                    setAddContactOpen(true);
                  }}
                >
                  <UserPlus size={18} />
                  <span>Agregar como contacto</span>
                </DropdownMenu.Item>
              )}
            {activeConversation.type === 'PRIVATE' && participant && (
              <DropdownMenu.Item
                disabled={busy}
                aria-label='Solicitar que se conecte'
                onSelect={handleRequestConnection}
                className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100 data-[disabled]:opacity-40'
              >
                <MicSignal size={18} />
                <span>Solicitar que se conecte</span>
              </DropdownMenu.Item>
            )}
            {((isActiveGroup && isOwner) ||
              (activeConversation.type === 'PRIVATE' && participant)) && (
              <DropdownMenu.Separator className='my-1 h-px bg-border' />
            )}
            <DropdownMenu.Item
              disabled={busy}
              aria-label='Vaciar chat'
              onSelect={() => {
                setOpen(false);
                setConfirmEmpty(true);
              }}
              className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-danger outline-none hover:bg-red-50 data-[disabled]:opacity-40'
            >
              <BrushCleaning size={18} />
              <span>Vaciar chat</span>
            </DropdownMenu.Item>
            {isActiveGroup &&
              (isOwner
                ? renderGroupAction('delete')
                : groupMember?.role === 'MEMBER'
                  ? renderGroupAction('leave')
                  : null)}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {addContactOpen && activeConversation.type === 'PRIVATE' && (
        <ContactDialog
          conversationId={activeConversation.id}
          onClose={() => setAddContactOpen(false)}
        />
      )}
      {groupAction && isActiveGroup && (
        <GroupManagementDialog
          key={activeConversation.id}
          group={activeConversation}
          action={groupAction}
          onClose={() => setGroupAction(null)}
        />
      )}
      {inviteOpen &&
        !activeConversation.isDeleted &&
        activeConversation.type === 'GROUP' &&
        !activeConversation.invitation && (
          <InviteGroupDialog
            key={activeConversation.id}
            group={activeConversation}
            onClose={() => setInviteOpen(false)}
          />
        )}
      <AlertDialog.Root open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className='fixed inset-0 z-60 bg-black/40' />
          <AlertDialog.Content className='fixed left-1/2 top-1/2 z-70 w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg-app p-5 shadow-xl'>
            <AlertDialog.Title className='text-lg font-semibold'>
              ¿Vaciar chat?
            </AlertDialog.Title>
            <AlertDialog.Description className='mt-2 text-sm text-text-secondary'>
              Se ocultarán los mensajes y eventos de esta conversación solo
              para ti.
            </AlertDialog.Description>
            <div className='mt-5 flex justify-end gap-2'>
              <AlertDialog.Cancel asChild>
                <button
                  type='button'
                  className='rounded-lg px-4 py-2 text-sm hover:bg-slate-100'
                >
                  Cancelar
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type='button'
                  disabled={busy}
                  aria-label='Confirmar vaciado'
                  onClick={handleEmptyMessages}
                  className='rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger-hover disabled:opacity-50'
                >
                  Vaciar
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {notice && (
        <div
          role={notice.error ? 'alert' : 'status'}
          className='fixed bottom-5 left-1/2 z-80 flex w-[min(92vw,400px)] -translate-x-1/2 items-start gap-3 rounded-xl border border-border bg-bg-app p-4 shadow-xl'
        >
          <div className='flex-1'>
            <p
              className={`text-sm font-semibold ${notice.error ? 'text-danger' : 'text-text-primary'}`}
            >
              {notice.title}
            </p>
            <p className='mt-1 text-sm text-text-secondary'>
              {notice.description}
            </p>
          </div>
          <button
            type='button'
            aria-label='Cerrar aviso'
            onClick={() => setNotice(null)}
            className='rounded-full p-1 text-text-secondary hover:bg-slate-100'
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
