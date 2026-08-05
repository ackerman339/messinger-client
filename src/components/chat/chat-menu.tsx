import { useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { Copy, LogOut, MessageCircle, Menu } from 'lucide-react';
import { useUserContext } from '../../context/user-context';
import { NewMessageDialog } from './new-message-dialog';

export function ChatMenu() {
  const { user, logout } = useUserContext();
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  async function handleCopyUserCode() {
    if (!user?.userCode) return;

    await navigator.clipboard.writeText(user.userCode);
  }

  async function handleLogout() {
    await logout();
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type='button'
            className='grid size-10 place-items-center rounded-full cursor-pointer text-text-secondary hover:bg-slate-100'
            aria-label='Menu'
          >
            <Menu size={22} />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align='start'
            sideOffset={8}
            className='z-50 min-w-52 rounded-lg border border-border bg-bg-app p-1 shadow-lg'
          >
            <DropdownMenu.Item
              className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100'
              onSelect={() => setNewMessageOpen(true)}
            >
              <MessageCircle size={18} />
              <span>Nuevo mensaje</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100'
              onSelect={handleCopyUserCode}
            >
              <Copy size={18} />
              <span>Copiar tu código de usuario</span>
            </DropdownMenu.Item>

            <DropdownMenu.Separator className='my-1 h-px bg-border' />

            <DropdownMenu.Item
              className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-red-500 outline-none hover:bg-red-50'
              onSelect={handleLogout}
            >
              <LogOut size={18} />
              <span>Cerrar sesión</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <NewMessageDialog open={newMessageOpen} onOpenChange={setNewMessageOpen} />
    </>
  );
}
