import {getLocalStorage} from '../../core/html5/storage.js';

/** Sets a key/value pair in local storage. */
export function setItem(key: string, value: unknown): void {
  getLocalStorage().setItem(key, value);
}

/** Returns the value stored under `key` in local storage, or `null` if not present. */
export function getItem(key: string): string | null {
  return getLocalStorage().getItem(key);
}

/** Returns the list of all keys currently stored in local storage. */
export function keySet(): string[] {
  return getLocalStorage().keySet();
}

/** Removes the entry stored under `key` from local storage, returning its previous value. */
export function removeItem(key: string): string | null {
  return getLocalStorage().removeItem(key);
}

/** Removes all entries from local storage. */
export function clear(): void {
  getLocalStorage().clear();
}

/** Returns the number of entries stored in local storage. */
export function size(): number {
  return getLocalStorage().size();
}

/** Returns the key at the given index in local storage, or `null` if out of range. */
export function key(index: number): string | null {
  return getLocalStorage().key(index);
}
