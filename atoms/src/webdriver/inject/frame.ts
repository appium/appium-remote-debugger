import * as frame from '../../core/frame.js';
import {executeScript} from './execute-script.js';

/** Finds a frame by id or name. */
export function findFrameByIdOrName(idOrName: string, root?: Window): string {
  return executeScript(frame.findFrameByNameOrId, [idOrName, root]);
}

/** Returns the currently active element. */
export function activeElement(): string {
  return executeScript(frame.activeElement, []);
}

/** Finds the parent frame of the given frame. */
export function parentFrame(root?: Window): string {
  return executeScript(frame.parentFrame, [root]);
}

/** Finds a frame by index. */
export function findFrameByIndex(index: number, root?: Window): string {
  return executeScript(frame.findFrameByIndex, [index, root]);
}

/** Returns the default content of the current page — the top window. */
export function defaultContent(): string {
  return executeScript(frame.defaultContent, []);
}

/** Returns the window corresponding to the given frame element. */
export function getFrameWindow(element: unknown): string {
  return executeScript(frame.getFrameWindow, [element]);
}
