import { createReplyPreview } from '@/services/message-actions';
import type { LocationInput } from '../types/location';
import { messageSync } from '@/services/message-sync';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useCachedList } from '@/hooks/use-cached-list';
import { offlineListKey } from '@/services/offline-session';
import { updateConversationForMessage } from '@/services/conversation-list-state';

import type { ReactNode } from 'react';
import type { Conversation, Message, MessageReply } from '../types/conversation';
import type { FileAttachment, UploadContentType } from '../types/file';

const conversationKey = (conversation: Conversation) => conversation.id;
const fetchConversations = (cursor: string | null, signal: AbortSignal) =>
  conversationService.getBootstrap({ cursor, limit: 20 }, signal);
const isTransientConversation = (conversation: Conversation) =>
  !!(conversation.invitation || conversation.isDeleted);
const mergeConversation = (server: Conversation, previous?: Conversation) =>
  server.type === 'GROUP' && previous ? mergeGroup(previous, server) : server;

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, canSync } = useUserContext();
  const replyUserId = user?.id;

  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get('conversationId');

  const {
    records: conversations,
    setRecords: setConversations,
    loading: isLoading,
    error,
    hasMore,
    refresh,
    loadMore,
  } = useCachedList<Conversation>({
    cacheKey: user?.id ? offlineListKey('conversations', user.id) : undefined,
    keyOf: conversationKey,
    fetchPage: fetchConversations,
    isTransient: isTransientConversation,
    mergeItem: mergeConversation,
  }, !!user?.id && canSync);
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const activeIdRef = useRef(activeConversationId);
  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);
  const [receiverId, setReceiverId] = useState('');
  const [isLoadingAttachment, setIsLoadingAttachment] = useState(false);
  const [emptiedConversation, setEmptiedConversation] = useState<Pick<
    Conversation,
    'id'
  > | null>(null);
  const [replyDraft, setReplyDraft] = useState<{
    conversationId: string;
    userId: string;
    reply: MessageReply;
  } | null>(null);

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

  const handleGroupDeleted = useCallback((id: string) => {
    setConversations((previous) => {
      const group = previous.get(id);
      if (!group || group.isDeleted) return previous;
      const next = new Map(previous);
      next.set(id, { ...group, isDeleted: true, invitation: undefined });
      return next;
    });
  }, [setConversations]);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
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
      incoming: boolean,
    ) {
      setConversations((previous) =>
        updateConversationForMessage(previous, message, userId, activeIdRef.current, incoming),
      );
    }
    const off = [
      wsClient.on(WS_SERVER_EVENTS.MESSAGE_SENT, (message) => cacheConversationMessage(message, false)),
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
        cacheConversationMessage(message, true);
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
  }, [user?.id, setConversations, handleGroupDeleted]);

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
    setReplyDraft(null);
    activeIdRef.current = '';
    setActiveConversationId('');
  }

  function handleCurrentConversation(conversationId: string) {
    if (activeIdRef.current !== conversationId) setReplyDraft(null);
    activeIdRef.current = conversationId;
    setActiveConversationId(conversationId);
    const conversation = conversationsRef.current.get(conversationId);
    if (!user || !conversation?.members.some((member) => member.userId === user.id && member.unreadCount)) {
      return;
    }
    setConversations((previous) => {
      const current = previous.get(conversationId);
      if (!current) return previous;
      return new Map(previous).set(conversationId, {
        ...current,
        members: current.members.map((member) =>
          member.userId === user.id ? { ...member, unreadCount: 0 } : member,
        ),
      });
    });
    if (canSync) {
      void conversationService.resetUnreadMessagesCount({ conversationId }).catch(() => {});
    }
  }

  async function handleReceiverId(id: string) {
    setReceiverId(id);
  }

  function handleNewConversation(conversation: Conversation) {
    setConversations((previous) => {
      const next = new Map(previous);
      const current = previous.get(conversation.id);
      if (current && !current.invitation) return previous;
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
        attachments.map(async (item, index) => {
          const upload = files[index];
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

  const replyTarget = replyDraft && replyDraft.conversationId === activeConversation?.id &&
    replyDraft.userId === user?.id && !activeConversation.isDeleted ? replyDraft.reply : null;

  const setReplyTarget = useCallback((message: Message | null) => {
    if (!message) {
      setReplyDraft(null);
      return;
    }
    if (!activeConversation || activeConversation.isDeleted || !replyUserId) return;
    setReplyDraft({
      conversationId: activeConversation.id,
      userId: replyUserId,
      reply: createReplyPreview(message),
    });
  }, [activeConversation, replyUserId]);

  function handleSendMessage(content: string, attachments: FileAttachment[] = [], location?: LocationInput) {
    const userId = user?.id;
    const current = activeConversation && conversationsRef.current.get(activeConversation.id);
    if (!userId || activeConversation?.invitation || activeConversation?.isDeleted || current?.isDeleted) {
      return false;
    }
    const data = { content, attachments, location, replyToMessageId: replyTarget?.messageId };
    const finish = (saved: boolean) => {
      if (saved && replyTarget) {
        setReplyDraft((current) => current?.reply === replyTarget ? null : current);
      }
      return saved;
    };
    if (activeConversation?.type === 'GROUP') {
      return finish(messageSync.enqueue(userId, {
        type: WS_CLIENT_EVENTS.SEND_GROUP_MESSAGE,
        data: { ...data, conversationId: activeConversation.id },
      }, replyTarget ?? undefined));
    }
    const targetReceiverId = activeConversation
      ? activeConversation.members.find((member) => member.userId !== userId)?.userId || activeConversation.members[0]?.userId
      : receiverId;
    if (!targetReceiverId) return false;
    return finish(messageSync.enqueue(userId, {
      type: WS_CLIENT_EVENTS.SEND_PRIVATE_MESSAGE,
      data: { ...data, receiverId: targetReceiverId },
    }, replyTarget ?? undefined));
  }

  function handleEmptyChat(conversationId: string) {
    setReplyDraft((current) => current?.conversationId === conversationId ? null : current);
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
        error: canSync && error ? 'No se pudieron sincronizar las conversaciones.' : null,
        receiverId,
        hasMoreConversations: hasMore,
        isLoadingAttachment,
        emptiedConversation,
        replyTarget,
        setReplyTarget,
        handleSendMessage,
        handleCurrentConversation,
        prepareAttachments,
        getUserByCode,
        handleReceiverId,
        unSetCurrentConversation,
        loadMoreConversations: loadMore,
        refreshConversations: refresh,
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
