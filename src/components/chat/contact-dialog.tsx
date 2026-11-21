import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { useContactsContext } from '@/context/contacts-context';
import { contactErrorMessage } from '@/services/contacts';
import type { Contact } from '@/types/contact';

type ContactDialogProps = {
  contact?: Contact;
  conversationId?: string;
  onClose: () => void;
};

export function ContactDialog({ contact, conversationId, onClose }: ContactDialogProps) {
  const { add, rename, remove } = useContactsContext();
  const [code, setCode] = useState('');
  const [name, setName] = useState(contact?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsCode = !contact && !conversationId;
  const title = contact
    ? 'Editar contacto'
    : conversationId
      ? 'Agregar como contacto'
      : 'Nuevo contacto';

  async function submit() {
    if (busy || (needsCode && !code.trim())) return;
    setBusy(true);
    setError('');

    try {
      if (contact) {
        if (confirmDelete) await remove(contact);
        else await rename(contact, name.trim() || null);
      } else {
        const customName = name.trim() || undefined;
        await add(
          conversationId
            ? { conversationId, name: customName }
            : { userCode: code.trim(), name: customName }
        );
      }
      onClose();
    } catch (error) {
      setError(contactErrorMessage(error, 'No se pudo guardar el cambio. Inténtalo de nuevo.'));
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
          <div className='mb-4 flex items-center justify-between gap-3'>
            <Dialog.Title className='font-semibold'>{title}</Dialog.Title>
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
            Guarda el contacto con un nombre propio o usa su nombre de usuario.
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {confirmDelete ? (
              <p className='text-sm'>¿Quieres eliminar este contacto de tu lista?</p>
            ) : (
              <div className='space-y-3'>
                {needsCode && (
                  <label className='block text-sm'>
                    Código de usuario
                    <input
                      className='mt-1 h-10 w-full rounded-lg bg-slate-100 px-3 outline-none focus:ring-2 focus:ring-accent'
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      autoComplete='off'
                      spellCheck={false}
                      maxLength={10}
                      required
                      disabled={busy}
                    />
                  </label>
                )}
                <label className='block text-sm'>
                  Nombre del contacto (opcional)
                  <input
                    className='mt-1 h-10 w-full rounded-lg bg-slate-100 px-3 outline-none focus:ring-2 focus:ring-accent'
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={contact?.username ?? undefined}
                    maxLength={100}
                    disabled={busy}
                  />
                </label>
              </div>
            )}
            {error && (
              <p role='alert' className='mt-3 text-sm text-danger'>
                {error}
              </p>
            )}
            <div className='mt-5 flex justify-between gap-2'>
              {contact && (
                <button
                  type='button'
                  disabled={busy}
                  className='cursor-pointer px-2 text-sm text-text-secondary hover:underline disabled:cursor-default'
                  onClick={() => {
                    setError('');
                    setConfirmDelete(!confirmDelete);
                  }}
                >
                  {confirmDelete ? 'Cancelar' : 'Eliminar contacto'}
                </button>
              )}
              <button
                type='submit'
                disabled={busy || (needsCode && !code.trim())}
                className={`ml-auto cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-40 ${confirmDelete ? 'bg-danger' : 'bg-accent'}`}
              >
                {busy ? 'Guardando…' : confirmDelete ? 'Eliminar' : 'Guardar'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
