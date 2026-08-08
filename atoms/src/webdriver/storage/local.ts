import {getLocalStorage} from '../../core/html5/storage.js';

export function setItem(key: string, value: unknown): void {
  getLocalStorage().setItem(key, value);
}

export function getItem(key: string): string | null {
  return getLocalStorage().getItem(key);
}

export function keySet(): string[] {
  return getLocalStorage().keySet();
}

export function removeItem(key: string): string | null {
  return getLocalStorage().removeItem(key);
}

export function clear(): void {
  getLocalStorage().clear();
}

export function size(): number {
  return getLocalStorage().size();
}

export function key(index: number): string | null {
  return getLocalStorage().key(index);
}
