import {
  attachmentSession,
  readCachedAttachment,
  removeExpiredAttachments,
  writeCachedAttachment,
} from './attachment-storage';
import { fileService } from './files';

const transfers = new Map<AbortSignal, Map<string, Promise<Blob>>>();
const transferSlots: (() => void)[] = [];
const maxTransfers = 3;
const responseTimeout = 90_000;
let activeTransfers = 0;

async function downloadAttachment(attachmentId: string, contentType: string, session: AbortSignal) {
  if (activeTransfers >= maxTransfers) {
    await new Promise<void>((resolve) => transferSlots.push(resolve));
  } else {
    activeTransfers++;
  }

  const controller = new AbortController();
  const signal = controller.signal;
  function abort() {
    controller.abort();
  }
  session.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, responseTimeout);
  const mime = contentType.split(';', 1)[0].trim().toLowerCase();
  const type = mime === 'audio/m4a' || mime === 'audio/x-m4a' ? 'audio/mp4' : mime;
  try {
    session.throwIfAborted();
    if (navigator.onLine === false)
      throw new Error('El archivo aún no está disponible sin conexión.');
    let blob: Blob;
    try {
      const { url } = await fileService.downloadFile({ attachmentId }, signal);
      const response = await fetch(url, { signal, credentials: 'omit' });
      clearTimeout(timeout);
      if (!response.ok || response.status === 206)
        throw new Error('No se pudo descargar el archivo.');
      blob = await response.blob();
      if (!blob.size) throw new Error('El archivo está vacío.');
    } catch (error) {
      if (!type.startsWith('audio/') || signal.aborted) throw error;
      const bytes = await fileService.downloadAudioBytes(attachmentId, signal);
      if (!bytes.byteLength) throw new Error('El archivo de audio está vacío.', { cause: error });
      blob = new Blob([bytes]);
    }
    return blob.type === type || !type ? blob : blob.slice(0, blob.size, type);
  } finally {
    clearTimeout(timeout);
    session.removeEventListener('abort', abort);
    const next = transferSlots.shift();
    if (next) next();
    else activeTransfers--;
  }
}

export function loadAttachment(accountId: string, attachmentId: string, contentType: string) {
  const session = attachmentSession(accountId);
  let pending = transfers.get(session);
  if (!pending) {
    pending = new Map();
    transfers.set(session, pending);
  }
  const existing = pending.get(attachmentId);
  if (existing) return existing;

  const requests = pending;
  const task = (async () => {
    const cached = await readCachedAttachment(accountId, attachmentId).catch(() => undefined);
    session.throwIfAborted();
    if (cached) return cached;

    const blob = await downloadAttachment(attachmentId, contentType, session);
    session.throwIfAborted();
    try {
      await writeCachedAttachment(accountId, attachmentId, blob, session);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        // Reclaim expired files before falling back to a temporary in-memory copy.
        await removeExpiredAttachments().catch(() => {});
        await writeCachedAttachment(accountId, attachmentId, blob, session).catch(() => {});
      }
    }
    session.throwIfAborted();
    return blob;
  })().finally(() => {
    requests.delete(attachmentId);
    if (!requests.size) transfers.delete(session);
  });
  requests.set(attachmentId, task);
  return task;
}
