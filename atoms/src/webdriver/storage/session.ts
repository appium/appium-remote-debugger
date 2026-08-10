import {getSessionStorage} from '../../core/html5/storage.js';

/** Sets a key/value pair in session storage. */
export function setItem(key: string, value: unknown): void {
  getSessionStorage().setItem(key, value);
}

/** Returns the value stored under `key` in session storage, or `null` if not present. */
export function getItem(key: string): string | null {
  return getSessionStorage().getItem(key);
}

/** Returns the list of all keys currently stored in session storage. */
export function keySet(): string[] {
  return getSessionStorage().keySet();
}

/** Removes the entry stored under `key` from session storage, returning its previous value. */
export function removeItem(key: string): string | null {
  return getSessionStorage().removeItem(key);
}

/** Removes all entries from session storage. */
export function clear(): void {
  getSessionStorage().clear();
}

/** Returns the number of entries stored in session storage. */
export function size(): number {
  return getSessionStorage().size();
}

/** Returns the key at the given index in session storage, or `null` if out of range. */
export function key(index: number): string | null {
  return getSessionStorage().key(index);
}
