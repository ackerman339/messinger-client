import { useEffect, useState, type ReactNode } from 'react';
import { ContactsContext } from '@/context/contacts-context';
import { contactService } from '@/services/contacts';
import type { Contact, CreateContact } from '@/types/contact';

import { useUserContext } from '@/context/user-context';

const emptyContacts: ReadonlyMap<string, Contact> = new Map();

export function ContactsProvider({ children }: { children: ReactNode }) {
  const { user } = useUserContext();
  return (
    <AccountContacts key={user?.id} userId={user?.id}>
      {children}
    </AccountContacts>
  );
}

function AccountContacts({ userId, children }: { userId?: string; children: ReactNode }) {
  const [contacts, setContacts] = useState(emptyContacts);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();

    void contactService.list(controller.signal).then(
      (entries) => {
        if (controller.signal.aborted) return;
        const loaded = entries.map((entry) => [entry.userId, entry] as const);
        // Preserve contacts added while the initial list was in flight.
        setContacts((current) => new Map([...loaded, ...current]));
        setStatus('ready');
      },
      () => {
        if (!controller.signal.aborted) setStatus('error');
      }
    );
    return () => controller.abort();
  }, [attempt, userId]);

  function retry() {
    setStatus('loading');
    setAttempt((previous) => previous + 1);
  }

  function store(contact: Contact) {
    setContacts((current) => new Map(current).set(contact.userId, contact));
  }

  async function add(data: CreateContact) {
    store(await contactService.create(data));
  }

  async function rename(contact: Contact, name: string | null) {
    store(await contactService.update(contact.id, name));
  }

  async function remove(contact: Contact) {
    await contactService.remove(contact.id);
    setContacts((current) => {
      const updated = new Map(current);
      updated.delete(contact.userId);
      return updated;
    });
  }

  return (
    <ContactsContext.Provider value={{ contacts, status, retry, add, rename, remove }}>
      {children}
    </ContactsContext.Provider>
  );
}
