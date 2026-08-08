import {isElement} from './dom-core.js';
import {BotError, ErrorCode} from './error.js';
import * as idLocator from './locators/id.js';

/** Returns the top window of the current window hierarchy. */
export function defaultContent(): Window {
  return window.top as Window;
}

/** Returns the currently focused element on the page, or the body if none is focused. */
export function activeElement(): Element {
  return document.activeElement || document.body;
}

/** Returns the parent window of the given window, or of the current window if none is given. */
export function parentFrame(root: Window = window): Window {
  return root.parent;
}

/**
 * Returns a reference to the window object corresponding to the given element. The element must
 * be a frame or an iframe.
 */
export function getFrameWindow(element: HTMLFrameElement | HTMLIFrameElement): Window {
  if (isFrame(element)) {
    const win = getFrameContentWindow(element);
    if (win) {
      return win;
    }
  }
  throw new BotError(ErrorCode.NO_SUCH_FRAME, "The given element isn't a frame or an iframe.");
}

/**
 * Looks for a frame by its name or id (preferring name over id) under the given root. If no frame
 * was found, looks for an iframe by name or id.
 */
export function findFrameByNameOrId(nameOrId: string | number, root: Window = window): Window | null {
  // Lookup frame by name.
  const numFrames = root.frames.length;
  for (let i = 0; i < numFrames; i++) {
    const frame = root.frames[i];
    const frameElement = (frame as unknown as {frameElement?: Element}).frameElement || (frame as unknown as Window);
    if ((frameElement as unknown as {name?: unknown}).name === nameOrId) {
      // Safari can return an HTMLFrameElement here instead of a Window object.
      if ((frame as Window).document) {
        return frame;
      }
      return getFrameContentWindow(frameElement as HTMLFrameElement | HTMLIFrameElement);
    }
  }

  // Lookup frame by id.
  const elements = idLocator.many(String(nameOrId), root.document);
  for (const frameElement of elements) {
    if (frameElement && isFrame(frameElement)) {
      return getFrameContentWindow(frameElement as unknown as HTMLFrameElement | HTMLIFrameElement);
    }
  }
  return null;
}

/**
 * Looks for a frame by its index under the given root.
 */
export function findFrameByIndex(index: number, root: Window = window): Window | null {
  return root.frames[index] || null;
}

/**
 * Gets the index of a frame in the given window. The element must be a frame or an iframe.
 */
export function getFrameIndex(element: HTMLFrameElement | HTMLIFrameElement, root: Window = window): number | null {
  let elementWindow: Window | null;
  try {
    elementWindow = element.contentWindow;
  } catch {
    return null;
  }

  if (!isFrame(element)) {
    return null;
  }

  for (let i = 0; i < root.frames.length; i++) {
    if (elementWindow === root.frames[i]) {
      return i;
    }
  }
  return null;
}

function isFrame(element: Element): boolean {
  return isElement(element, 'FRAME') || isElement(element, 'IFRAME');
}

function getFrameContentWindow(frame: HTMLFrameElement | HTMLIFrameElement): Window | null {
  try {
    if (frame.contentWindow) {
      return frame.contentWindow;
    }
    return frame.contentDocument ? frame.contentDocument.defaultView : null;
  } catch {
    return null;
  }
}
