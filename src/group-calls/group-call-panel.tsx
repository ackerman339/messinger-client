import { lazy, Suspense } from 'react';
import { Phone, Video } from 'lucide-react';
import { useGroupCall } from './group-call-context';
import { GroupCallDialog } from './group-call-dialog';

const GroupRoomPanel = lazy(() => import('./group-room-panel'));

export function GroupCallPanel() {
  const {
    view,
    screen,
    incoming,
    error,
    clearError,
    leave,
    acceptIncoming,
    dismissIncoming,
  } = useGroupCall();
  const details = screen ?? incoming;
  if (!details) return null;
  const video = details.media === 'video';
  const type = video ? 'Videollamada grupal' : 'Llamada grupal';
  const Icon = video ? Video : Phone;
  const offer = !screen && !!incoming;
  const action =
    'cursor-pointer rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent';

  const standby = (
    <GroupCallDialog
      title={details.title}
      status={offer || error ? type : `${type} · Conectando…`}
    >
      <div className='grid flex-1 place-items-center py-5'>
        <div className='grid size-20 place-items-center rounded-full bg-accent/15 text-accent'>
          <Icon size={34} />
        </div>
      </div>
      {error && (
        <p role='alert' className='mb-3 text-center text-sm text-danger'>
          {error}
        </p>
      )}
      <div className='flex justify-center gap-2 pb-2'>
        {offer && (
          <button
            type='button'
            className={`${action} bg-accent text-white`}
            onClick={acceptIncoming}
          >
            Aceptar
          </button>
        )}
        <button
          type='button'
          className={`${action} bg-bg-chat`}
          onClick={offer ? dismissIncoming : error ? clearError : leave}
        >
          {offer ? 'Rechazar' : error ? 'Cerrar' : 'Cancelar'}
        </button>
      </div>
    </GroupCallDialog>
  );

  return view ? (
    <Suspense fallback={standby}>
      <GroupRoomPanel key={view.call.id} view={view} />
    </Suspense>
  ) : (
    standby
  );
}
