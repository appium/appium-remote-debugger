import * as storageLocal from '../storage/local.js';
import {executeScript} from './execute-script.js';

/** Injects and runs `storageLocal.setItem` in the page context. */
export function setItem(key: string, value: unknown): string {
  return executeScript(storageLocal.setItem, [key, value]);
}

/** Injects and runs `storageLocal.getItem` in the page context. */
export function getItem(key: string): string {
  return executeScript(storageLocal.getItem, [key]);
}

/** Injects and runs `storageLocal.keySet` in the page context. */
export function keySet(): string {
  return executeScript(storageLocal.keySet, []);
}

/** Injects and runs `storageLocal.removeItem` in the page context. */
export function removeItem(key: string): string {
  return executeScript(storageLocal.removeItem, [key]);
}

/** Injects and runs `storageLocal.clear` in the page context. */
export function clear(): string {
  return executeScript(storageLocal.clear, []);
}

/** Injects and runs `storageLocal.size` in the page context. */
export function size(): string {
  return executeScript(storageLocal.size, []);
}
