import * as inject from '../../core/inject.js';
import {findElement as domFindElement, findElements as domFindElements} from '../../core/locators/index.js';
import {getWindow, type JsonWindow} from './execute-script.js';

interface JsonElementRef {
  ELEMENT: string;
}

/** Finds an element by using the given lookup strategy. */
export function findElement(strategy: string, using: string, root?: JsonElementRef | null, win?: JsonWindow): string {
  return performSearch(strategy, using, domFindElement, root, win);
}

/** Finds all elements by using the given lookup strategy. */
export function findElements(strategy: string, using: string, root?: JsonElementRef | null, win?: JsonWindow): string {
  return performSearch(strategy, using, domFindElements, root, win);
}

function performSearch(
  strategy: string,
  target: string,
  searchFn: (locator: Record<string, unknown>, root: Document | Element) => Element | null | ArrayLike<Element>,
  root?: JsonElementRef | null,
  win?: JsonWindow,
): string {
  const locator: Record<string, unknown> = {[strategy]: target};

  let response: inject.ResponseObject;
  try {
    // Step 1: find the window we are locating the element in.
    const targetWindow = getWindow(win);

    // Step 2: decode the root of our search.
    const searchRoot = root ? (inject.unwrapValue(root, targetWindow.document) as Element) : targetWindow.document;

    // Step 3: perform the search.
    const found = searchFn(locator, searchRoot);

    // Step 4: encode our response.
    response = inject.wrapResponse(found);
  } catch (ex) {
    response = inject.wrapError(ex as Error);
  }
  return JSON.stringify(response);
}
