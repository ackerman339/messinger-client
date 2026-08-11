/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { conversationService } from '@services/conversation';
import { fileService } from '@services/files';
import { userService } from '@services/user';
import { wsClient } from '@clients/websocket-client';
import { WS_CLIENT_EVENTS, WS_SERVER_EVENTS } from '@/types/websocket';
import { useUserContext } from '@context/user-context';
import { ChatContext } from '@context/chat-context';

import type { ReactNode } from 'react';
import type { Conversation } from '../types/conversation';
import type { FileAttachment, UploadContentType } from '../types/file';

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useUserContext();

  const [conversations, setConversations] = useState<Map<string, Conversation>>(new Map());
  const [activeConversationId, setActiveConversationId] = useState('');
  const [receiverId, setReceiverId] = useState('');

  //const [reloadConvesations, setReloadConversations] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeNewMessage = wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, (message) => {
      setConversations((prev) => {
        if (!message.conversation) {
          return prev;
        }

        const nextMap = new Map(prev);
        const conversation = nextMap.get(message.conversation.id);
        const existingMessages = conversation?.messages ?? [];
        const fallbackCreatedAt = new Date(message.conversation.createdAt ?? message.createdAt);
        const fallbackUpdatedAt = new Date(message.conversation.updatedAt ?? message.createdAt);

        nextMap.set(message.conversation.id, {
          ...(conversation ?? {
            id: message.conversation.id,
            type: 'PRIVATE',
            name: 'Nueva Conversacion',
            members: message.conversation.members.filter((member) => member.id !== user?.id),
            messagesCursor: null,
            createdAt: fallbackCreatedAt,
            updatedAt: fallbackUpdatedAt,
          }),
          messages: [
            ...existingMessages,
            {
              id: message.messageId,
              conversationId: message.conversation.id,
              senderId: message.senderId,
              content: message.content,
              createdAt: message.createdAt,
              type: 'MESSAGE',
              attachments: message.attachments,
            },
          ],
        });

        return nextMap;
      });
    });

    const unsubscribeSentMessage = wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, (message) => {
      setConversations((prev) => {
        if (!message.conversation) {
          return prev;
        }

        const nextMap = new Map(prev);
        const conversation = nextMap.get(message.conversation.id);
        const existingMessages = conversation?.messages ?? [];
        const fallbackCreatedAt = new Date(message.conversation.createdAt ?? message.createdAt);
        const fallbackUpdatedAt = new Date(message.conversation.updatedAt ?? message.createdAt);

        nextMap.set(message.conversation.id, {
          ...(conversation ?? {
            id: message.conversation.id,
            type: 'PRIVATE',
            name: 'Nueva Conversacion',
            members: message.conversation.members.filter((member) => member.id !== user?.id),
            messagesCursor: null,
            createdAt: fallbackCreatedAt,
            updatedAt: fallbackUpdatedAt,
          }),
          messages: [
            ...existingMessages,
            {
              id: message.messageId,
              conversationId: message.conversation.id,
              senderId: message.senderId,
              content: message.content,
              createdAt: message.createdAt,
              type: 'MESSAGE',
              attachments: message.attachments,
            },
          ],
        });

        return nextMap;
      });
    });

    const unsubscribeTypingStarted = wsClient.on(WS_SERVER_EVENTS.TYPING_STARTED, (event) => {
      setTypingUserIds((current) =>
        current.includes(event.userId) ? current : [...current, event.userId],
      );
    });

    const unsubscribeTypingStopped = wsClient.on(WS_SERVER_EVENTS.TYPING_STOPPED, (event) => {
      setTypingUserIds((current) => current.filter((userId) => userId !== event.userId));
    });

    return () => {
      unsubscribeNewMessage();
      unsubscribeTypingStarted();
      unsubscribeTypingStopped();
      unsubscribeSentMessage();
    };
  }, [user]);

  useEffect(() => {
    let ignore = false;
    /*  if (!reloadConvesations) {
      return;
    } */

    async function loadConversations() {
      try {
        setError(null);
        const conversations = await conversationService.getBootstrap();
        if (ignore) return;
        setConversations(
          new Map(
            conversations.map((conversation: Conversation) => [conversation.id, conversation]),
          ),
        );
      } catch {
        if (!ignore) setError('Could not load conversations');
      } finally {
        if (!ignore) setLoadingConversations(false);
      }
    }

    loadConversations();

    return () => {
      ignore = true;
    };
  }, []);

  const activeConversation = useMemo(
    () => conversations.get(activeConversationId) || null,
    [conversations, activeConversationId],
  );

  function handleCurrentConversation(conversationId: string) {
    setActiveConversationId(conversationId);
  }

  async function handleReceiverId(id: string) {
    setReceiverId(id);
  }

  async function getUserByCode(userCode: string) {
    const response = await userService.getUserByCode({ userCode });

    return response.data.result;
  }

  async function prepareAttachments(files: File[]) {
    const mappedFiles = files.map((file) => ({
      contentType: file.type as UploadContentType,
      size: file.size,
      fileName: file.name,
    }));

    const result = await fileService.processUpload({ files: mappedFiles });
    const uploadItems = result.presignedUrls;
    const attachments = result.pendingUploads.map((item: any) => {
      return {
        id: item.id,
        fileName: item.fileName,
        size: item.size,
        storageKey: item.storageKey,
        contentType: item.contentType,
      };
    });

    await Promise.all(
      attachments.map(async (item) => {
        const upload = files.find((file) => file.name === item.fileName);
        const uploadItem = uploadItems.find((upload) => upload.key === item.storageKey);

        if (!upload || !uploadItem) {
          throw new Error(`No presigned URL for ${item.fileName}`);
        }

        await fileService.uploadFile(upload, uploadItem.url);
      }),
    );

    return attachments;
  }

  function handleTypingStart() {
    if (!activeConversationId) return;
    wsClient.emit(WS_CLIENT_EVENTS.TYPING_START, {
      conversationId: activeConversationId,
    });
  }

  function handleTypingStop() {
    if (!activeConversationId) return;
    wsClient.emit(WS_CLIENT_EVENTS.TYPING_STOP, {
      conversationId: activeConversationId,
    });
  }

  function handleSendMessage(content: string, attachments: FileAttachment[] = []) {
    if (activeConversation && activeConversation.type === 'GROUP') {
      wsClient.emit(WS_CLIENT_EVENTS.SEND_GROUP_MESSAGE, {
        content,
        attachments,
        conversationId: activeConversation.id,
      });
      return;
    }

    const targetReceiverId =
      receiverId || activeConversation?.members.filter((member) => member.id !== user?.id)[0].id;

    if (!targetReceiverId) {
      return;
    }

    wsClient.emit(WS_CLIENT_EVENTS.SEND_PRIVATE_MESSAGE, {
      content,
      attachments,
      receiverId: targetReceiverId,
    });
  }

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        typingUserIds,
        loadingConversations,
        error,
        receiverId,
        handleTypingStart,
        handleTypingStop,
        handleSendMessage,
        handleCurrentConversation,
        prepareAttachments,
        getUserByCode,
        handleReceiverId,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
