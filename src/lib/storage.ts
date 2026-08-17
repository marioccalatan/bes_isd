// Thin localStorage persistence layer for the BES prototype.
// All application state is namespaced under `bes:` keys so it can be
// selectively inspected, migrated, or wiped by the Demo Data Reset tool.

const PREFIX = 'bes:';
export const STORAGE_VERSION = '1.0.0';

export function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

export function loadState<T>(key: string, fallbackFactory: () => T): T {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (raw == null) {
      const fallback = fallbackFactory();
      saveState(key, fallback);
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    const fallback = fallbackFactory();
    saveState(key, fallback);
    return fallback;
  }
}

export function saveState<T>(key: string, value: T): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // Storage full or unavailable — fail silently in prototype context.
  }
}

export function removeState(key: string): void {
  localStorage.removeItem(storageKey(key));
}

export function clearAllBesData(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

export function listBesKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  return keys;
}
