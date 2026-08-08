import {getAttribute} from '../domCore.js';

/**
 * Finds an element by the value of its `name` attribute.
 */
export function single(target: string, root: Document | Element): Element | null {
  for (const element of root.getElementsByTagName('*')) {
    if (getAttribute(element, 'name') === target) {
      return element;
    }
  }
  return null;
}

/**
 * Finds all elements by the value of their `name` attribute.
 */
export function many(target: string, root: Document | Element): Element[] {
  return [...root.getElementsByTagName('*')].filter((element) => getAttribute(element, 'name') === target);
}
