import {BotError, ErrorCode, stateForCode} from './error.js';

/** Key used to identify DOM elements in the WebDriver wire protocol. */
export const ELEMENT_KEY = 'ELEMENT';

/** Key used to identify DOM elements in the W3C WebDriver wire protocol. */
export const W3C_ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

/** Key used to identify Window objects in the WebDriver wire protocol. */
export const WINDOW_KEY = 'WINDOW';

/**
 * Converts a value to a JSON-friendly value so it can be stringified for transmission:
 *  - booleans, numbers, strings, and null are returned as-is
 *  - undefined values become null
 *  - functions become their source string
 *  - each element of an array is recursively processed
 *  - DOM elements/documents are wrapped as WebDriver element handles
 *  - Windows are wrapped as WebDriver window handles
 *  - all other objects are treated as hash-maps, recursively processed for string/number keys
 */
export function wrapValue(value: unknown): unknown {
  function wrap(value: unknown, seen: object[]): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    switch (typeof value) {
      case 'string':
      case 'number':
      case 'boolean':
        return value;

      case 'function':
        return value.toString();

      case 'object':
        break;

      default:
        return null;
    }

    const obj = value as Record<string, unknown>;

    if (seen.includes(obj)) {
      throw new BotError(ErrorCode.JAVASCRIPT_ERROR, 'Recursive object cannot be transferred');
    }

    // Sniff out DOM elements/documents via duck-typing rather than instanceof, since instanceof
    // may not always work (e.g. a value from another window/realm).
    if ('nodeType' in obj && (obj.nodeType === Node.ELEMENT_NODE || obj.nodeType === Node.DOCUMENT_NODE)) {
      const elementKey = addElement(obj as unknown as Element);
      return {[ELEMENT_KEY]: elementKey, [W3C_ELEMENT_KEY]: elementKey};
    }

    // Sniff out a Window.
    if ('document' in obj) {
      return {[WINDOW_KEY]: addElement(obj as unknown as Window)};
    }

    if (Array.isArray(value)) {
      return value.map((v) => wrap(v, seen));
    }

    seen = [...seen, obj];
    if (isArrayLike(value)) {
      return Array.from(value as ArrayLike<unknown>).map((v) => wrap(v, seen));
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[key] = wrap(obj[key], seen);
    }
    return result;
  }

  return wrap(value, []);
}

/**
 * Unwraps any DOM elements encoded in the given value.
 */
export function unwrapValue(value: unknown, doc?: Document): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => unwrapValue(v, doc));
  }

  if (isPlainObjectLike(value)) {
    if (typeof value === 'function') {
      return value;
    }

    const obj = value as Record<string, unknown>;
    if (ELEMENT_KEY in obj) {
      return getElement(obj[ELEMENT_KEY] as string, doc);
    }
    if (W3C_ELEMENT_KEY in obj) {
      return getElement(obj[W3C_ELEMENT_KEY] as string, doc);
    }
    if (WINDOW_KEY in obj) {
      return getElement(obj[WINDOW_KEY] as string, doc);
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[key] = unwrapValue(obj[key], doc);
    }
    return result;
  }

  return value;
}

/** The status/value envelope used to report the result of an injected script back to the caller. */
export interface ResponseObject {
  status: ErrorCode;
  value: unknown;
}

/**
 * Wraps the response to an injected script that executed successfully, so it can be JSON-ified
 * for transmission to the process that injected the script.
 */
export function wrapResponse(value: unknown): ResponseObject {
  return {status: ErrorCode.SUCCESS, value: wrapValue(value)};
}

/**
 * Wraps a JavaScript error in an object literal so it can be JSON-ified for transmission. The
 * wrapped value carries both the legacy numeric status code and its W3C WebDriver error string
 * equivalent, so callers can consume either.
 */
export function wrapError(err: Error & {code?: ErrorCode}): ResponseObject {
  const code = 'code' in err && typeof err.code === 'number' ? err.code : ErrorCode.UNKNOWN_ERROR;
  return {
    status: code,
    value: {
      message: err.message,
      error: stateForCode(code),
    },
  };
}

/**
 * Executes an injected script. Should never be called from within JavaScript itself — used from
 * an external source injecting a script for execution.
 */
export function executeScript(
  fn: Function | string,
  args: unknown[],
  stringify?: boolean,
  win: Window = window,
): string | ResponseObject {
  let ret: ResponseObject;
  try {
    const recompiled = recompileFunction(fn, win);
    const unwrappedArgs = unwrapValue(args, win.document) as unknown[];
    ret = wrapResponse(recompiled.apply(null, unwrappedArgs));
  } catch (ex) {
    ret = wrapError(ex as Error);
  }
  return stringify ? JSON.stringify(ret) : ret;
}

/**
 * Executes an injected script expected to finish asynchronously before `timeout`. When the
 * script finishes (by invoking its supplied callback) or an error/timeout occurs, `onDone` is
 * invoked with a single {@link ResponseObject} argument (or its JSON string, if `stringify`).
 */
export function executeAsyncScript(
  fn: Function | string,
  args: unknown[],
  timeout: number,
  onDone: (result: string | ResponseObject) => void,
  stringify?: boolean,
  win: Window = window,
): void {
  let timeoutId: ReturnType<Window['setTimeout']>;
  let responseSent = false;

  function sendResponse(status: ErrorCode, value: unknown): void {
    if (responseSent) {
      return;
    }
    win.removeEventListener('unload', onunload, true);
    win.clearTimeout(timeoutId);

    let wrapped: ResponseObject;
    if (status !== ErrorCode.SUCCESS) {
      const err = value as {message?: string; stack?: string} | Error;
      const botError = new BotError(status, err.message || `${value}`);
      botError.stack = (err as Error).stack || '';
      wrapped = wrapError(botError);
    } else {
      wrapped = wrapResponse(value);
    }
    onDone(stringify ? JSON.stringify(wrapped) : wrapped);
    responseSent = true;
  }

  function onunload(): void {
    sendResponse(
      ErrorCode.UNKNOWN_ERROR,
      Error('Detected a page unload event; asynchronous script execution does not work across page loads.'),
    );
  }

  if (win.closed) {
    sendResponse(ErrorCode.UNKNOWN_ERROR, 'Unable to execute script; the target window is closed.');
    return;
  }

  const recompiled = recompileFunction(fn, win);
  const unwrappedArgs = unwrapValue(args, win.document) as unknown[];
  unwrappedArgs.push((value: unknown) => sendResponse(ErrorCode.SUCCESS, value));

  win.addEventListener('unload', onunload, true);

  const startTime = Date.now();
  try {
    recompiled.apply(win, unwrappedArgs);

    // Register the timeout *after* invoking the function, so a callback invoked synchronously
    // (or with a 0-based timeout) doesn't spuriously time out.
    timeoutId = win.setTimeout(
      () => {
        sendResponse(
          ErrorCode.SCRIPT_TIMEOUT,
          Error(`Timed out waiting for asynchronous script result after ${Date.now() - startTime} ms`),
        );
      },
      Math.max(0, timeout),
    );
  } catch (ex) {
    sendResponse((ex as {code?: ErrorCode}).code || ErrorCode.UNKNOWN_ERROR, ex);
  }
}

/** The prefix for each key stored in the cache. */
export const ELEMENT_KEY_PREFIX = ':wdc:';

/**
 * Adds an element (or Window) to its owner document's cache.
 * @return The key generated for the cached element.
 */
export function addElement(el: Element | Window): string {
  // For a Window, `ownerDocument` is undefined, so this (like the original Selenium code) falls
  // back to the currently executing document/frame's cache rather than the target window's own.
  const ownerDocument = (el as unknown as {ownerDocument?: Document}).ownerDocument;
  const cache = getCache(ownerDocument);
  // `cache` also carries the `nextId` counter, so the real entry count is one less than the
  // object's own-property count.
  if (Object.keys(cache).length - 1 >= SWEEP_THRESHOLD) {
    sweep(ownerDocument || document);
  }

  let id: string | undefined;
  for (const key of Object.keys(cache)) {
    if (cache[key] === el) {
      id = key;
      break;
    }
  }
  if (!id) {
    id = ELEMENT_KEY_PREFIX + cache.nextId!++;
    cache[id] = el;
  }
  return id;
}

/**
 * Retrieves an element (or Window) from the cache, verifying it is still attached to the DOM (or
 * open, for a Window) before returning it.
 */
export function getElement(key: string, doc?: Document): Element | Window {
  key = decodeURIComponent(key);
  const d = doc || document;
  const cache = getCache(d);
  if (!(key in cache)) {
    // Throw STALE_ELEMENT_REFERENCE instead of NO_SUCH_ELEMENT, since the key may have been
    // defined by a prior document's cache.
    throw new BotError(ErrorCode.STALE_ELEMENT_REFERENCE, 'Element does not exist in cache');
  }

  const el = cache[key] as Element | Window;

  if (!isStale(d, el)) {
    return el;
  }

  delete cache[key];
  if ('setInterval' in el) {
    throw new BotError(ErrorCode.NO_SUCH_WINDOW, 'Window has been closed.');
  }
  throw new BotError(ErrorCode.STALE_ELEMENT_REFERENCE, 'Element is no longer attached to the DOM');
}

function isPlainObjectLike(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function isArrayLike(val: unknown): val is ArrayLike<unknown> {
  if (Array.isArray(val)) {
    return true;
  }
  return typeof val === 'object' && val !== null && typeof (val as {length?: unknown}).length === 'number';
}

/**
 * Recompiles `fn` in the context of another window, so the correct symbol table is used when
 * the function is executed. Assumes `fn` can be decompiled via `Function.prototype.toString` and
 * only refers to symbols defined in the target window's context.
 */
function recompileFunction(fn: Function | string, theWindow: Window): Function {
  if (typeof fn === 'string') {
    return new (theWindow as unknown as {Function: FunctionConstructor}).Function(fn);
  }
  return theWindow === window
    ? fn
    : new (theWindow as unknown as {Function: FunctionConstructor}).Function(`return (${fn}).apply(null,arguments);`);
}

// The property key used to store the element cache on the DOCUMENT node when it is injected into
// the page. Since compiling each browser atom results in a different symbol table, this known key
// is used to access the cache, ensuring the same object is used between injections of different
// atoms.
const CACHE_KEY = '$wdc_';

interface ElementCache {
  [key: string]: Element | Window | number | undefined;
  nextId?: number;
}

function getCache(doc?: Document): ElementCache {
  const d = (doc || document) as unknown as Record<string, ElementCache>;
  let cache = d[CACHE_KEY];
  if (!cache) {
    cache = d[CACHE_KEY] = {};
    cache.nextId = Date.now();
  }
  if (!cache.nextId) {
    cache.nextId = Date.now();
  }
  return cache;
}

/**
 * The number of entries a cache may hold before a stale-entry sweep is triggered on the next
 * addition. Bounds the growth of the cache on pages whose DOM is repeatedly recreated: without
 * this, entries for elements that are found once and then detached (e.g. by a page re-render) are
 * never reclaimed, since `getElement` only prunes an entry lazily, when that exact key is looked
 * up again.
 * @see https://github.com/SeleniumHQ/selenium/issues/17357
 */
const SWEEP_THRESHOLD = 200;

/**
 * Determines whether a cached value is stale: a closed Window, or an Element no longer attached
 * to the document it was cached against.
 */
function isStale(doc: Document, el: Element | Window): boolean {
  // If this is a Window, check whether it's closed.
  if ('setInterval' in el) {
    return !!(el as Window).closed;
  }

  // Make sure the element is still attached to the DOM.
  let node: Node | null = el as Node;
  while (node) {
    if (node === doc.documentElement) {
      return false;
    }
    if ((node as unknown as {host?: Node}).host && node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      node = (node as unknown as {host: Node}).host;
    }
    node = node.parentNode;
  }
  return true;
}

/**
 * Removes every stale entry from a cache. Unlike the lazy cleanup performed by `getElement`, this
 * proactively reclaims entries that a caller never looks up again by key — the common case for a
 * caller that repeatedly runs a find_element(s) atom against a page whose DOM keeps being
 * recreated.
 */
function sweep(doc: Document): void {
  const cache = getCache(doc);
  for (const key of Object.keys(cache)) {
    const value = cache[key];
    // Skip the `nextId` counter — its value type is the only thing guaranteed about it (a
    // number, never an Element or Window).
    if (!value || typeof value !== 'object') {
      continue;
    }
    if (isStale(doc, value)) {
      delete cache[key];
    }
  }
}
