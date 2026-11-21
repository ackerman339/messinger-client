import { useRef, useState } from 'react';
import { Avatar, Dialog } from 'radix-ui';
import { ImagePlus, Save, Trash2, X } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useUserContext } from '@/context/user-context';
import { AVATAR_TYPES, MAX_AVATAR_BYTES, userService } from '@/services/user';

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useUserContext();
  const [username, setUsername] = useState(user?.username ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  async function saveUsername() {
    if (busy || !username.trim()) return;
    setBusy(true);
    setError('');
    try {
      const profile = await userService.updateUsername(username.trim());
      updateProfile(profile);
      setUsername(profile.username);
      onClose();
    } catch (error) {
      setError(
        isAxiosError(error) && error.response?.status === 409
          ? 'Ese nombre de usuario ya está en uso.'
          : 'No se pudo cambiar el nombre de usuario.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeAvatar(file?: File) {
    if (busy || !file) return;
    setError('');
    if (!AVATAR_TYPES.includes(file.type) || file.size > MAX_AVATAR_BYTES) {
      setError('Elige una imagen JPG, PNG o WebP de hasta 2 MB.');
      return;
    }

    setBusy(true);
    try {
      updateProfile(await userService.updateAvatar(file));
    } catch {
      setError('No se pudo cambiar el avatar.');
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      updateProfile(await userService.removeAvatar());
      setConfirmRemoval(false);
    } catch {
      setError('No se pudo eliminar el avatar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[60] bg-black/40' />
        <Dialog.Content className='fixed left-1/2 top-1/2 z-[60] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg-app p-5 shadow-xl'>
          <div className='mb-4 flex items-center justify-between'>
            <Dialog.Title className='font-semibold'>Ajustes de perfil</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type='button'
                aria-label='Cerrar'
                disabled={busy}
                className='grid size-8 cursor-pointer place-items-center rounded-full hover:bg-slate-100 disabled:cursor-default'
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className='sr-only'>
            Actualiza tu avatar y tu nombre de usuario.
          </Dialog.Description>
          <div className='mb-5 flex flex-col items-center gap-3'>
            <Avatar.Root className='grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-xl font-semibold text-white ring-4 ring-accent/10'>
              <Avatar.Image
                className='size-full object-cover'
                src={user.avatarUrl ?? undefined}
                alt='Avatar actual'
              />
              <Avatar.Fallback>{(user.username ?? '').slice(0, 2).toUpperCase()}</Avatar.Fallback>
            </Avatar.Root>
            <div className='flex flex-wrap justify-center gap-2'>
              <button
                type='button'
                disabled={busy || confirmRemoval}
                onClick={() => inputRef.current?.click()}
                className='inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent/5 disabled:cursor-default disabled:opacity-40'
              >
                <ImagePlus size={16} aria-hidden='true' />
                Cambiar avatar
              </button>
              {user.avatarUrl && !confirmRemoval && (
                <button
                  type='button'
                  disabled={busy}
                  onClick={() => {
                    setError('');
                    setConfirmRemoval(true);
                  }}
                  className='inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-danger hover:bg-red-50 disabled:cursor-default disabled:opacity-40'
                >
                  <Trash2 size={16} aria-hidden='true' />
                  Eliminar avatar
                </button>
              )}
            </div>
            <input
              ref={inputRef}
              type='file'
              accept={AVATAR_TYPES.join(',')}
              hidden
              onChange={(event) => {
                void changeAvatar(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
          {confirmRemoval && (
            <div className='mb-5 rounded-lg border border-border p-3 text-sm'>
              <p className='text-center'>¿Eliminar tu avatar?</p>
              <div className='mt-2 flex flex-wrap justify-center gap-2'>
                <button
                  type='button'
                  disabled={busy}
                  className='inline-flex cursor-pointer items-center gap-2 rounded px-3 py-2 hover:bg-slate-100 disabled:cursor-default'
                  onClick={() => {
                    setError('');
                    setConfirmRemoval(false);
                  }}
                >
                  <X size={16} aria-hidden='true' />
                  Cancelar
                </button>
                <button
                  type='button'
                  disabled={busy}
                  className='inline-flex cursor-pointer items-center gap-2 rounded bg-danger px-3 py-2 font-semibold text-white disabled:cursor-default disabled:opacity-40'
                  onClick={() => void removeAvatar()}
                >
                  <Trash2 size={16} aria-hidden='true' />
                  Eliminar avatar
                </button>
              </div>
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveUsername();
            }}
          >
            <label className='block text-sm'>
              Nombre de usuario
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={100}
                required
                disabled={busy}
                className='mt-1 h-10 w-full rounded-lg bg-slate-100 px-3 outline-none focus:ring-2 focus:ring-accent'
              />
            </label>
            {error && (
              <p role='alert' className='mt-3 text-sm text-danger'>
                {error}
              </p>
            )}
            {busy && (
              <p role='status' className='mt-3 text-sm text-text-secondary'>
                Guardando…
              </p>
            )}
            <div className='mt-4 flex justify-end'>
              <button
                type='submit'
                disabled={busy || !username.trim() || username.trim() === user.username}
                className='inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-40'
              >
                <Save size={16} aria-hidden='true' />
                Guardar nombre
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
