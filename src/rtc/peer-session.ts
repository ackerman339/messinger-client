import { getIceServers } from '../services/ice-api';
import type { CallMedia } from '../types/call';
interface PeerCallbacks {
  isActive: () => boolean;
  onCandidate: (candidate: RTCIceCandidateInit | null) => void;
  onStreams: (local: MediaStream, remote: MediaStream) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onDeviceEnded: (kind: string) => void;
}
const stopTracks = (stream?: MediaStream) =>
  stream?.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
/** Owns browser resources. It knows nothing about WebSocket events or React. */
export function createPeerSession() {
  let peer: RTCPeerConnection | undefined;
  let local: MediaStream | undefined;
  let remote: MediaStream | undefined;
  let preparing: Promise<RTCPeerConnection> | undefined;

  function prepare(media: CallMedia, callbacks: PeerCallbacks): Promise<RTCPeerConnection> {
    if (peer) {
      return Promise.resolve(peer);
    }
    if (preparing) {
      return preparing;
    }
    preparing = open(media, callbacks);
    return preparing;
  }

  async function open(media: CallMedia, callbacks: PeerCallbacks) {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) {
      throw new Error('Este navegador requiere HTTPS y soporte WebRTC para llamar.');
    }
    const iceServers = await getIceServers();
    if (!callbacks.isActive()) {
      throw new Error('Sesión finalizada');
    }
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: media === 'video',
    });
    if (!callbacks.isActive()) {
      stopTracks(localStream);
      throw new Error('Sesión finalizada');
    }
    local = localStream;
    const connection = new RTCPeerConnection({ iceServers });
    peer = connection;
    const remoteStream = new MediaStream();
    remote = remoteStream;
    connection.onicecandidate = (event) => {
      if (callbacks.isActive()) {
        callbacks.onCandidate(event.candidate?.toJSON() ?? null);
      }
    };
    connection.ontrack = (event) => {
      if (!callbacks.isActive()) {
        return;
      }
      remoteStream.addTrack(event.track);
      callbacks.onStreams(localStream, remoteStream);
      event.track.onended = () => {
        if (callbacks.isActive()) {
          callbacks.onStreams(localStream, remoteStream);
        }
      };
    };
    connection.onconnectionstatechange = () => {
      if (callbacks.isActive()) {
        callbacks.onConnectionState(connection.connectionState);
      }
    };
    localStream.getTracks().forEach((track) => {
      connection.addTrack(track, localStream);
      track.onended = () => {
        if (callbacks.isActive()) {
          callbacks.onDeviceEnded(track.kind);
        }
      };
    });
    callbacks.onStreams(localStream, remoteStream);
    return connection;
  }

  function toggle(kind: 'audio' | 'video'): boolean | undefined {
    const tracks =
      local?.getTracks().filter((track) => track.kind === kind && track.readyState === 'live') ??
      [];
    if (!tracks.length) {
      return undefined;
    }
    const enabled = !tracks[0].enabled;
    tracks.forEach((track) => {
      track.enabled = enabled;
    });
    return enabled;
  }

  function close() {
    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.onconnectionstatechange = null;
      peer.close();
      peer = undefined;
    }
    stopTracks(local);
    stopTracks(remote);
    local = undefined;
    remote = undefined;
  }
  return {
    prepare,
    toggle,
    close,
    get peer() {
      return peer;
    },
    get local() {
      return local;
    },
    get remote() {
      return remote;
    },
  };
}
export type PeerSession = ReturnType<typeof createPeerSession>;
