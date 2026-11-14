import type { CallConversationEvent } from "./conversation";
export type CallMedia = "audio" | "video";

export type CallStatus =
  | "ringing"
  | "accepted"
  | "connected"
  | "rejected"
  | "ended"
  | "missed"
  | "failed";

export type NegotiationType = "INITIAL" | "MEDIA_CHANGE" | "ICE_RESTART";

export type NegotiationStatus =
  | "PENDING"
  | "OFFERED"
  | "ANSWERED"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type Reference = { callId: string };
export type Signal = Reference & { negotiationId: string; sdp: string };

export type SignalAck = Reference & {
  negotiationId: string;
  signalType: "CALL_OFFER" | "CALL_ANSWER";
  signalId: string;
};

export type Candidate = Reference & {
  negotiationId: string;
  candidate: RTCIceCandidateInit | null;
};

export interface CallClientPayloads {
  CALL_INIT: {
    conversationId?: string;
    requestId: string;
    calleeId: string;
    media: CallMedia;
    callerName?: string;
  };
  CALL_ACCEPT: Reference;
  CALL_REJECT: Reference;
  CALL_END: Reference;
  CALL_TIMEOUT: Reference;
  CALL_CONNECTED: Reference;
  CALL_NEGOTIATION_INIT: Reference & {
    requestId: string;
    type: NegotiationType;
  };
  CALL_OFFER: Signal;
  CALL_ANSWER: Signal;
  CALL_SIGNAL_ACK: SignalAck;
  CALL_ICE_CANDIDATE: Candidate;
  CALL_RECOVERED: Reference & { negotiationId: string };
  CALL_SYNC: { syncId: string } & (
    | { callId: string; requestId?: never }
    | { requestId: string; callId?: never }
  );
}

export interface Negotiation {
  negotiationId: string;
  requestId: string;
  type: NegotiationType;
  status: NegotiationStatus;
  offererId: string;
  createdAt: string;
  expiresAt: string | null;
  recoveryExpiresAt?: string | null;
}

export interface CallSnapshot extends Reference {
  requestId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
  status: CallStatus;
  role: "CALLER" | "CALLEE";
  isSelectedConnection: boolean;
  isTerminal: boolean;
  createdAt: string;
  acceptedAt: string | null;
  connectedAt: string | null;
  endedAt: string | null;
  expiresAt: string | null;
  connectionExpiresAt: string | null;
  recoveryExpiresAt: string | null;
  currentNegotiationId: string | null;
}

export interface CallServerPayloads {
  // Current handler omits requestId, despite the plan's example.
  CALL_CREATED: Reference & {
    requestId?: string;
    calleeId: string;
    media: CallMedia;
    status: CallStatus;
    createdAt: string;
    expiresAt: string | null;
  };
  CALL_INCOMING: Reference & {
    callerId: string;
    callerName?: string;
    media: CallMedia;
    createdAt: string;
    expiresAt: string | null;
  };
  CALL_ACCEPT: Reference & {
    callerId: string;
    calleeId: string;
    status: CallStatus;
    acceptedAt: string;
    connectionExpiresAt: string | null;
    isSelectedConnection: boolean;
    shouldCreateOffer: boolean;
    shouldInitiateNegotiation: boolean;
  };
  CALL_REJECT: Reference & {
    conversationEvent?: CallConversationEvent;
    status: CallStatus;
    endedAt?: string | null;
  };
  CALL_END: Reference & {
    conversationEvent?: CallConversationEvent;
    callerName?: string;
    status?: CallStatus;
    endedAt?: string | null;
    endedBy?: string;
    reason?: string;
  };
  CALL_CONNECTED: Reference & {
    status: CallStatus;
    connectedAt: string | null;
    connectionExpiresAt: string | null;
  };
  CALL_NEGOTIATION_CREATED: Reference & Negotiation & { created: boolean };
  CALL_OFFER: Signal & {
    negotiationType: NegotiationType;
    offererId: string;
    signalId: string;
  };
  CALL_ANSWER: Signal & { signalId: string };
  CALL_SIGNAL_ACK: SignalAck;
  CALL_ICE_CANDIDATE: Candidate;
  CALL_NEGOTIATION_COMPLETED: Reference & {
    negotiationId: string;
    status: NegotiationStatus;
  };
  CALL_NEGOTIATION_END: Reference & {
    negotiationId: string;
    type: NegotiationType;
    status: NegotiationStatus;
    endedAt: string;
    reason: string;
  };
  CALL_RECOVERED: Reference & {
    negotiationId: string;
    recoveredAt: string | null;
    recoveryExpiresAt: string | null;
  };
  CALL_STATE: {
    syncId: string;
    call: CallSnapshot;
    negotiation: (Negotiation & { isOfferer: boolean }) | null;
  };
}

export const CALL_CLIENT_EVENTS = Object.fromEntries(
  [
    "CALL_INIT",
    "CALL_ACCEPT",
    "CALL_REJECT",
    "CALL_END",
    "CALL_TIMEOUT",
    "CALL_CONNECTED",
    "CALL_NEGOTIATION_INIT",
    "CALL_OFFER",
    "CALL_ANSWER",
    "CALL_SIGNAL_ACK",
    "CALL_ICE_CANDIDATE",
    "CALL_RECOVERED",
    "CALL_SYNC",
  ].map((key) => [key, key]),
) as { [K in keyof CallClientPayloads]: K };

export const CALL_SERVER_EVENTS = Object.fromEntries(
  [
    "CALL_CREATED",
    "CALL_INCOMING",
    "CALL_ACCEPT",
    "CALL_REJECT",
    "CALL_END",
    "CALL_CONNECTED",
    "CALL_NEGOTIATION_CREATED",
    "CALL_OFFER",
    "CALL_ANSWER",
    "CALL_SIGNAL_ACK",
    "CALL_ICE_CANDIDATE",
    "CALL_NEGOTIATION_COMPLETED",
    "CALL_NEGOTIATION_END",
    "CALL_RECOVERED",
    "CALL_STATE",
  ].map((key) => [key, key]),
) as { [K in keyof CallServerPayloads]: K };

export const isTerminal = (status: CallStatus) =>
  ["rejected", "ended", "missed", "failed"].includes(status);
