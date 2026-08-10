import {BotError, ErrorCode} from '../error.js';

/**
 * Finds an element using a CSS selector.
 */
export function single(target: string, root: Document | Element): Element | null {
  if (!target) {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'No selector specified');
  }

  target = target.trim();

  let element: Element | null;
  try {
    element = root.querySelector(target);
  } catch {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'An invalid or illegal selector was specified');
  }

  return element && element.nodeType === Node.ELEMENT_NODE ? element : null;
}

/**
 * Finds all elements matching a CSS selector.
 */
export function many(target: string, root: Document | Element): NodeListOf<Element> {
  if (!target) {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'No selector specified');
  }

  target = target.trim();

  try {
    return root.querySelectorAll(target);
  } catch {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'An invalid or illegal selector was specified');
  }
}
