import { Dialog } from 'radix-ui';
import { Phone, Video } from 'lucide-react';
import { useCallPanel } from '@hooks/use-call-panel';
import { CallStream } from './call-stream';
import { CallControls } from './call-controls';
import './call.css';

export function CallPanel() {
  const model = useCallPanel();
  const {
    call,
    terminal,
    statusLabel,
    participantName,
    initials,
    duration,
  } = model;
  if (!call) return null;

  const showVideo = call.media === 'video' && !!call.remote && !terminal;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && terminal) model.dismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='call-overlay'>
          <Dialog.Content
            asChild
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              if (!terminal) event.preventDefault();
            }}
          >
            <section className={`call-card${showVideo ? ' call-card--video' : ''}`}>
              {showVideo && (
                <div className='call-remote'>
                  <CallStream stream={call.remote} />
                </div>
              )}
              <header className='call-topbar'>
                <span className='call-brand'>
                  <span className='call-brand-dot' />
                  messinger
                </span>
                <span className='call-kind'>
                  {call.media === 'video' ? <Video size={15} /> : <Phone size={14} />}
                  {call.media === 'video' ? 'Videollamada' : 'Llamada de voz'}
                </span>
              </header>

              <div className='call-identity'>
                <Dialog.Title asChild>
                  <h2>{participantName}</h2>
                </Dialog.Title>
                <Dialog.Description asChild>
                  <p role='status'>{call.status === 'connected' ? duration : statusLabel}</p>
                </Dialog.Description>
              </div>

              {!showVideo && (
                <div
                  className={`call-avatar-area${model.canAccept ? ' call-avatar-area--ringing' : ''}`}
                >
                  <div className='call-avatar' aria-hidden='true'>
                    {initials}
                  </div>
                </div>
              )}
              {call.remote && !showVideo && <CallStream stream={call.remote} audioOnly />}
              {call.local && call.media === 'video' && !terminal && (
                <div className='call-local'>
                  {call.cameraOff ? (
                    <span>Cámara apagada</span>
                  ) : (
                    <CallStream stream={call.local} muted />
                  )}
                  <span className='call-local-label'>Tú</span>
                </div>
              )}

              <footer className='call-footer'>
                {call.notice && <p className='call-notice'>{call.notice}</p>}
                {call.error && (
                  <p role='alert' className='call-error'>
                    {call.error}
                  </p>
                )}
                <CallControls model={model} />
                {model.canAccept && <p className='call-hint'>Te están llamando</p>}
              </footer>
            </section>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
