import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight, Phone, Video } from 'lucide-react';
import type { Message } from '../../types/conversation';

type EventMessage = Pick<Message, 'type' | 'metadata' | 'createdAt'>;

function groupEventText(type: Message['type']) {
  return (
    (
      {
        GROUP_CREATED: 'Grupo creado',
        MEMBER_JOINED: 'Un miembro se unió',
        MEMBER_LEFT: 'Un miembro salió',
        MEMBER_REMOVED: 'Un miembro fue eliminado',
        OWNERSHIP_TRANSFERRED: 'Se transfirió la propiedad',
      } as Record<string, string>
    )[type] ?? 'Evento de conversación'
  );
}

export function ConversationEventMessage({
  message,
  isOwn = false,
}: {
  message: EventMessage;
  isOwn?: boolean;
}) {
  if (message.type !== 'CALL_ACCEPTED' && message.type !== 'CALL_END') {
    return (
      <div className='self-center rounded-lg bg-bg-app/85 px-4 py-2 text-sm text-text-secondary'>
        {groupEventText(message.type)} · {format(new Date(message.createdAt), 'HH:mm')}
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
            <p className='text-[15px] leading-5 font-semibold text-text-primary'>
              {video ? 'Videollamada' : 'Llamada de voz'}
            </p>
            <div className='mt-1 flex items-center gap-1 text-[13px] text-text-secondary'>
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
          className='mt-1 block text-right text-[11px] text-text-secondary'
        >
          {format(new Date(message.createdAt), 'dd MMM hh:mm a')}
        </time>
      </article>
    </div>
  );
}
