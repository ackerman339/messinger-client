export type Contact = {
  id: string;
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type CreateContact =
  { userCode: string; name?: string } | { conversationId: string; name?: string };

export function contactDisplayName(contact: Contact | undefined, fallback = 'Usuario') {
  return contact?.name || contact?.username || fallback;
}
