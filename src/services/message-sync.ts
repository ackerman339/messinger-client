import type { Conversation, Message } from '../types/conversation';
import { MessageStatus, WS_CLIENT_EVENTS, WS_SERVER_EVENTS } from '../types/websocket';
import type {
  GroupMessageDto,
  MessageDeliveryDto,
  PrivateMessageDto,
  WsServerPayloads,
} from '../types/websocket';
import { outboxStorage, newMessageId } from './outbox-storage';

type SendMessage =
  | { type: typeof WS_CLIENT_EVENTS.SEND_PRIVATE_MESSAGE; data: PrivateMessageDto }
  | { type: typeof WS_CLIENT_EVENTS.SEND_GROUP_MESSAGE; data: GroupMessageDto };

type SendReceipt = {
  type: typeof WS_CLIENT_EVENTS.MESSAGE_DELIVERED | typeof WS_CLIENT_EVENTS.MESSAGE_READ;
  data: MessageDeliveryDto;
};

type OutgoingMessage = SendMessage & {
  id: string;
  createdAt: string;
  failed?: true;
};

type OutgoingReceipt = SendReceipt & { id: string };
export type OutboxEntry = OutgoingMessage | OutgoingReceipt;
type Send = (entry: OutboxEntry) => void;
type Receipt = NonNullable<Message['deliveries']>[number];

type Snapshot = {
  pending: readonly OutgoingMessage[];
  updates: ReadonlyMap<string, ReadonlyMap<string, MessageStatus>>;
  connected: boolean;
  connectionEpoch: number;
};

const ACK_TIMEOUT = 12_000;
const permanentErrors = new Set([
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
]);
const rank = { SENT: 0, DELIVERED: 1, READ: 2 };

export function getDeliveryStatus(
  deliveries: Receipt[],
  updates?: ReadonlyMap<string, MessageStatus>,
) {
  const statuses = new Map(deliveries.map(({ userId, status }) => [userId, status]));
  updates?.forEach((status, userId) => {
    const previous = statuses.get(userId);
    if (!previous || rank[status] > rank[previous]) statuses.set(userId, status);
  });
  let result: MessageStatus = statuses.size ? MessageStatus.READ : MessageStatus.SENT;
  for (const status of statuses.values()) {
    if (rank[status] < rank[result]) result = status;
  }
  return result;
}

export function mergeMessageHistory(previous: Message[], page: Message[]) {
  const byId = new Map(previous.map((message) => [message.messageId || message.id, message]));
  for (const message of page) {
    const id = message.messageId || message.id;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, message);
      continue;
    }
    const deliveries = new Map(existing.deliveries?.map((receipt) => [receipt.userId, receipt]));
    for (const receipt of message.deliveries ?? []) {
      const old = deliveries.get(receipt.userId);
      if (!old || rank[receipt.status] > rank[old.status]) deliveries.set(receipt.userId, receipt);
    }
    byId.set(id, { ...existing, ...message, deliveries: [...deliveries.values()] });
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export const deliveryLabels = {
  PENDING: 'Pendiente',
  FAILED: 'No se pudo enviar',
  SENT: 'Enviado',
  DELIVERED: 'Entregado',
  READ: 'Leído',
} as const;

function isMessage(entry: OutboxEntry): entry is OutgoingMessage {
  return 'createdAt' in entry;
}

export function pendingForConversation(
  pending: readonly OutgoingMessage[],
  conversation: Conversation | null,
  userId: string | undefined,
): Message[] {
  if (!conversation || !userId) return [];
  const receiverId =
    conversation.members.find((member) => member.userId !== userId)?.userId ??
    conversation.members[0]?.userId;
  return pending
    .filter((entry) =>
      entry.type === WS_CLIENT_EVENTS.SEND_GROUP_MESSAGE
        ? conversation.type === 'GROUP' && entry.data.conversationId === conversation.id
        : conversation.type === 'PRIVATE' && entry.data.receiverId === receiverId,
    )
    .map((entry) => ({
      id: entry.id,
      messageId: entry.id,
      clientMessageId: entry.id,
      conversation,
      conversationId: conversation.id,
      senderId: userId,
      content: entry.data.content,
      attachments: entry.data.attachments,
      createdAt: entry.createdAt,
      type: 'MESSAGE',
      localStatus: entry.failed ? 'FAILED' : 'PENDING',
    }));
}

function createMessageSync() {
  let account: string | undefined;
  let authenticatedUser: string | undefined;
  let send: Send | undefined;
  const initialSnapshot: Snapshot = {
    pending: [],
    updates: new Map(),
    connected: false,
    connectionEpoch: 0,
  };
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  const entries = new Map<string, OutboxEntry>();
  const incoming = new Set<string>();
  const received = new Map<string, MessageStatus>();
  const messageLane = {
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    id: '',
    attempts: 0,
  };
  const receiptLane = { ...messageLane };

  function publish(changes: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...changes };
    for (const listener of listeners) listener();
  }

  function publishPending() {
    publish({ pending: [...entries.values()].filter(isMessage) });
  }

  function clearLane(lane: typeof messageLane) {
    clearTimeout(lane.timer);
    lane.timer = undefined;
    lane.id = '';
    lane.attempts = 0;
  }

  function flush() {
    if (!account || account !== authenticatedUser || !send) return;
    let nextMessage: OutgoingMessage | undefined;
    let nextReceipt: OutgoingReceipt | undefined;
    for (const entry of entries.values()) {
      if (isMessage(entry)) {
        if (!entry.failed && !nextMessage) nextMessage = entry;
      } else if (!nextReceipt) {
        nextReceipt = entry;
      }
      if (nextMessage && nextReceipt) break;
    }
    sendNext(nextMessage, messageLane);
    sendNext(nextReceipt, receiptLane);
  }

  function sendNext(entry: OutboxEntry | undefined, lane: typeof messageLane) {
    if (lane.timer || !entry || !send) return;
    lane.id = entry.id;
    const delay = Math.min(ACK_TIMEOUT * 2 ** lane.attempts, 60_000);
    lane.attempts += 1;
    lane.timer = setTimeout(() => {
      lane.timer = undefined;
      flush();
    }, delay);
    send(entry);
  }

  function setAccount(userId?: string) {
    if (account === userId) return;
    clearLane(messageLane);
    clearLane(receiptLane);
    account = userId;
    entries.clear();
    received.clear();
    incoming.clear();
    if (account) {
      try {
        const stored = outboxStorage.load(account);
        for (const entry of stored.sort((a, b) =>
          (isMessage(a) ? a.createdAt : '').localeCompare(isMessage(b) ? b.createdAt : ''),
        ))
          entries.set(entry.id, entry);
      } catch (error) {
        console.error('[messages] no se pudo leer la cola local', error);
      }
    }
    publish({
      pending: [...entries.values()].filter(isMessage),
      updates: new Map(),
      connected: !!account && account === authenticatedUser,
    });
    flush();
  }

  function authenticated(userId: string, transport: Send) {
    authenticatedUser = userId;
    send = transport;
    if (userId === account) {
      publish({ connected: true, connectionEpoch: snapshot.connectionEpoch + 1 });
      flush();
    }
  }

  function disconnected() {
    authenticatedUser = undefined;
    send = undefined;
    clearLane(messageLane);
    clearLane(receiptLane);
    if (snapshot.connected) publish({ connected: false });
  }

  function enqueue(userId: string, payload: SendMessage) {
    if (userId !== account) return false;
    try {
      const id = newMessageId();
      const entry = {
        ...payload,
        data: { ...payload.data, clientMessageId: id },
        id,
        createdAt: new Date().toISOString(),
      } as OutgoingMessage;
      outboxStorage.save(userId, entry);
      entries.set(id, entry);
      publishPending();
      flush();
      return true;
    } catch (error) {
      console.error('[messages] no se pudo guardar el mensaje', error);
      return false;
    }
  }

  function rememberReceipt(messageId: string, status: MessageStatus) {
    if (received.size >= 4000) received.delete(received.keys().next().value!);
    received.set(messageId, status);
  }

  function receipt(
    message: Message,
    status: typeof MessageStatus.DELIVERED | typeof MessageStatus.READ,
  ) {
    const conversationId = message.conversationId ?? message.conversation?.id;
    const messageId = message.messageId || message.id;
    if (
      !account ||
      !conversationId ||
      !messageId ||
      message.senderId === account ||
      (message.type && message.type !== 'MESSAGE') ||
      (message.deliveries && !message.deliveries.some((delivery) => delivery.userId === account))
    )
      return;
    const confirmed = message.deliveries?.find((delivery) => delivery.userId === account)?.status;
    const previous = received.get(messageId);
    if (
      (confirmed && rank[confirmed] >= rank[status]) ||
      (previous && rank[previous] >= rank[status])
    )
      return;

    const id = `${messageId}-${status}`;
    const entry: OutgoingReceipt = {
      id,
      type:
        status === MessageStatus.READ
          ? WS_CLIENT_EVENTS.MESSAGE_READ
          : WS_CLIENT_EVENTS.MESSAGE_DELIVERED,
      data: { conversationId, messageId, status },
    };
    if (!entries.has(id)) {
      try {
        outboxStorage.save(account, entry);
      } catch (error) {
        // The server can replay a delivery again if device storage was unavailable.
        console.error('[messages] no se pudo guardar el acuse', error);
      }
      entries.set(id, entry);
    }
    rememberReceipt(messageId, status);
    flush();
  }

  function discard(id: string) {
    if (!account || !entries.has(id)) return;
    try {
      outboxStorage.remove(account, id);
    } catch (error) {
      console.error('[messages] no se pudo limpiar la cola local', error);
    }
    const entry = entries.get(id)!;
    entries.delete(id);
    if (isMessage(entry)) publishPending();
    const lane = isMessage(entry) ? messageLane : receiptLane;
    if (lane.id === id) clearLane(lane);
    flush();
  }

  function acknowledge(type: string, data: unknown, requestId?: string) {
    if (!account || account !== authenticatedUser) return true;
    if (type === WS_SERVER_EVENTS.NEW_MESSAGE) {
      const message = data as Message;
      const messageId = message.messageId || message.id;
      receipt(message, MessageStatus.DELIVERED);
      if (incoming.has(messageId)) return false;
      if (incoming.size >= 4000) incoming.delete(incoming.values().next().value!);
      incoming.add(messageId);
      return true;
    }
    if (type === WS_SERVER_EVENTS.MESSAGE_STATUS_UPDATED) {
      const { messageId, userId, status } = data as WsServerPayloads['MESSAGE_STATUS_UPDATED'];
      const statuses = new Map(snapshot.updates.get(messageId));
      const previous = statuses.get(userId);
      if (!previous || rank[status] > rank[previous]) {
        statuses.set(userId, status);
        const updates = new Map(snapshot.updates);
        if (updates.size >= 4000 && !updates.has(messageId))
          updates.delete(updates.keys().next().value!);
        updates.set(messageId, statuses);
        publish({ updates });
      }
    }
    if (type === WS_SERVER_EVENTS.MESSAGE_SENT) {
      const message = data as Message;
      if (message.senderId === account && message.clientMessageId) discard(message.clientMessageId);
    }
    if (!requestId) return true;
    const entry = entries.get(requestId);
    if (!entry) return true;
    if (type === WS_SERVER_EVENTS.MESSAGE_RECEIPT_CONFIRMED && !isMessage(entry))
      discard(requestId);
    if (
      type === WS_SERVER_EVENTS.ERROR &&
      permanentErrors.has((data as WsServerPayloads['ERROR'])?.error?.code)
    ) {
      if (isMessage(entry)) {
        const failed = { ...entry, failed: true } as OutgoingMessage;
        try {
          outboxStorage.fail(account, failed);
        } catch (error) {
          console.error('[messages] no se pudo guardar el rechazo', error);
        }
        entries.set(entry.id, failed);
        if (messageLane.id === entry.id) clearLane(messageLane);
        publishPending();
        flush();
      } else {
        discard(requestId);
      }
    }
    return true;
  }

  return {
    enqueue,
    setAccount,
    authenticated,
    disconnected,
    acknowledge,
    receipt,
    discard,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
  };
}

export const messageSync = createMessageSync();
