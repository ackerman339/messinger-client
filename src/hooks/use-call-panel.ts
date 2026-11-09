import { useEffect, useState } from 'react';
import { useCallContext } from '@context/call-context';
import { useChatContext } from '@context/chat-context';
import { useCallSound } from './use-call-sound';
import { useCallAudioOutput } from './use-call-audio-output';
import { getCallSound } from '@services/call-ringtone';
import { isTerminal } from '../types/call';

export function useCallPanel() {
  const {
    call,
    handleAcceptCall,
    handleRejectCall,
    handleEndCall,
    handleDismissCall,
    handleToggleMicrophone,
    handleToggleCamera,
    handleSwitchCamera,
  } = useCallContext();
  const { conversations } = useChatContext();
  const [now, setNow] = useState(() => Date.now());
  const hasCall = call !== null;

  useEffect(() => {
    if (!hasCall) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasCall]);

  const terminal = !!call && call.status !== 'requesting' && isTerminal(call.status);
  const canAccept = call?.incoming === true && call.status === 'ringing' && !call.answering;
  const labels = {
    requesting: call?.incoming ? 'Consultando llamada…' : 'Iniciando llamada…',
    ringing: call?.answering
      ? (call.notice ?? 'Procesando llamada…')
      : call?.incoming
        ? 'Llamada entrante'
        : 'Llamando…',
    accepted: 'Conectando…',
    connected: 'Llamada conectada',
    ended: 'Llamada finalizada',
    rejected: 'Llamada rechazada',
    missed: 'Sin respuesta',
    failed: 'La llamada falló',
  };

  useCallSound(getCallSound(call), call?.incoming ? call.callId : call?.participantId);
  const audioOutput = useCallAudioOutput(!!call && !terminal, call?.local);
  let participantName = 'Contacto';
  for (const conversation of conversations.values()) {
    const member = conversation.members.find((member) => member.userId === call?.participantId);
    if (member?.username) {
      participantName = member.username;
      break;
    }
  }
  const initials = participantName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toUpperCase();
  const elapsed = call?.connectedAt
    ? Math.max(0, Math.floor((now - Date.parse(call.connectedAt)) / 1000))
    : 0;
  const duration = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;

  return {
    call,
    audioOutput,
    participantName,
    initials,
    duration,
    terminal,
    canAccept,
    canEnd: !!call && !terminal && !canAccept,
    canControlMedia: !!call?.selected && !!call.local && !terminal,
    statusLabel: call ? labels[call.status] : '',
    remaining: call?.expiresAt
      ? Math.max(0, Math.ceil((Date.parse(call.expiresAt) - now) / 1000))
      : null,
    elapsed: call?.connectedAt
      ? Math.max(0, Math.floor((now - Date.parse(call.connectedAt)) / 1000))
      : 0,
    accept: handleAcceptCall,
    reject: handleRejectCall,
    end: handleEndCall,
    dismiss: handleDismissCall,
    toggleMicrophone: handleToggleMicrophone,
    toggleCamera: handleToggleCamera,
    switchCamera: handleSwitchCamera,
  };
}

export type CallPanelModel = ReturnType<typeof useCallPanel>;
