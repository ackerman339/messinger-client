import type { Conversation, Message, MessageReply } from '@/types/conversation';
import type { Contact } from '@/types/contact';

export function createReplyPreview(message: Message): MessageReply {
  return {
    messageId: message.messageId || message.id,
    senderId: message.senderId,
    excerpt: (message.content.trim() || message.attachments?.[0]?.fileName || 'Mensaje').slice(
      0,
      240,
    ),
  };
}

export function replyAuthor(
  reply: MessageReply,
  conversation: Conversation | null,
  userId: string | undefined,
  contacts: ReadonlyMap<string, Contact>,
) {
  if (!reply.senderId) return 'Usuario';
  if (reply.senderId === userId) return 'Tú';
  const contact = contacts.get(reply.senderId);
  const matches = (member: Conversation['members'][number]) => member.userId === reply.senderId;
  return (
    contact?.name?.trim() ||
    conversation?.members.find(matches)?.username ||
    conversation?.knownMembers?.find(matches)?.username ||
    contact?.username ||
    'Usuario'
  );
}

export function canForwardTo(conversation: Conversation, userId: string) {
  return (
    !conversation.isDeleted &&
    !conversation.invitation &&
    conversation.members.some((member) => member.userId === userId && !member.softDeletedAt)
  );
}
