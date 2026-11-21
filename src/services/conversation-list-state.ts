import type { Conversation, Message } from '../types/conversation';

export function updateConversationForMessage(
  previous: Map<string, Conversation>,
  message: Message,
  userId: string,
  activeId: string,
  incoming: boolean
) {
  const { conversation: payload, ...entry } = message;
  const id = message.conversationId ?? payload?.id;
  if (!id) return previous;

  const existing = previous.get(id);
  const conversation = existing ?? payload;
  if (!conversation || conversation.isDeleted || conversation.invitation) return previous;

  const messageId = entry.id || entry.messageId;
  const known = existing?.messages.some((item) => (item.id || item.messageId) === messageId);
  const timestamp = new Date(entry.createdAt).getTime();
  const currentTime = new Date(conversation.updatedAt).getTime();
  const newest =
    !conversation.lastMessage ||
    timestamp >= new Date(conversation.lastMessage.createdAt).getTime();

  const peer = payload?.members?.find((member) => member.userId !== userId);
  const members = conversation.members.map((member) => {
    if (member.userId === userId && incoming && !known && activeId !== id) {
      return { ...member, unreadCount: (member.unreadCount ?? 0) + 1 };
    }
    if (member.userId === peer?.userId && peer.avatarUrl !== undefined) {
      return { ...member, avatarUrl: peer.avatarUrl };
    }
    return member;
  });

  const messages = known
    ? conversation.messages
    : [entry, ...conversation.messages.filter((item) => (item.id || item.messageId) !== messageId)]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 20);

  return new Map(previous).set(id, {
    ...conversation,
    members,
    messages,
    updatedAt:
      timestamp > currentTime || !Number.isFinite(currentTime)
        ? new Date(timestamp)
        : conversation.updatedAt,
    lastMessage: newest ? entry : conversation.lastMessage,
  });
}

export function sortConversations(conversations: Iterable<Conversation>) {
  return [...conversations].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.id.localeCompare(a.id)
  );
}
