import type { OutboxEntry } from './message-sync';

const prefixFor = (account: string) => `messinger:outbox:${account}:`;

export const newMessageId = () => crypto.randomUUID();

export const outboxStorage = {
  load(account: string): OutboxEntry[] {
    const prefix = prefixFor(account);
    const entries: OutboxEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const value = localStorage.getItem(key);
      if (!value) continue;
      try {
        entries.push(JSON.parse(value));
      } catch (error) {
        console.error('[messages] entrada local ilegible', error);
      }
    }
    return entries;
  },
  save(account: string, entry: OutboxEntry) {
    localStorage.setItem(prefixFor(account) + entry.id, JSON.stringify(entry));
  },
  fail(account: string, entry: OutboxEntry) {
    this.save(account, entry);
  },
  remove(account: string, id: string) {
    localStorage.removeItem(prefixFor(account) + id);
  },
};
