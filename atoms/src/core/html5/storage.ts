import {BotError, ErrorCode} from '../error.js';

/**
 * A thin wrapper around an HTML5 web storage object (`localStorage`/`sessionStorage`).
 */
export class WebStorage {
  private readonly storageMap: Storage;

  constructor(storageMap: Storage) {
    this.storageMap = storageMap;
  }

  /**
   * Sets the value item of a key/value pair. If the value given is null, the string 'null' will
   * be inserted instead.
   */
  setItem(key: string, value: unknown): void {
    try {
      this.storageMap.setItem(key, `${value}`);
    } catch (e) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, (e as Error).message);
    }
  }

  getItem(key: string): string | null {
    return this.storageMap.getItem(key);
  }

  keySet(): string[] {
    const keys: string[] = [];
    const length = this.size();
    for (let i = 0; i < length; i++) {
      keys[i] = this.storageMap.key(i) as string;
    }
    return keys;
  }

  removeItem(key: string): string | null {
    const value = this.getItem(key);
    this.storageMap.removeItem(key);
    return value;
  }

  clear(): void {
    this.storageMap.clear();
  }

  size(): number {
    return this.storageMap.length;
  }

  key(index: number): string | null {
    return this.storageMap.key(index);
  }
}

export function getLocalStorage(win: Window = window): WebStorage {
  if (win.localStorage == null) {
    throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Local storage undefined');
  }
  return new WebStorage(win.localStorage);
}

export function getSessionStorage(win: Window = window): WebStorage {
  if (win.sessionStorage?.clear != null) {
    return new WebStorage(win.sessionStorage);
  }
  throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Session storage undefined');
}
