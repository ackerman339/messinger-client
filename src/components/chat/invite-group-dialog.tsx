import { GROUP_MEMBER_LIMIT_MESSAGE, MAX_GROUP_MEMBERS } from '@/lib/group-limits';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { useUserContext } from '@/context/user-context';
import {
  getAllConversations,
  inviteCandidates,
  groupError,
  groupService,
} from '@/services/groups';
import type { Conversation, Member } from '@/types/conversation';

export function InviteGroupDialog({
  group,
  onClose,
}: {
  group: Conversation;
  onClose: () => void;
}) {
  const { user } = useUserContext();
  const [contacts, setContacts] = useState<Member[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [sent, setSent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  const activeMembers = group.members.filter((member) => !member.softDeletedAt).length;
  const availableSlots = Math.max(0, MAX_GROUP_MEMBERS - activeMembers);
  const selectionIsFull = selected.length >= availableSlots;
  const cannotSend = loading || busy || !selected.length || selected.length > availableSlots;
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    getAllConversations()
      .then((conversations) => {
        if (!cancelled)
          setContacts(
            inviteCandidates(conversations, group, user?.id || ''),
          );
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar los contactos.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [group, user?.id, retry]);
  async function invite() {
    if (pending.current || cannotSend) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const results = await Promise.allSettled(
      selected.map((id) => groupService.invite(group.id, id)),
    );
    if (!mounted.current) return;
    const successes = selected.filter(
      (_, i) => results[i].status === 'fulfilled',
    );
    const failures = selected.filter(
      (_, i) => results[i].status === 'rejected',
    );
    setSent((previous) => [...previous, ...successes]);
    setSelected(failures);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') setError(groupError(failed.reason));
    pending.current = false;
    setBusy(false);
  }
  const visible = contacts.filter((contact) =>
    contact.username
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
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
          <div className='flex items-center justify-between'>
            <Dialog.Title className='text-lg font-semibold'>
              Invitar personas
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
            Selecciona las personas con las que has conversado para
            invitarlas a {group.name}.
          </Dialog.Description>
          <p className='mt-2 text-sm text-text-secondary'>
            {availableSlots ? `${activeMembers}/${MAX_GROUP_MEMBERS} miembros` : GROUP_MEMBER_LIMIT_MESSAGE}
          </p>
          <input
            type='search'
            aria-label='Buscar personas'
            placeholder='Buscar personas'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className='mt-4 h-10 shrink-0 rounded-lg bg-slate-100 px-3 outline-none focus:ring-2 focus:ring-accent'
          />
          <div className='my-4 min-h-0 overflow-y-auto'>
            {loading ? (
              <p role='status' className='text-sm text-text-secondary'>
                Cargando contactos...
              </p>
            ) : visible.length === 0 ? (
              <p className='text-sm text-text-secondary'>
                {contacts.length
                  ? 'No hay coincidencias.'
                  : 'No hay personas disponibles para invitar.'}
              </p>
            ) : (
              visible.map((contact) => (
                <label
                  key={contact.userId}
                  className='flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-slate-100'
                >
                  <input
                    type='checkbox'
                    disabled={
                      busy || sent.includes(contact.userId) ||
                      (selectionIsFull && !selected.includes(contact.userId))
                    }
                    checked={
                      selected.includes(contact.userId) ||
                      sent.includes(contact.userId)
                    }
                    onChange={(event) =>
                      setSelected((previous) =>
                        event.target.checked
                          ? [...previous, contact.userId]
                          : previous.filter((id) => id !== contact.userId),
                      )
                    }
                    className='size-4 accent-accent'
                  />
                  <span className='flex-1 truncate text-sm'>
                    {contact.username}
                  </span>
                  {sent.includes(contact.userId) && (
                    <span className='text-xs text-text-secondary'>
                      Invitación enviada
                    </span>
                  )}
                </label>
              ))
            )}
          </div>
          {error && (
            <div role='alert' className='mb-3 text-sm text-danger'>
              {error}{' '}
              {!contacts.length && (
                <button
                  type='button'
                  onClick={() => {
                    setError('');
                    setLoading(true);
                    setRetry((value) => value + 1);
                  }}
                  className='ml-2 underline'
                >
                  Reintentar
                </button>
              )}
            </div>
          )}
          {sent.length > 0 && (
            <p role='status' className='mb-3 text-sm text-text-secondary'>
              {sent.length} invitaciones enviadas.
            </p>
          )}
          <button
            type='button'
            disabled={cannotSend}
            onClick={invite}
            className='h-11 shrink-0 rounded-lg bg-accent font-medium text-white disabled:opacity-40'
          >
            {busy
              ? 'Enviando...'
              : `Invitar${selected.length ? ` (${selected.length})` : ''}`}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
