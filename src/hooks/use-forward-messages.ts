import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatContext } from '@/context/chat-context';
import { useContactsContext } from '@/context/contacts-context';
import { useUserContext } from '@/context/user-context';
import { useConversationSearch } from './use-conversation-search';
import { forwardMessage } from '@/services/forward-message';
import { getAllConversations } from '@/services/groups';
import { canForwardTo } from '@/services/message-actions';
import { contactDisplayName } from '@/types/contact';
import type { Conversation, Message } from '@/types/conversation';

export function useForwardMessages(messages: Message[], onDone: () => void) {
  const { user, canSync } = useUserContext();
  const userId = user?.id;
  const { conversations } = useChatContext();
  const { contacts } = useContactsContext();
  const [batch] = useState(() =>
    [...messages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
  );
  const [otherConversations, setOtherConversations] = useState<Conversation[]>([]);
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(0);
  const sending = useRef(false);

  useEffect(() => {
    if (!canSync) return;
    let active = true;
    void getAllConversations()
      .then((items) => {
        if (active) setOtherConversations(items);
      })
      .catch(() => {
        /* The cached conversations remain available. */
      });
    return () => {
      active = false;
    };
  }, [canSync, user?.id]);

  const destinations = useMemo(() => {
    if (!userId) return new Map<string, Conversation>();
    const available = new Map(otherConversations.map((item) => [item.id, item]));
    conversations.forEach((item, id) => available.set(id, item));
    return new Map([...available].filter(([, item]) => canForwardTo(item, userId)));
  }, [conversations, otherConversations, userId]);
  const { query, setQuery, results } = useConversationSearch(destinations);

  function title(conversation: Conversation) {
    if (conversation.type === 'GROUP') return conversation.name || 'Grupo';
    const peer = conversation.members.find((member) => member.userId !== user?.id);
    return contactDisplayName(
      peer ? contacts.get(peer.userId) : undefined,
      peer?.username || 'Usuario',
    );
  }

  async function send() {
    const destination = destinations.get(targetId);
    if (sending.current || !destination || !user?.id) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      for (const [index, message] of batch.entries()) {
        if (index < sent) continue;
        const saved = await forwardMessage(user.id, destination, message);
        if (!saved) throw new Error('No se pudo guardar el reenvío.');
        setSent(index + 1);
      }
      onDone();
    } catch {
      setError('No se pudieron reenviar todos los mensajes. Puedes reintentar con los pendientes.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return {
    query,
    setQuery,
    results,
    title,
    targetId,
    setTargetId,
    busy,
    error,
    sent,
    send,
    pending: batch.length - sent,
    canSend: destinations.has(targetId) && sent < batch.length,
  };
}
