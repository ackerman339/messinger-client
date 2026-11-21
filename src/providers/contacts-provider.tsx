import type { ReactNode } from 'react';
import { useCachedList } from '../hooks/use-cached-list';
import { offlineListKey } from '../services/offline-session';
import { ContactsContext } from '@/context/contacts-context';
import { contactService } from '@/services/contacts';
import type { Contact, CreateContact } from '@/types/contact';

import { useUserContext } from '@/context/user-context';

const contactKey = (contact: Contact) => contact.userId;
const fetchContacts = async (_cursor: string | null, signal: AbortSignal) => ({
  page: await contactService.list(signal),
  nextCursor: null,
});

export function ContactsProvider({ children }: { children: ReactNode }) {
  const { user, canSync } = useUserContext();
  const {
    records: contacts,
    setRecords: setContacts,
    refresh: retry,
    ready,
    loading,
    error,
  } = useCachedList<Contact>({
    cacheKey: user?.id ? offlineListKey('contacts', user.id) : undefined,
    keyOf: contactKey,
    fetchPage: fetchContacts,
  }, !!user?.id && canSync);

  const status = !ready && !contacts.size && loading
    ? 'loading'
    : !ready && !contacts.size && error
      ? 'error'
      : 'ready';

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
