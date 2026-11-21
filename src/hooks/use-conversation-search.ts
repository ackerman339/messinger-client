import { useMemo, useState } from 'react';
import { useContactsContext } from '@/context/contacts-context';
import { useUserContext } from '@/context/user-context';
import { sortConversations } from '@/services/conversation-list-state';
import type { Conversation } from '@/types/conversation';

function searchable(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}

export function useConversationSearch(conversations: ReadonlyMap<string, Conversation>) {
  const [query, setQuery] = useState('');
  const { user } = useUserContext();
  const { contacts } = useContactsContext();
  const term = searchable(query.trim());
  const items = useMemo(() => sortConversations(conversations.values()), [conversations]);
  const results = useMemo(() => {
    if (!term) return items;

    return items.filter((conversation) => {
      if (conversation.type === 'GROUP' && searchable(conversation.name).includes(term)) {
        return true;
      }
      return conversation.members.some((member) => {
        if (member.userId === user?.id || member.softDeletedAt) return false;
        const contact = contacts.get(member.userId);
        return [member.username, contact?.name, contact?.username].some((name) =>
          searchable(name).includes(term),
        );
      });
    });
  }, [items, contacts, term, user?.id]);

  return { query, setQuery, results, isSearching: Boolean(term) };
}
