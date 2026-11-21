import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight, Phone, Video } from 'lucide-react';
import type { Message } from '../../types/conversation';

type EventMessage = Pick<Message, 'type' | 'metadata' | 'createdAt' | 'actorId' | 'targetUserId'>;
type EventMember = { userId: string; username: string };

function groupEventText(message: EventMessage, members: EventMember[]) {
  const id = message.targetUserId || message.actorId;
  const name = members.find((member) => member.userId === id)?.username;
  const target = name || 'Un miembro';
  const call = message.metadata?.media === 'video' ? 'videollamada grupal' : 'llamada grupal';
  switch (message.type) {
    case 'GROUP_CALL_STARTED':
      return `${target} inició una ${call}`;
    case 'GROUP_CALL_ENDED':
      return `Finalizó la ${call}`;
    case 'GROUP_CREATED':
      return name ? `${name} creó el grupo` : 'Grupo creado';
    case 'MEMBER_JOINED':
      return `${target} se unió al grupo`;
    case 'MEMBER_LEFT':
      return `${target} dejó el grupo`;
    case 'MEMBER_REMOVED':
      return `${target} fue eliminado del grupo`;
    case 'OWNERSHIP_TRANSFERRED':
      return name ? `${name} es el nuevo propietario del grupo` : 'Se transfirió la propiedad';
    default:
      return 'Evento de conversación';
  }
}

export function ConversationEventMessage({
  message,
  isOwn = false,
  members = [],
}: {
  message: EventMessage;
  isOwn?: boolean;
  members?: EventMember[];
}) {
  if (message.type !== 'CALL_ACCEPTED' && message.type !== 'CALL_END') {
    return (
      <div className='self-center rounded-lg bg-bg-app/85 px-4 py-2 text-sm text-text-secondary'>
        {groupEventText(message, members)} · {format(new Date(message.createdAt), 'dd MMM hh:mm a')}
      </div>
    );
  }
  const accepted = message.type === 'CALL_ACCEPTED';
  const video = message.metadata?.media === 'video';
  const Icon = video ? Video : Phone;
  const Direction = isOwn ? ArrowUpRight : ArrowDownLeft;
  const rawSeconds = Number(message.metadata?.durationSeconds ?? 0);
  const seconds = Number.isFinite(rawSeconds) ? Math.max(0, Math.floor(rawSeconds)) : 0;
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const outcome =
    (
      {
        rejected: 'Rechazada',
        missed: isOwn ? 'Sin respuesta' : 'Perdida',
        failed: 'No se pudo conectar',
      } as Record<string, string>
    )[String(message.metadata?.status)] ?? (isOwn ? 'Cancelada' : 'No contestada');

  return (
    <div className={`flex w-full py-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <article
        aria-label={`${video ? 'Videollamada' : 'Llamada de voz'} ${isOwn ? 'saliente' : 'entrante'}`}
        className={`min-w-60 max-w-[85%] rounded-xl px-3 pt-3 pb-2 shadow-sm ${
          isOwn ? 'rounded-br-sm bg-bg-bubble-own' : 'rounded-bl-sm bg-bg-bubble-other'
        }`}
      >
        <div className='flex items-center gap-3'>
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
              accepted ? 'bg-emerald-500/12 text-emerald-500' : 'bg-red-500/12 text-red-500'
            }`}
          >
            <Icon size={23} aria-hidden='true' />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='text-[0.9375rem] leading-5 font-semibold text-text-primary'>
              {video ? 'Videollamada' : 'Llamada de voz'}
            </p>
            <div className='mt-1 flex items-center gap-1 text-[0.8125rem] text-text-secondary'>
              <Direction
                size={14}
                aria-hidden='true'
                className={accepted ? 'text-emerald-500' : 'text-red-500'}
              />
              <span>{accepted ? duration : outcome}</span>
            </div>
          </div>
        </div>
        <time
          dateTime={message.createdAt}
          className='mt-1 block text-right text-[0.6875rem] text-text-secondary'
        >
          {format(new Date(message.createdAt), 'dd MMM hh:mm a')}
        </time>
      </article>
    </div>
  );
}
