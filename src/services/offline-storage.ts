const prefix = 'messinger:offline:v1:';

export const offlineStorage = {
  read<T>(key: string): T | undefined {
    try {
      const value = localStorage.getItem(prefix + key);
      return value === null ? undefined : (JSON.parse(value) as T);
    } catch {
      return undefined;
    }
  },

  write(key: string, value: unknown) {
    try {
      localStorage.setItem(prefix + key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable or full; keep the in-memory data usable.
    }
  },

  remove(key: string) {
    try {
      localStorage.removeItem(prefix + key);
    } catch {
      // Storage can be unavailable.
    }
  },
};
