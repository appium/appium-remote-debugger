import {BotError, ErrorCode} from '../error.js';

/**
 * Finds an element by its tag name.
 */
export function single(target: string, root: Document | Element): Element | null {
  if (target === '') {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'Unable to locate an element with the tagName ""');
  }
  return root.getElementsByTagName(target)[0] || null;
}

/**
 * Finds all elements with a given tag name.
 */
export function many(target: string, root: Document | Element): HTMLCollectionOf<Element> {
  if (target === '') {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'Unable to locate an element with the tagName ""');
  }
  return root.getElementsByTagName(target);
}
