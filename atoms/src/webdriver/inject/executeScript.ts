import * as inject from '../../core/inject.js';

/** A serialized window reference, as used across the WebDriver wire protocol. */
export interface JsonWindow {
  WINDOW: string;
}

/**
 * Decodes a serialized `{WINDOW: string}` object using the current document's element cache.
 * @return If `win` is undefined, trivially returns the current window.
 * @throws If the serialized window cannot be found in the current document's cache.
 */
export function getWindow(win?: JsonWindow): Window {
  if (win) {
    return inject.getElement(win.WINDOW) as Window;
  }
  return window;
}

/** Wrapper allowing a serialized window object to be passed to `executeScript`. */
export function executeScript(fn: string | Function, args: unknown[], win?: JsonWindow): string {
  return inject.executeScript(fn, args, true, getWindow(win)) as string;
}

/** Wrapper allowing a serialized window object to be passed to `executeAsyncScript`. */
export function executeAsyncScript(
  fn: string | Function,
  args: unknown[],
  timeout: number,
  onDone: (result: string | inject.ResponseObject) => void,
  win?: JsonWindow,
): void {
  inject.executeAsyncScript(fn, args, timeout, onDone, true, getWindow(win));
}
