import type { Room } from 'livekit-client';

export type GroupRoomDisconnect = 'room-ended' | 'left' | 'unexpected';

export async function createGroupRoom(
  onDisconnected: (reason: GroupRoomDisconnect) => void,
  onParticipantConnected: () => void,
) {
  const { DefaultReconnectPolicy, DisconnectReason, Room, RoomEvent } = await import('livekit-client');
  const reconnectPolicy = new DefaultReconnectPolicy([0, 300, 1200, 2700, 4000, 5000]);
  return new Room({ adaptiveStream: true, dynacast: true, reconnectPolicy })
    .on(RoomEvent.Disconnected, (reason) => {
      if (
        reason === DisconnectReason.ROOM_DELETED ||
        reason === DisconnectReason.ROOM_CLOSED
      ) {
        onDisconnected('room-ended');
      } else if (
        reason === DisconnectReason.PARTICIPANT_REMOVED ||
        reason === DisconnectReason.DUPLICATE_IDENTITY ||
        reason === DisconnectReason.CLIENT_INITIATED
      ) {
        onDisconnected('left');
      } else {
        onDisconnected('unexpected');
      }
    })
    .on(RoomEvent.ParticipantConnected, onParticipantConnected);
}

export async function connectGroupRoom(
  room: Room,
  url: string,
  token: string,
  signal: AbortSignal,
  onRelayRetry: () => void,
) {
  const { ConnectionError, ConnectionErrorReason } = await import('livekit-client');
  if (signal.aborted) return;
  try {
    await room.connect(url, token, { peerConnectionTimeout: 10_000 });
  } catch (error) {
    if (signal.aborted) return;
    if (
      !(error instanceof ConnectionError) ||
      error.reason !== ConnectionErrorReason.InternalError ||
      error.message !== 'could not establish pc connection'
    )
      throw error;

    // The SDK closes the failed PeerConnection. A fresh connection uses the TURN
    // servers from the new join response and tries only relay candidates.
    onRelayRetry();
    await room.connect(url, token, { rtcConfig: { iceTransportPolicy: 'relay' } });
  }
}

export function subscribeToForeground(refresh: () => void) {
  function onVisibility() {
    if (!document.hidden) refresh();
  }
  const timer = window.setInterval(onVisibility, 30_000);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
