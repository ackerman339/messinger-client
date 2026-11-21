import { GROUP_MEMBER_LIMIT_MESSAGE } from '@/lib/group-limits';
import { conversationService } from './conversation';
import { wsClient } from '@/clients/websocket-client';
import type { Conversation, Member } from '@/types/conversation';
import type { WsServerPayloads } from '@/types/websocket';

export function groupConversation(
  id: string,
  name: string,
  members: Member[] = [],
): Conversation {
  return {
    id,
    name,
    type: 'GROUP',
    members,
    messages: [],
    messagesCursor: null,
    lastMessage: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function invitationConversation(
  invitation: WsServerPayloads['GROUP_INVITATION'],
): Conversation {
  return {
    ...groupConversation(
      invitation.conversationId,
      invitation.groupName || 'Invitación a grupo',
    ),
    invitation: {
      invitationId: invitation.invitationId,
      invitedBy: invitation.invitedBy,
    },
  };
}

export async function getAllConversations(): Promise<Conversation[]> {
  const conversations: Conversation[] = [];
  const visited = new Set<string>();
  let cursor: string | null = null;
  do {
    const result = await conversationService.getBootstrap({
      cursor,
      limit: 20,
    });
    conversations.push(...result.page);
    cursor = result.nextCursor;
    if (cursor && visited.has(cursor))
      throw new Error('No se pudo completar la carga de conversaciones.');
    if (cursor) visited.add(cursor);
  } while (cursor);
  return conversations;
}

export function inviteCandidates(
  conversations: Conversation[],
  group: Conversation,
  userId: string,
): Member[] {
  const excluded = new Set([
    userId,
    ...group.members
      .filter((member) => !member.softDeletedAt)
      .map((member) => member.userId),
  ]);
  const contacts = new Map<string, Member>();
  for (const conversation of conversations) {
    if (conversation.type !== 'PRIVATE') continue;
    for (const member of conversation.members) {
      if (
        !excluded.has(member.userId) &&
        member.username &&
        !member.softDeletedAt
      )
        contacts.set(member.userId, member);
    }
  }
  return [...contacts.values()].sort((a, b) =>
    a.username.localeCompare(b.username),
  );
}

export function groupError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'GROUP:MEMBER_LIMIT') return GROUP_MEMBER_LIMIT_MESSAGE;
  if (message.includes('EXPIRED'))
    return 'La invitación ha vencido. Pide una nueva al propietario.';
  if (message.includes('NOT_FOUND'))
    return 'La invitación o el grupo ya no están disponibles.';
  if (message.includes('ONLY_OWNER'))
    return 'Solo el propietario puede invitar personas.';
  if (message.includes('USER_ALREADY_MEMBER'))
    return 'Esta persona ya pertenece al grupo.';
  if (message.startsWith('GROUP') || !message)
    return 'No se pudo completar la acción. Inténtalo de nuevo.';
  return message;
}

export const groupService = {
  invite: (conversationId: string, targetUserId: string) =>
    wsClient.request('GROUP_INVITE_MEMBER', {
      conversationId,
      targetUserId,
    }),
  accept: (conversationId: string) =>
    wsClient.request('GROUP_INVITATION_ACCEPT', { conversationId }),
  reject: (conversationId: string) =>
    wsClient.request('GROUP_INVITATION_REJECT', { conversationId }),
};

export function mergeGroup(
  previous: Conversation | undefined,
  incoming: Conversation,
): Conversation {
  if (previous?.isDeleted) return previous;
  const known = new Map(
    [
      ...(previous?.knownMembers ?? []),
      ...(previous?.members ?? []),
      ...incoming.members,
    ].map((member) => [member.userId, member]),
  );
  return {
    ...incoming,
    knownMembers: [...known.values()],
    groupRevision: (previous?.groupRevision ?? 0) + 1,
  };
}
