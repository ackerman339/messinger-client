import { createSignalDelivery } from '../signaling/signal-delivery';

import type { CallMedia, CallStatus, CallServerPayloads, Negotiation } from '../types/call';
import { createPeerSession } from '../rtc/peer-session';

export interface CallView {
  callId?: string;
  participantId: string;
  media: CallMedia;
  incoming: boolean;
  answering?: boolean;
  ending?: boolean;
  status: CallStatus | 'requesting';
  selected: boolean;
  expiresAt?: string | null;
  connectedAt?: string | null;
  local?: MediaStream;
  remote?: MediaStream;
  muted: boolean;
  cameraOff: boolean;
  switchingCamera?: boolean;
  deviceError?: string;
  error?: string;
  notice?: string;
}

export interface CallSession {
  view: CallView;
  requestId?: string;
  notificationAction?: 'accept' | 'reject';
  notificationResponseSent?: boolean;
  notificationResponseDeadline?: number;
  cancelled: boolean;
  closed: boolean;
  negotiation?: Negotiation;
  negotiationRequest?: string;
  syncId?: string;
  rtc: ReturnType<typeof createPeerSession>;
  remoteNegotiationId?: string;
  candidates: Map<string, (RTCIceCandidateInit | null)[]>;
  retired: Set<string>;
  pendingOffer?: CallServerPayloads['CALL_OFFER'];
  applied: Set<string>;
  delivery: ReturnType<typeof createSignalDelivery>;
  deadline?: string | null;
  connectedReported: boolean;
  timeoutSent: boolean;
  nextSync: number;
  queue: Promise<void>;
}

export function createCallSession(view: CallView, requestId?: string): CallSession {
  return {
    view,
    requestId,
    cancelled: false,
    closed: false,
    rtc: createPeerSession(),
    candidates: new Map(),
    retired: new Set(),
    applied: new Set(),
    delivery: createSignalDelivery(),
    connectedReported: false,
    timeoutSent: false,
    nextSync: Date.now() + 4000,
    queue: Promise.resolve(),
  };
}
