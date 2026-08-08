import {getSessionStorage} from '../../core/html5/storage.js';

export function setItem(key: string, value: unknown): void {
  getSessionStorage().setItem(key, value);
}

export function getItem(key: string): string | null {
  return getSessionStorage().getItem(key);
}

export function keySet(): string[] {
  return getSessionStorage().keySet();
}

export function removeItem(key: string): string | null {
  return getSessionStorage().removeItem(key);
}

export function clear(): void {
  getSessionStorage().clear();
}

export function size(): number {
  return getSessionStorage().size();
}

export function key(index: number): string | null {
  return getSessionStorage().key(index);
}
