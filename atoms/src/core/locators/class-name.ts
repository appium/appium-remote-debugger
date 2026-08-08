import {BotError, ErrorCode} from '../error.js';

/**
 * Finds an element by (a single, non-compound) class name.
 */
export function single(target: string, root: Document | Element): Element | null {
  if (!target) {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'No class name specified');
  }

  target = target.trim();
  if (target.includes(' ')) {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'Compound class names not permitted');
  }

  try {
    // A '.' inside a class name must be escaped for use in a CSS selector.
    return root.querySelector(`.${target.replace(/\./g, '\\.')}`) || null;
  } catch {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'An invalid or illegal class name was specified');
  }
}

/**
 * Finds all elements with (a single, non-compound) class name.
 */
export function many(target: string, root: Document | Element): NodeListOf<Element> {
  if (!target) {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'No class name specified');
  }

  target = target.trim();
  if (target.includes(' ')) {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'Compound class names not permitted');
  }

  try {
    return root.querySelectorAll(`.${target.replace(/\./g, '\\.')}`);
  } catch {
    throw new BotError(ErrorCode.INVALID_SELECTOR_ERROR, 'An invalid or illegal class name was specified');
  }
}
