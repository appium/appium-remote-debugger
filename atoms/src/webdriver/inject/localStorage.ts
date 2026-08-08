import * as storageLocal from '../storage/local.js';
import {executeScript} from './executeScript.js';

export function setItem(key: string, value: unknown): string {
  return executeScript(storageLocal.setItem, [key, value]);
}

export function getItem(key: string): string {
  return executeScript(storageLocal.getItem, [key]);
}

export function keySet(): string {
  return executeScript(storageLocal.keySet, []);
}

export function removeItem(key: string): string {
  return executeScript(storageLocal.removeItem, [key]);
}

export function clear(): string {
  return executeScript(storageLocal.clear, []);
}

export function size(): string {
  return executeScript(storageLocal.size, []);
}
