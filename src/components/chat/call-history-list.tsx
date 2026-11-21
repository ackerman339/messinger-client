import {
  ArrowDownLeft,
  ArrowUpRight,
  LoaderCircle,
  Phone,
  RefreshCw,
  Trash2,
  Video,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import { useUserContext } from '@/context/user-context';
import { useCallHistory } from '@/hooks/use-call-history';
import type { CallHistoryItem } from '@/types/call';

export function CallHistoryList() {
  const { user, canSync } = useUserContext();
  const history = useCallHistory(user?.id, canSync);
  const [confirmation, setConfirmation] = useState<
    CallHistoryItem | 'all' | null
  >(null);
  const busy = history.isLoading || !!history.deleting;

  function confirmRemove() {
    if (!confirmation) return;
    void history.remove(confirmation === 'all' ? undefined : confirmation.id);
    setConfirmation(null);
  }

  return (
    <section
      aria-label='Historial de llamadas'
      className='flex min-h-0 flex-1 flex-col'
    >
      <div className='flex items-center justify-between border-b border-border px-5 py-2.5'>
        <span className='text-xs font-medium text-text-secondary'>
          Más recientes primero
        </span>
        <div className='flex gap-1'>
          <button
            type='button'
            aria-label='Actualizar llamadas'
            disabled={busy}
            onClick={history.refresh}
            className='grid size-9 place-items-center rounded-full text-text-secondary hover:bg-slate-100 disabled:opacity-40'
          >
            <RefreshCw
              size={17}
              className={history.isLoading ? 'animate-spin' : ''}
            />
          </button>
          <button
            type='button'
            aria-label='Eliminar todo el historial'
            disabled={busy || history.items.length === 0}
            onClick={() => setConfirmation('all')}
            className='grid size-9 place-items-center rounded-full text-text-secondary hover:bg-red-50 hover:text-danger disabled:opacity-40'
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
      {confirmation && (
        <div
          className='border-b border-border bg-slate-50 px-5 py-4'
          role='group'
          aria-label='Confirmar eliminación'
        >
          <p className='text-sm font-semibold'>
            {confirmation === 'all'
              ? '¿Eliminar todo el historial?'
              : '¿Eliminar este registro?'}
          </p>
          <p className='mt-1 text-xs text-text-secondary'>
            También se eliminarán los eventos de llamada de tus conversaciones.
          </p>
          <div className='mt-3 flex justify-end gap-2'>
            <button
              type='button'
              onClick={() => setConfirmation(null)}
              className='rounded-lg px-3 py-2 text-sm hover:bg-slate-100'
            >
              Cancelar
            </button>
            <button
              type='button'
              disabled={busy}
              onClick={confirmRemove}
              className='rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-40'
            >
              Eliminar
            </button>
          </div>
        </div>
      )}
      <div
        className='min-h-0 flex-1 overflow-y-auto px-3 pb-4'
        aria-busy={history.isLoading}
      >
        {(history.error || history.actionError) && (
          <div
            role='alert'
            className='mx-2 mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600'
          >
            {history.actionError || 'No se pudo cargar el historial.'}
            {history.error && (
              <button
                type='button'
                disabled={busy}
                onClick={
                  history.refresh
                }
                className='ml-2 font-semibold underline'
              >
                Reintentar
              </button>
            )}
          </div>
        )}
        {history.isLoading && history.items.length === 0 && (
          <div
            role='status'
            className='flex h-48 items-center justify-center gap-2 text-sm text-text-secondary'
          >
            <LoaderCircle size={19} className='animate-spin' />
            Cargando llamadas…
          </div>
        )}
        {!history.isLoading && !history.error && history.items.length === 0 && (
          <div className='flex min-h-72 flex-col items-center justify-center px-8 text-center'>
            <div className='mb-4 grid size-16 place-items-center rounded-full bg-accent/10 text-accent'>
              <Phone size={28} />
            </div>
            <p className='font-semibold'>Aún no hay llamadas</p>
            <p className='mt-2 max-w-64 text-sm text-text-secondary'>
              Tus llamadas de voz y video aparecerán aquí.
            </p>
          </div>
        )}
        <ul>
          {history.items.map((call, index) => (
            <li key={call.id}>
              {(index === 0 ||
                dayLabel(call.createdAt) !==
                  dayLabel(history.items[index - 1].createdAt)) && (
                <h3 className='px-3 pt-5 pb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary'>
                  {dayLabel(call.createdAt)}
                </h3>
              )}
              <CallHistoryRow
                call={call}
                userId={user?.id}
                disabled={busy}
                deleting={history.deleting === call.id}
                onDelete={() => setConfirmation(call)}
              />
            </li>
          ))}
        </ul>
        {history.hasMore && history.items.length > 0 && (
          <button
            type='button'
            onClick={history.loadMore}
            disabled={busy}
            className='mx-auto mt-4 flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-accent hover:bg-accent/5 disabled:opacity-50'
          >
            {history.isLoading && (
              <LoaderCircle size={16} className='animate-spin' />
            )}
            {history.isLoading ? 'Cargando…' : 'Cargar más llamadas'}
          </button>
        )}
      </div>
    </section>
  );
}

export function CallHistoryRow({
  call,
  userId,
  disabled,
  deleting,
  onDelete,
}: {
  call: CallHistoryItem;
  userId?: string;
  disabled?: boolean;
  deleting?: boolean;
  onDelete: () => void;
}) {
  const details = callDetails(call, userId);
  const Icon = call.media === 'video' ? Video : Phone;
  const Direction = details.outgoing ? ArrowUpRight : ArrowDownLeft;
  return (
    <div className='flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-slate-50'>
      <div
        className={`grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold ${details.unsuccessful ? 'bg-red-50 text-danger' : 'bg-accent/10 text-accent'}`}
      >
        {details.name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .toUpperCase()}
      </div>
      <div className='min-w-0 flex-1'>
        <p
          className={`truncate text-[15px] font-semibold ${details.unsuccessful ? 'text-danger' : 'text-text-primary'}`}
        >
          {details.name}
        </p>
        <p className='mt-1 flex items-center gap-1 text-xs text-text-secondary'>
          <Direction
            size={14}
            className={
              details.unsuccessful ? 'text-danger' : 'text-emerald-500'
            }
          />
          {details.outgoing ? 'Saliente' : 'Entrante'} · {details.detail}
        </p>
      </div>
      <div className='flex flex-col items-end gap-1.5 text-text-secondary'>
        <time dateTime={call.createdAt} className='text-[11px]'>
          {format(new Date(call.createdAt), 'HH:mm')}
        </time>
        <Icon
          size={18}
          aria-label={
            call.media === 'video' ? 'Videollamada' : 'Llamada de voz'
          }
        />
      </div>
      <button
        type='button'
        disabled={disabled}
        aria-label={`Eliminar llamada con ${details.name}`}
        onClick={onDelete}
        className='ml-1 grid size-9 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-red-50 hover:text-danger disabled:opacity-35'
      >
        {deleting ? (
          <LoaderCircle size={16} className='animate-spin' />
        ) : (
          <Trash2 size={16} />
        )}
      </button>
    </div>
  );
}

function callDetails(call: CallHistoryItem, userId?: string) {
  const outgoing = call.callerId === userId;
  const person = outgoing ? call.callee : call.caller;
  const name = person?.username?.trim() || 'Usuario eliminado';
  const attended =
    call.status === 'ended' && !!(call.acceptedAt || call.connectedAt);
  const durationSeconds =
    call.connectedAt && call.endedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(call.endedAt) - Date.parse(call.connectedAt)) / 1000,
          ),
        )
      : 0;
  const duration = `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`;
  const status = {
    ringing: 'Llamando',
    accepted: 'Conectando',
    connected: 'En curso',
    missed: outgoing ? 'Sin respuesta' : 'Perdida',
    rejected: 'Rechazada',
    failed: 'Fallida',
    ended: 'Cancelada',
  }[call.status];
  const unsuccessful =
    ['missed', 'rejected', 'failed'].includes(call.status) ||
    (call.status === 'ended' && !attended);
  return {
    outgoing,
    name,
    attended,
    detail: attended ? duration : status,
    unsuccessful,
  };
}

function dayLabel(date: string) {
  const value = new Date(date);
  return isToday(value)
    ? 'Hoy'
    : isYesterday(value)
      ? 'Ayer'
      : format(value, 'd MMMM yyyy', { locale: es });
}
