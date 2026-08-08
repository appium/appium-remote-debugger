import * as storageSession from '../storage/session.js';
import {executeScript} from './executeScript.js';

export function setItem(key: string, value: unknown): string {
  return executeScript(storageSession.setItem, [key, value]);
}

export function getItem(key: string): string {
  return executeScript(storageSession.getItem, [key]);
}

export function keySet(): string {
  return executeScript(storageSession.keySet, []);
}

export function removeItem(key: string): string {
  return executeScript(storageSession.removeItem, [key]);
}

export function clear(): string {
  return executeScript(storageSession.clear, []);
}

export function size(): string {
  return executeScript(storageSession.size, []);
}
