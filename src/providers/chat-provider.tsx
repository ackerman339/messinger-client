import type { LocationInput } from '../types/location';
import { messageSync } from '@/services/message-sync';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { conversationService } from '@services/conversation';
import { fileService } from '@services/files';
import { userService } from '@services/user';
import { wsClient } from '@clients/websocket-client';
import { WS_CLIENT_EVENTS, WS_SERVER_EVENTS } from '@/types/websocket';
import { useUserContext } from '@context/user-context';
import { ChatContext } from '@context/chat-context';
import {
  getAllConversations,
  invitationConversation,
  mergeGroup,
} from '@/services/groups';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';

import type { ReactNode } from 'react';
import type { Conversation } from '../types/conversation';
import type { FileAttachment, UploadContentType } from '../types/file';

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useUserContext();

  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get('conversationId');

  const [conversations, setConversations] = useState<
    Map<string, Conversation>
  >(new Map());
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [isLoadingAttachment, setIsLoadingAttachment] = useState(false);
  const [emptiedConversation, setEmptiedConversation] = useState<Pick<
    Conversation,
    'id'
  > | null>(null);

  const { items, isLoading, hasMore, loadMore, reload } =
    useCursorPagination<Conversation>({
      fetchPage: (cursor) =>
        conversationService.getBootstrap({
          cursor,
          limit: 20,
        }),
      getItemKey: (conversation) => conversation.id,
      deps: [],
    });

  const connectionEpoch = useSyncExternalStore(
    messageSync.subscribe,
    () => messageSync.getSnapshot().connectionEpoch,
    () => 0,
  );
  const previousConnection = useRef(connectionEpoch);
  useEffect(() => {
    if (connectionEpoch === previousConnection.current) return;
    previousConnection.current = connectionEpoch;
    reload();
  }, [connectionEpoch, reload]);

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
          existing && !existing.invitation
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

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let disposed = false;
    async function refreshGroup(id: string, joined = false) {
      try {
        const group = (await getAllConversations()).find(
          (item) => item.id === id,
        );
        if (!group || disposed) return;
        setConversations((previous) => {
          if (!joined && !previous.has(id)) return previous;
          const next = new Map(previous);
          next.set(id, mergeGroup(previous.get(id), group));
          return next;
        });
      } catch {
        // Keep the current conversation; bootstrap refreshes it on the next login.
      }
    }
    function remove(id: string) {
      setConversations((previous) => {
        const next = new Map(previous);
        next.delete(id);
        return next;
      });
      setActiveConversationId((current) =>
        current === id ? '' : current,
      );
    }
    function cacheConversationMessage(
      message: import('@/types/conversation').Message,
    ) {
      const id = message.conversationId ?? message.conversation?.id;
      if (!id) return;
      setConversations((previous) => {
        const conversation = previous.get(id);
        if (!conversation || conversation.isDeleted) return previous;

        if (conversation.type === 'PRIVATE') {
          const participant = message.conversation?.members?.find(
            (member) => member.userId !== userId,
          );
          if (participant?.avatarUrl === undefined) return previous;

          const existing = conversation.members.find(
            (member) => member.userId === participant.userId,
          );
          if (!existing || existing.avatarUrl === participant.avatarUrl) return previous;

          const members = conversation.members.map((member) =>
            member === existing ? { ...member, avatarUrl: participant.avatarUrl } : member,
          );
          return new Map(previous).set(id, { ...conversation, members });
        }

        const next = new Map(previous);
        const messages = [message, ...conversation.messages].filter(
          (item, index, all) =>
            all.findIndex(
              (other) =>
                (other.id || other.messageId) ===
                (item.id || item.messageId),
            ) === index,
        );
        next.set(id, { ...conversation, messages, lastMessage: message });
        return next;
      });
    }
    const off = [
      wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, cacheConversationMessage),
      wsClient.on(
        WS_SERVER_EVENTS.GROUP_INVITATION_REJECTED,
        ({ conversationId }) => remove(conversationId),
      ),
      wsClient.on(WS_SERVER_EVENTS.GROUP_INVITATION, (invitation) => {
        setConversations((previous) => {
          const existing = previous.get(invitation.conversationId);
          if (existing && !existing.invitation) return previous;
          const next = new Map(previous);
          next.set(
            invitation.conversationId,
            invitationConversation(invitation),
          );
          return next;
        });
      }),
      wsClient.on(
        WS_SERVER_EVENTS.GROUP_MEMBER_JOINED,
        ({ conversationId, userId: joinedUser }) => {
          void refreshGroup(conversationId, joinedUser === userId);
        },
      ),
      wsClient.on(
        WS_SERVER_EVENTS.GROUP_MEMBER_LEFT,
        ({ conversationId, userId: leftUser }) => {
          if (leftUser === userId) remove(conversationId);
          else void refreshGroup(conversationId);
        },
      ),
      wsClient.on(
        WS_SERVER_EVENTS.GROUP_MEMBER_REMOVED,
        ({ conversationId, removedUserId }) => {
          if (removedUserId === userId) remove(conversationId);
          else void refreshGroup(conversationId);
        },
      ),
      wsClient.on(
        WS_SERVER_EVENTS.GROUP_OWNER_CHANGED,
        ({ conversationId }) => {
          void refreshGroup(conversationId);
        },
      ),
      wsClient.on(WS_SERVER_EVENTS.GROUP_DELETED, ({ conversationId }) =>
        handleGroupDeleted(conversationId),
      ),
      wsClient.on(WS_SERVER_EVENTS.NEW_MESSAGE, (message) => {
        cacheConversationMessage(message);
        if (
          !message.conversation &&
          message.conversationId &&
          !conversationsRef.current.has(message.conversationId)
        )
          void refreshGroup(message.conversationId, true);
      }),
    ];
    return () => {
      disposed = true;
      off.forEach((unsubscribe) => unsubscribe());
    };
  }, [user?.id]);

  function handleGroupDeleted(id: string) {
    setConversations((previous) => {
      const group = previous.get(id);
      if (!group || group.isDeleted) return previous;
      const next = new Map(previous);
      next.set(id, { ...group, isDeleted: true, invitation: undefined });
      return next;
    });
  }

  function handleGroupOwnerChanged(id: string, newOwnerId: string) {
    setConversations((previous) => {
      const group = previous.get(id);
      if (!group || group.isDeleted) return previous;
      const next = new Map(previous);
      next.set(id, {
        ...group,
        groupRevision: (group.groupRevision ?? 0) + 1,
        members: group.members.map((member) => ({
          ...member,
          role: member.userId === newOwnerId ? 'OWNER' : 'MEMBER',
        })),
      });
      return next;
    });
  }

  function handleRemoveConversation(id: string) {
    setConversations((previous) => {
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
    setActiveConversationId((current) => (current === id ? '' : current));
  }

  function unSetCurrentConversation() {
    setActiveConversationId('');
  }

  function handleCurrentConversation(conversationId: string) {
    setActiveConversationId(conversationId);
  }

  async function handleReceiverId(id: string) {
    setReceiverId(id);
  }

  function handleNewConversation(conversation: Conversation) {
    setConversations((previous) => {
      const next = new Map(previous);
      next.set(conversation.id, conversation);

      return next;
    });
  }

  async function getUserByCode(userCode: string) {
    const response = await userService.getUserByCode({ userCode });

    return response.data.result;
  }

  async function prepareAttachments(files: File[]) {
    setIsLoadingAttachment(true);
    try {
      const mappedFiles = files.map((file) => ({
        contentType: (file.type ||
          'application/octet-stream') as UploadContentType,
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
          const uploadItem = uploadItems.find(
            (upload) => upload.key === item.storageKey,
          );

          if (!upload || !uploadItem) {
            throw new Error(`No presigned URL for ${item.fileName}`);
          }

          await fileService.uploadFile(upload, uploadItem.url);
        }),
      );
      return attachments;
    } finally {
      setIsLoadingAttachment(false);
    }
  }

  function handleSendMessage(content: string, attachments: FileAttachment[] = [], location?: LocationInput) {
    const userId = user?.id;
    const current = activeConversation && conversationsRef.current.get(activeConversation.id);
    if (!userId || activeConversation?.invitation || activeConversation?.isDeleted || current?.isDeleted) {
      return false;
    }
    if (activeConversation?.type === 'GROUP') {
      return messageSync.enqueue(userId, {
        type: WS_CLIENT_EVENTS.SEND_GROUP_MESSAGE,
        data: { content, attachments, location, conversationId: activeConversation.id },
      });
    }
    const targetReceiverId = activeConversation
      ? activeConversation.members.find((member) => member.userId !== userId)?.userId || activeConversation.members[0]?.userId
      : receiverId;
    if (!targetReceiverId) return false;
    return messageSync.enqueue(userId, {
      type: WS_CLIENT_EVENTS.SEND_PRIVATE_MESSAGE,
      data: { content, attachments, location, receiverId: targetReceiverId },
    });
  }

  function handleEmptyChat(conversationId: string) {
    setConversations((previous) => {
      const conversation = previous.get(conversationId);
      if (!conversation) return previous;
      const next = new Map(previous);
      next.set(conversationId, {
        ...conversation,
        messages: [],
        messagesCursor: null,
        lastMessage: undefined,
        members: conversation.members.map((member) =>
          member.userId === user?.id
            ? { ...member, unreadCount: 0 }
            : member,
        ),
      });
      return next;
    });
    setEmptiedConversation({ id: conversationId });
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
        isLoadingAttachment,
        emptiedConversation,
        handleSendMessage,
        handleCurrentConversation,
        prepareAttachments,
        getUserByCode,
        handleReceiverId,
        unSetCurrentConversation,
        loadMoreConversations: loadMore,
        handleNewConversation,
        handleEmptyChat,
        handleRemoveConversation,
        handleGroupDeleted,
        handleGroupOwnerChanged,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
