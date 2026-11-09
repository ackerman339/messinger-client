import { Dialog } from 'radix-ui';
import { Phone, Video, VideoOff } from 'lucide-react';
import { useCallPanel } from '@hooks/use-call-panel';
import { CallStream } from './call-stream';
import { CallControls } from './call-controls';

export function CallPanel() {
  const model = useCallPanel();
  const { call, terminal, statusLabel, participantName, initials, duration } = model;
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
        <Dialog.Overlay className='fixed inset-0 z-60 grid place-items-center bg-text-primary/45 p-6 backdrop-blur-sm max-[481px]:p-0'>
          <Dialog.Content
            asChild
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              if (!terminal) event.preventDefault();
            }}
          >
            <section
              data-video={showVideo}
              className={`
                group/call relative isolate flex max-h-[calc(100dvh-48px)] min-h-155 w-full max-w-105 flex-col
                overflow-hidden rounded-[28px] border border-border
                bg-[linear-gradient(155deg,var(--color-bg-app),var(--color-bg-chat))] text-text-primary
                shadow-[0_28px_100px_color-mix(in_srgb,var(--color-text-primary)_25%,transparent)] before:pointer-events-none
                before:absolute before:inset-0 before:-z-10
                before:bg-[radial-gradient(ellipse_at_25%_36%,color-mix(in_srgb,var(--color-accent)_12%,transparent),transparent_58%)]
                before:content-[''] data-[video=true]:text-bg-app data-[video=true]:before:z-0
                data-[video=true]:before:bg-[linear-gradient(color-mix(in_srgb,var(--color-text-primary)_65%,transparent),transparent_40%,color-mix(in_srgb,var(--color-text-primary)_85%,transparent))]
                max-[481px]:h-dvh max-[481px]:max-h-none max-[481px]:min-h-0 max-[481px]:max-w-none max-[481px]:rounded-none
                max-[481px]:border-0 min-[481px]:[@media(max-height:650px)]:min-h-0
                min-[481px]:[@media(max-height:650px)]:overflow-y-auto
              `}
            >
              {showVideo && (
                <div className='absolute inset-0 -z-10 bg-text-primary'>
                  <CallStream stream={call.remote} onElement={model.audioOutput.attach} />
                </div>
              )}
              <header className='flex items-center justify-between gap-3 px-6 pt-6 group-data-[video=true]/call:z-1 max-[481px]:pt-[max(24px,env(safe-area-inset-top))]'>
                <span className='flex items-center gap-1 text-sm font-semibold tracking-[-0.2px]'>
                  <span className='size-1 rounded-full bg-accent' />
                  messinger
                </span>
                <span className='flex items-center gap-1.5 text-[11px] text-text-secondary group-data-[video=true]/call:text-bg-app/80'>
                  {call.media === 'video' ? <Video size={15} /> : <Phone size={14} />}
                  {call.media === 'video' ? 'Videollamada' : 'Llamada de voz'}
                </span>
              </header>

              <div className='z-1 px-7 pt-11 text-center group-data-[video=true]/call:pt-6 max-[481px]:pt-15 min-[481px]:[@media(max-height:650px)]:pt-6'>
                <Dialog.Title asChild>
                  <h2 className='text-[31px] leading-tight font-medium tracking-[-0.8px] wrap:anywhere'>
                    {participantName}
                  </h2>
                </Dialog.Title>
                <Dialog.Description asChild>
                  <p
                    role='status'
                    className='mt-2.5 text-[15px] text-text-secondary tabular-nums group-data-[video=true]/call:text-bg-app/80'
                  >
                    {call.status === 'connected' ? duration : statusLabel}
                  </p>
                </Dialog.Description>
              </div>

              {!showVideo && (
                <div className='relative grid min-h-55 flex-1 place-items-center py-9 min-[481px]:[@media(max-height:650px)]:min-h-40 min-[481px]:[@media(max-height:650px)]:py-6'>
                  <div
                    data-ringing={model.canAccept}
                    className={`
                relative grid size-34 place-items-center rounded-full
                bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_18%,var(--color-bg-app)),color-mix(in_srgb,var(--color-accent)_38%,var(--color-bg-app)))]
                text-[46px] font-normal text-accent-ink
                shadow-[0_0_0_14px_color-mix(in_srgb,var(--color-accent)_6%,transparent),0_0_0_29px_color-mix(in_srgb,var(--color-accent)_3%,transparent)]
                data-[ringing=true]:after:absolute data-[ringing=true]:after:-inset-3.75
                data-[ringing=true]:after:animate-call-ring data-[ringing=true]:after:rounded-full
                data-[ringing=true]:after:border data-[ringing=true]:after:border-accent/30
                data-[ringing=true]:after:content-[''] motion-reduce:after:animate-none
                min-[481px]:[@media(max-height:650px)]:size-25 min-[481px]:[@media(max-height:650px)]:text-4xl
              `}
                    aria-hidden='true'
                  >
                    {initials}
                  </div>
                </div>
              )}
              {call.remote && !showVideo && (
                <CallStream stream={call.remote} audioOnly onElement={model.audioOutput.attach} />
              )}
              {call.local && call.media === 'video' && !terminal && (
                <div className='absolute top-45 right-5 z-2 grid h-33 w-24 place-items-center overflow-hidden rounded-2xl border border-border bg-bg-chat text-text-primary'>
                  {call.cameraOff ? (
                    <VideoOff
                      size={30}
                      role='img'
                      aria-label='Cámara apagada'
                      aria-hidden={false}
                    />
                  ) : (
                    <CallStream stream={call.local} muted />
                  )}
                  {!call.cameraOff && (
                    <span className='absolute bottom-0.5 left-1 rounded-[10px] bg-bg-app/85 p-2 text-[11px]'>
                      Tú
                    </span>
                  )}
                </div>
              )}

              <footer className='z-2 mt-auto px-6 pt-5 pb-7.5 text-center group-data-[video=true]/call:pt-70 max-[481px]:pb-[max(32px,env(safe-area-inset-bottom))]'>
                {call.notice && (
                  <p className='mb-4.5 text-[13px] leading-normal text-text-secondary group-data-[video=true]/call:text-bg-app/80'>
                    {call.notice}
                  </p>
                )}
                {call.error && (
                  <p role='alert' className='mb-4.5 text-[13px] leading-normal text-danger'>
                    {call.error}
                  </p>
                )}
                {call.deviceError && (
                  <p role='alert' className='mb-4.5 text-[13px] leading-normal text-danger'>
                    {call.deviceError}
                  </p>
                )}
                {model.audioOutput.error && (
                  <p role='alert' className='mb-4.5 text-[13px] leading-normal text-danger'>
                    {model.audioOutput.error}
                  </p>
                )}
                <CallControls model={model} />
                {model.canAccept && (
                  <p className='mt-8 text-xs text-text-secondary group-data-[video=true]/call:text-bg-app/80'>
                    Te están llamando
                  </p>
                )}
              </footer>
            </section>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
