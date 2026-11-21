import { isAxiosError } from 'axios';
import { httpClient } from '@/clients/http-client';
import type { ApiResponse } from '@/types/services-response';
import type { Contact, CreateContact } from '@/types/contact';

export const contactService = {
  async list(signal?: AbortSignal) {
    const response = await httpClient.get<ApiResponse<Contact[]>>('/contacts', { signal, timeout: 8000 });
    return response.data.result;
  },

  async create(data: CreateContact) {
    const response = await httpClient.post<ApiResponse<Contact>>('/contacts', data);
    return response.data.result;
  },

  async update(id: string, name: string | null) {
    const response = await httpClient.patch<ApiResponse<Contact>>(`/contacts/${id}`, { name });
    return response.data.result;
  },

  async remove(id: string) {
    await httpClient.delete(`/contacts/${id}`);
  },
};

export function contactErrorMessage(error: unknown, fallback: string) {
  if (!isAxiosError<{ error?: { message?: string } }>(error)) return fallback;

  switch (error.response?.data?.error?.message) {
    case 'CANNOT_ADD_SELF':
      return 'No puedes agregarte a tus propios contactos.';
    case 'USER_NOT_FOUND':
      return 'No encontramos ese usuario.';
    case 'PRIVATE_CONVERSATION_NOT_FOUND':
      return 'Esta conversación ya no está disponible.';
    case 'CONTACT_NOT_FOUND':
      return 'Este contacto ya no está disponible.';
    default:
      return fallback;
  }
}
