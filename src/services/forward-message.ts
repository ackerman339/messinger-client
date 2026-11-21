import { fileService } from '@/services/files';
import { messageSync } from '@/services/message-sync';
import { WS_CLIENT_EVENTS } from '@/types/websocket';
import type { Conversation, Message } from '@/types/conversation';

export async function forwardMessage(userId: string, destination: Conversation, message: Message) {
  const location = message.location && {
    latitude: message.location.latitude,
    longitude: message.location.longitude,
    capturedAt: message.location.capturedAt,
  };
  const receiverId = destination.members.find((member) => member.userId !== userId)?.userId;
  if (destination.type === 'PRIVATE' && !receiverId) return false;

  const attachments = message.attachments?.length
    ? await fileService.prepareForward(message.attachments.map(({ id }) => id))
    : [];
  const data = {
    content: location ? 'Ubicación compartida' : message.content || 'Archivo adjunto',
    attachments,
    location,
    forwarded: true as const,
  };

  return destination.type === 'GROUP'
    ? messageSync.enqueue(userId, {
        type: WS_CLIENT_EVENTS.SEND_GROUP_MESSAGE,
        data: { ...data, conversationId: destination.id },
      })
    : messageSync.enqueue(userId, {
        type: WS_CLIENT_EVENTS.SEND_PRIVATE_MESSAGE,
        data: { ...data, receiverId: receiverId! },
      });
}
