import {BotError, ErrorCode} from '../error.js';
import * as className from './class-name.js';
import * as css from './css.js';
import * as id from './id.js';
import {linkText, partialLinkText} from './link-text.js';
import * as name from './name.js';
import * as relative from './relative.js';
import * as tagName from './tag-name.js';
import * as xpath from './xpath.js';

interface Strategy {
  single: (target: string, root: Document | Element) => Element | null;
  many: (target: string, root: Document | Element) => ArrayLike<Element>;
}

/**
 * Known element location strategies. Synonyms with spaces are specified at:
 * https://github.com/SeleniumHQ/selenium/wiki/JsonWireProtocol
 */
const STRATEGIES: Record<string, Strategy> = {
  className: className,
  'class name': className,

  css: css,
  'css selector': css,

  relative: relative as unknown as Strategy,

  id: id,

  linkText: linkText,
  'link text': linkText,

  name: name,

  partialLinkText: partialLinkText,
  'partial link text': partialLinkText,

  tagName: tagName,
  'tag name': tagName,

  xpath: xpath,
};

/** Adds or overrides an existing strategy for locating elements. */
export function add(strategyName: string, strategy: Strategy): void {
  STRATEGIES[strategyName] = strategy;
}

/**
 * Finds the first element in the DOM matching the target. The target object should have a single
 * key, the name of which determines the locator strategy and the value of which gives the value
 * to search for — e.g. `{id: 'foo'}` finds the first element with id "foo".
 */
export function findElement(target: Record<string, unknown>, root: Document | Element = document): Element | null {
  const key = getOnlyKey(target);

  if (key) {
    const strategy = STRATEGIES[key];
    if (strategy && typeof strategy.single === 'function') {
      return strategy.single(target[key] as string, root);
    }
  }
  throw new BotError(ErrorCode.INVALID_ARGUMENT, `Unsupported locator strategy: ${key}`);
}

/**
 * Finds all elements in the DOM matching the target — e.g. `{name: 'foo'}` finds every element
 * with a `name` attribute of "foo".
 */
export function findElements(target: Record<string, unknown>, root: Document | Element = document): ArrayLike<Element> {
  const key = getOnlyKey(target);

  if (key) {
    const strategy = STRATEGIES[key];
    if (strategy && typeof strategy.many === 'function') {
      return strategy.many(target[key] as string, root);
    }
  }
  throw new BotError(ErrorCode.INVALID_ARGUMENT, `Unsupported locator strategy: ${key}`);
}

/**
 * Returns one key from the object that is not present in Object.prototype, if any exists.
 */
function getOnlyKey(target: Record<string, unknown>): string | null {
  for (const k in target) {
    if (Object.hasOwn(target, k)) {
      return k;
    }
  }
  return null;
}
