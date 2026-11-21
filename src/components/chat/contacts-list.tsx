import { useState } from 'react';
import { Avatar } from 'radix-ui';
import { Pencil, UserPlus } from 'lucide-react';
import { useChatContext } from '@/context/chat-context';
import { useContactsContext } from '@/context/contacts-context';
import { contactDisplayName, type Contact } from '@/types/contact';
import { ContactDialog } from './contact-dialog';
import { NewMessageDialog } from './new-message-dialog';

export function ContactsList() {
  const { contacts, status, retry } = useContactsContext();
  const { conversations, handleCurrentConversation, handleReceiverId, unSetCurrentConversation } =
    useChatContext();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contact>();
  const [recipient, setRecipient] = useState<string>();
  const entries = [...contacts.values()].sort((a, b) =>
    contactDisplayName(a).localeCompare(contactDisplayName(b), 'es')
  );

  function openContact(contact: Contact) {
    const conversation = [...conversations.values()].find(
      (item) =>
        item.type === 'PRIVATE' && item.members.some((member) => member.userId === contact.userId)
    );

    if (conversation) {
      handleCurrentConversation(conversation.id);
      return;
    }

    unSetCurrentConversation();
    void handleReceiverId(contact.userId);
    setRecipient(contactDisplayName(contact));
  }

  return (
    <>
      <div className='border-b border-border p-3'>
        <button
          type='button'
          onClick={() => setCreating(true)}
          className='flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm font-semibold text-accent hover:bg-accent/5'
        >
          <UserPlus size={18} aria-hidden='true' />
          Nuevo contacto
        </button>
      </div>
      {status === 'loading' && (
        <p role='status' className='p-4 text-sm text-text-secondary'>
          Cargando contactos…
        </p>
      )}
      {status === 'error' && (
        <div className='p-4 text-sm'>
          <p role='alert'>No se pudieron cargar los contactos.</p>
          <button
            type='button'
            onClick={retry}
            className='mt-2 cursor-pointer text-accent hover:underline'
          >
            Reintentar
          </button>
        </div>
      )}
      {status === 'ready' &&
        (entries.length ? (
          <ul className='min-h-0 flex-1 overflow-y-auto p-2'>
            {entries.map((contact) => {
              const name = contactDisplayName(contact);
              return (
                <li
                  key={contact.id}
                  className='flex items-center gap-2 rounded-lg hover:bg-slate-100'
                >
                  <button
                    type='button'
                    onClick={() => openContact(contact)}
                    className='flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 text-left'
                  >
                    <Avatar.Root className='grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-sm font-semibold text-white'>
                      <Avatar.Image
                        className='size-full object-cover'
                        src={contact.avatarUrl ?? undefined}
                        alt=''
                      />
                      <Avatar.Fallback>{name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
                    </Avatar.Root>
                    <span className='truncate text-sm font-medium'>{name}</span>
                  </button>
                  <button
                    type='button'
                    aria-label={`Editar a ${name}`}
                    onClick={() => setEditing(contact)}
                    className='mr-2 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-text-secondary hover:bg-bg-app'
                  >
                    <Pencil size={16} aria-hidden='true' />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className='p-4 text-sm text-text-secondary'>Aún no tienes contactos.</p>
        ))}
      {creating && <ContactDialog onClose={() => setCreating(false)} />}
      {editing && <ContactDialog contact={editing} onClose={() => setEditing(undefined)} />}
      {recipient && (
        <NewMessageDialog
          open
          recipientName={recipient}
          onOpenChange={() => setRecipient(undefined)}
        />
      )}
    </>
  );
}
