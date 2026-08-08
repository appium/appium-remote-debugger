import * as storageSession from '../storage/session.js';
import {executeScript} from './execute-script.js';

/** Injects and runs `storageSession.setItem` in the page context. */
export function setItem(key: string, value: unknown): string {
  return executeScript(storageSession.setItem, [key, value]);
}

/** Injects and runs `storageSession.getItem` in the page context. */
export function getItem(key: string): string {
  return executeScript(storageSession.getItem, [key]);
}

/** Injects and runs `storageSession.keySet` in the page context. */
export function keySet(): string {
  return executeScript(storageSession.keySet, []);
}

/** Injects and runs `storageSession.removeItem` in the page context. */
export function removeItem(key: string): string {
  return executeScript(storageSession.removeItem, [key]);
}

/** Injects and runs `storageSession.clear` in the page context. */
export function clear(): string {
  return executeScript(storageSession.clear, []);
}

/** Injects and runs `storageSession.size` in the page context. */
export function size(): string {
  return executeScript(storageSession.size, []);
}
