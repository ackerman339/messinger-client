export const attachmentLifetime = 72 * 60 * 60 * 1000;

type AttachmentRecord = {
  accountId: string;
  attachmentId: string;
  blob: Blob;
  expiresAt: number;
};

let database: Promise<IDBDatabase> | undefined;
const sessions = new Map<string, AbortController>();

export function attachmentSession(accountId: string) {
  let session = sessions.get(accountId);
  if (!session) {
    session = new AbortController();
    sessions.set(accountId, session);
  }
  return session.signal;
}

function openDatabase() {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('messinger-attachments', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('attachments', {
        keyPath: ['accountId', 'attachmentId'],
      });
      store.createIndex('expiresAt', 'expiresAt');
      store.createIndex('accountId', 'accountId');
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

async function transact<T>(run: (store: IDBObjectStore, result: (value: T) => void) => void) {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction('attachments', 'readwrite');
    let value: T;
    run(transaction.objectStore('attachments'), (result) => {
      value = result;
    });
    transaction.oncomplete = () => resolve(value);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function readCachedAttachment(accountId: string, attachmentId: string) {
  return transact<Blob | undefined>((store, result) => {
    const key = [accountId, attachmentId];
    const request = store.get(key);
    request.onsuccess = () => {
      const record = request.result as AttachmentRecord | undefined;
      if (!record) return result(undefined);
      if (record.expiresAt <= Date.now()) {
        store.delete(key);
        return result(undefined);
      }
      result(record.blob);
    };
  });
}

export function writeCachedAttachment(
  accountId: string,
  attachmentId: string,
  blob: Blob,
  session: AbortSignal,
) {
  return transact<void>((store) => {
    session.throwIfAborted();
    store.put({ accountId, attachmentId, blob, expiresAt: Date.now() + attachmentLifetime });
  });
}

function removeMatching(index: 'expiresAt' | 'accountId', range: IDBKeyRange) {
  return transact<void>((store) => {
    const request = store.index(index).openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
  });
}

export async function removeExpiredAttachments() {
  await removeMatching('expiresAt', IDBKeyRange.upperBound(Date.now()));
}

export function clearAttachmentAccount(accountId: string) {
  sessions.get(accountId)?.abort();
  sessions.delete(accountId);
  if (typeof indexedDB !== 'undefined') {
    void removeMatching('accountId', IDBKeyRange.only(accountId)).catch(() => {});
  }
}
