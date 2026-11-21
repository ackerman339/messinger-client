import { createContext, useContext } from 'react';
import type { Contact, CreateContact } from '@/types/contact';

type ContactsContextValue = {
  contacts: ReadonlyMap<string, Contact>;
  status: 'loading' | 'ready' | 'error';
  retry: () => void;
  add: (data: CreateContact) => Promise<void>;
  rename: (contact: Contact, name: string | null) => Promise<void>;
  remove: (contact: Contact) => Promise<void>;
};

export const ContactsContext = createContext<ContactsContextValue | null>(null);

export function useContactsContext() {
  const context = useContext(ContactsContext);
  if (!context) throw new Error('ContactsProvider is required');
  return context;
}
