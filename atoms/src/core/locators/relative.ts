import {getClientRect, isElement} from '../dom.js';
import {BotError, ErrorCode} from '../error.js';
import {Rect} from '../types.js';
import {findElement, findElements} from './index.js';

type Selector = Element | (() => Selector) | Record<string, unknown>;
type Filter = (element: Element) => boolean;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FilterFactory = (...args: any[]) => Filter;

const FILTER_STRATEGIES: Record<string, FilterFactory> = {
  above,
  below,
  left: leftOf,
  near,
  right: rightOf,
  straightAbove,
  straightBelow,
  straightLeft: straightLeftOf,
  straightRight: straightRightOf,
};

const RESOLVERS: Record<string, (...args: unknown[]) => Element> = {
  above: resolve as (...args: unknown[]) => Element,
  below: resolve as (...args: unknown[]) => Element,
  left: resolve as (...args: unknown[]) => Element,
  near: resolve as (...args: unknown[]) => Element,
  right: resolve as (...args: unknown[]) => Element,
  straightAbove: resolve as (...args: unknown[]) => Element,
  straightBelow: resolve as (...args: unknown[]) => Element,
  straightLeft: resolve as (...args: unknown[]) => Element,
  straightRight: resolve as (...args: unknown[]) => Element,
};

interface FilterSpec {
  kind: string;
  args: unknown[];
}

/** Finds an element by using a relative locator. `root` is accepted for interface parity but ignored. */
export function single(target: {root: unknown; filters: FilterSpec[]}, _root?: Document | Element): Element | null {
  const matches = many(target, _root);
  return matches.length === 0 ? null : matches[0];
}

/** Finds elements by using a relative locator. `root` is accepted for interface parity but ignored. */
export function many(target: {root?: unknown; filters?: FilterSpec[]}, root?: Document | Element): Element[] {
  if (!Object.hasOwn(target, 'root') || !Object.hasOwn(target, 'filters')) {
    throw new BotError(
      ErrorCode.INVALID_ARGUMENT,
      `Locator not suitable for relative locators: ${JSON.stringify(target)}`,
    );
  }
  if (!Array.isArray(target.filters)) {
    throw new BotError(ErrorCode.INVALID_ARGUMENT, `Targets should be an array: ${JSON.stringify(target)}`);
  }

  let elements: ArrayLike<Element>;
  if (isElement(target.root as Node)) {
    elements = [target.root as Element];
  } else {
    elements = findElements(target.root as Record<string, unknown>, root);
  }

  if (elements.length === 0) {
    return [];
  }

  return filterElements(elements, target.filters);
}

function proximity(selector: Selector, matches: (expected: Rect, toFind: Rect) => boolean): Filter {
  return (compareTo: Element): boolean => {
    const element = resolve(selector);

    const rect1 = getClientRect(element);
    const rect2 = getClientRect(compareTo);

    return matches(rect1, rect2);
  };
}

/**
 * Finds elements above the expected one: where the bottom of the element found by `selector` is
 * above the top of the element being compared to.
 */
function above(selector: Selector): Filter {
  return proximity(selector, (expected, toFind) => toFind.top + toFind.height <= expected.top);
}

/**
 * Finds elements below the expected one: where the top of the element found by `selector` is
 * below the bottom of the element being compared to.
 */
function below(selector: Selector): Filter {
  return proximity(selector, (expected, toFind) => toFind.top >= expected.top + expected.height);
}

/** Finds elements to the left of the expected one. */
function leftOf(selector: Selector): Filter {
  return proximity(selector, (expected, toFind) => toFind.left + toFind.width <= expected.left);
}

/** Finds elements to the right of the expected one. */
function rightOf(selector: Selector): Filter {
  return proximity(selector, (expected, toFind) => toFind.left >= expected.left + expected.width);
}

/** Finds elements directly (column-aligned) above the expected one. */
function straightAbove(selector: Selector): Filter {
  return proximity(
    selector,
    (expected, toFind) =>
      toFind.left < expected.left + expected.width &&
      toFind.left + toFind.width > expected.left &&
      toFind.top + toFind.height <= expected.top,
  );
}

/** Finds elements directly (column-aligned) below the expected one. */
function straightBelow(selector: Selector): Filter {
  return proximity(
    selector,
    (expected, toFind) =>
      toFind.left < expected.left + expected.width &&
      toFind.left + toFind.width > expected.left &&
      toFind.top >= expected.top + expected.height,
  );
}

/** Finds elements directly (row-aligned) to the left of the expected one. */
function straightLeftOf(selector: Selector): Filter {
  return proximity(
    selector,
    (expected, toFind) =>
      toFind.top < expected.top + expected.height &&
      toFind.top + toFind.height > expected.top &&
      toFind.left + toFind.width <= expected.left,
  );
}

/** Finds elements directly (row-aligned) to the right of the expected one. */
function straightRightOf(selector: Selector): Filter {
  return proximity(
    selector,
    (expected, toFind) =>
      toFind.top < expected.top + expected.height &&
      toFind.top + toFind.height > expected.top &&
      toFind.left >= expected.left + expected.width,
  );
}

/**
 * Finds elements within (by default) 50 pixels of the selected element. An element is not near
 * itself.
 */
function near(selector: Selector, optDistance?: number): Filter {
  let distance: number | undefined = optDistance;
  if (!distance && typeof (selector as Record<string, unknown>).distance === 'number') {
    distance = (selector as Record<string, unknown>).distance as number;
  }
  if (!distance) {
    distance = 50;
  }
  const dist = distance;

  return (compareTo: Element): boolean => {
    const element = resolve(selector);

    if (element === compareTo) {
      return false;
    }

    const rect1 = getClientRect(element);
    const rect2 = getClientRect(compareTo);

    const rect1Bigger = new Rect(rect1.left - dist, rect1.top - dist, rect1.width + dist * 2, rect1.height + dist * 2);

    return rect1Bigger.intersects(rect2);
  };
}

function resolve(selector: Selector): Element {
  if (isElement(selector as Node)) {
    return selector as Element;
  }

  if (typeof selector === 'function') {
    return resolve(selector());
  }

  if ((typeof selector === 'object' && selector !== null) || typeof selector === 'function') {
    const element = findElement(selector as Record<string, unknown>);
    if (!element) {
      throw new BotError(ErrorCode.NO_SUCH_ELEMENT, `No element has been found by ${JSON.stringify(selector)}`);
    }
    return element;
  }

  throw new BotError(ErrorCode.INVALID_ARGUMENT, `Selector is of wrong type: ${JSON.stringify(selector)}`);
}

function filterElements(allElements: ArrayLike<Element>, filters: FilterSpec[]): Element[] {
  const toReturn: Element[] = [];
  for (const element of Array.from(allElements)) {
    if (!element) {
      continue;
    }

    const include = filters.every((filter) => {
      const strategy = FILTER_STRATEGIES[filter.kind];
      if (!strategy) {
        throw new BotError(ErrorCode.INVALID_ARGUMENT, `Cannot find filter suitable for ${filter.kind}`);
      }
      const filterFunc = strategy(...(filter.args as [Selector, ...unknown[]]));
      return filterFunc(element);
    });

    if (include) {
      toReturn.push(element);
    }
  }

  // Sort the returned elements by proximity to the last "anchor" element in the filters.
  const finalFilter = filters[filters.length - 1];
  const name = finalFilter ? finalFilter.kind : 'unknown';
  const resolver = RESOLVERS[name];
  if (!resolver) {
    return toReturn;
  }
  const lastAnchor = resolver(...finalFilter.args);
  if (!lastAnchor) {
    return toReturn;
  }

  return sortByProximity(lastAnchor, toReturn);
}

function sortByProximity(anchor: Element, elements: Element[]): Element[] {
  const anchorRect = getClientRect(anchor);
  const anchorCenter = {
    x: anchorRect.left + Math.max(1, anchorRect.width) / 2,
    y: anchorRect.top + Math.max(1, anchorRect.height) / 2,
  };

  function distance(e: Element): number {
    const rect = getClientRect(e);
    const center = {
      x: rect.left + Math.max(1, rect.width) / 2,
      y: rect.top + Math.max(1, rect.height) / 2,
    };

    const x = Math.pow(anchorCenter.x - center.x, 2);
    const y = Math.pow(anchorCenter.y - center.y, 2);

    return Math.sqrt(x + y);
  }

  return [...elements].sort((left, right) => distance(left) - distance(right));
}
