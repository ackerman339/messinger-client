import type { LocationPoint, LocationState } from '../types/location';
import { watchDeviceLocation } from './location-device';

type Publish = (data: { messageId: string; point: LocationPoint }) => boolean;

type Share = {
  expiresAt: number;
  initialCapturedAt: number;
  sentCapturedAt: number;
  nextSendAt: number;
  expirationTimer: ReturnType<typeof setTimeout>;
};

const SEND_INTERVAL = 4000;

export function createLiveLocationPublisher() {
  const shares = new Map<string, Share>();
  let lastPoint: LocationPoint | undefined;
  let publish: Publish | undefined;
  let stopWatching: (() => void) | undefined;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  function stop(messageId: string) {
    const share = shares.get(messageId);
    if (!share) return;
    clearTimeout(share.expirationTimer);
    shares.delete(messageId);
    if (shares.size === 0) {
      clearTimeout(flushTimer);
      stopWatching?.();
      stopWatching = undefined;
      lastPoint = undefined;
    }
  }

  function flush() {
    clearTimeout(flushTimer);
    if (!publish || !lastPoint) return;
    const now = Date.now();
    let next = Infinity;
    for (const [messageId, share] of shares) {
      if (share.expiresAt <= now || lastPoint.capturedAt <= share.sentCapturedAt) continue;
      if (share.nextSendAt > now) {
        next = Math.min(next, share.nextSendAt);
        continue;
      }
      if (!publish({ messageId, point: lastPoint })) return;
      share.sentCapturedAt = lastPoint.capturedAt;
      share.nextSendAt = now + SEND_INTERVAL;
    }
    if (Number.isFinite(next)) flushTimer = setTimeout(flush, next - now);
  }

  function begin(messageId: string, initial: LocationState) {
    const now = Date.now();
    if (
      !initial.expiresAt ||
      initial.stoppedAt ||
      initial.expiresAt <= now ||
      shares.has(messageId)
    )
      return;
    shares.set(messageId, {
      expiresAt: initial.expiresAt,
      initialCapturedAt: initial.capturedAt,
      sentCapturedAt: initial.capturedAt,
      nextSendAt: now,
      expirationTimer: setTimeout(() => stop(messageId), initial.expiresAt - now),
    });
    stopWatching ??= watchDeviceLocation((point) => {
      if (lastPoint && point.capturedAt <= lastPoint.capturedAt) return;
      lastPoint = point;
      flush();
    });
  }

  function connect(next?: Publish) {
    publish = next;
    if (next) {
      for (const share of shares.values()) {
        // The previous socket may have closed before the server received the last point.
        share.sentCapturedAt = share.initialCapturedAt;
        share.nextSendAt = 0;
      }
    }
    flush();
  }

  function clear() {
    for (const messageId of shares.keys()) stop(messageId);
  }

  return { begin, stop, connect, clear };
}
