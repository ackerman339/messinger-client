import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { conversationService } from '@services/conversation';
import { fileService } from '@services/files';
import { userService } from '@services/user';
import { wsClient } from '@clients/websocket-client';
import { WS_CLIENT_EVENTS } from '@/types/websocket';
import { useUserContext } from '@context/user-context';
import { ChatContext } from '@context/chat-context';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';

import type { ReactNode } from 'react';
import type { Conversation } from '../types/conversation';
import type { FileAttachment, UploadContentType } from '../types/file';

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useUserContext();

  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get('conversationId');

  const [conversations, setConversations] = useState<Map<string, Conversation>>(new Map());
  const [activeConversationId, setActiveConversationId] = useState('');
  const [receiverId, setReceiverId] = useState('');

  const { items, isLoading, hasMore, loadMore } = useCursorPagination<Conversation>({
    fetchPage: (cursor) =>
      conversationService.getBootstrap({
        cursor,
        limit: 20,
      }),
    deps: [],
  });

  /**
   * Merge paginated conversations into the context map.
   *
   * Existing conversations have priority because they may
   * contain newer data received through WebSocket events.
   */
  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations((previous) => {
      const next = new Map(previous);

      for (const conversation of items) {
        const existing = next.get(conversation.id);

        next.set(
          conversation.id,
          existing
            ? {
                ...conversation,
                ...existing,
              }
            : conversation,
        );
      }

      return next;
    });
  }, [items]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveConversationId(conversationId);

    searchParams.delete('conversationId');
    setSearchParams(searchParams, { replace: true });
  }, [conversationId, searchParams, setSearchParams]);

  const activeConversation = useMemo(
    () => conversations.get(activeConversationId) || null,
    [conversations, activeConversationId],
  );

  function unSetCurrentConversation() {
    setActiveConversationId('');
  }

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
    const attachments = result.pendingUploads.map((item) => {
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
        loadingConversations: isLoading,
        error: null,
        receiverId,
        hasMoreConversations: hasMore,
        handleSendMessage,
        handleCurrentConversation,
        prepareAttachments,
        getUserByCode,
        handleReceiverId,
        unSetCurrentConversation,
        loadMoreConversations: loadMore,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
