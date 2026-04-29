import {errorFromMJSONWPStatusCode} from '@appium/base-driver';
import {util, node} from '@appium/support';
import {isDeepStrictEqual} from 'node:util';
import nodeFs from 'node:fs';
import path from 'node:path';
import type {StringRecord} from '@appium/types';
import type {AppInfo, AppDict, Page} from './types';

const MODULE_NAME = 'appium-remote-debugger';
export const WEB_CONTENT_BUNDLE_ID = 'com.apple.WebKit.WebContent';
const INACTIVE_APP_CODE = 0;
// values for the page `WIRTypeKey` entry
const ACCEPTED_PAGE_TYPES = [
  'WIRTypeWeb', // up to iOS 11.3
  'WIRTypeWebPage', // iOS 11.4
  'WIRTypePage', // iOS 11.4 webview
];
export const RESPONSE_LOG_LENGTH = 100;

/**
 * Error thrown when an async operation exceeds the configured timeout.
 */
export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Truncates a string to the requested length and appends ellipsis when needed.
 *
 * @param value - The input string.
 * @param length - Maximum output length.
 * @returns The original string when short enough, otherwise a truncated variant.
 */
export function truncateString(value: string, length: number): string {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, Math.max(0, length - 1))}…`;
}

/**
 * Creates a shallow object where undefined keys from `target` are filled
 * from `defaultsObj`.
 *
 * @param target - The object with priority values.
 * @param defaultsObj - The object providing fallback values.
 * @returns A new object containing merged defaulted values.
 */
export function defaults<T extends Record<string, any>, U extends Record<string, any>>(
  target: T,
  defaultsObj: U,
): T & U {
  const result = {...target} as T & U;
  for (const [key, value] of Object.entries(defaultsObj)) {
    if (result[key as keyof (T & U)] === undefined) {
      (result as any)[key] = value;
    }
  }
  return result;
}

/**
 * Determines whether a value is a plain object.
 *
 * @param value - The value to check.
 * @returns True when the value is a non-null non-array object.
 */
export function isPlainObject(value: unknown): value is Record<string, any> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Checks whether a value should be treated as empty.
 *
 * @param value - The value to evaluate.
 * @returns True for nullish values, empty arrays/strings/maps/sets, or empty objects.
 */
export function isEmpty(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (Array.isArray(value) || typeof value === 'string') {
    return value.length === 0;
  }
  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }
  if (isPlainObject(value)) {
    return Object.keys(value).length === 0;
  }
  return false;
}

/**
 * Deduplicates array entries while preserving order.
 *
 * @param items - Items to deduplicate.
 * @returns The input items without duplicates.
 */
export function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/**
 * Performs deep strict equality comparison.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns True when both values are deeply equal.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(a, b);
}

/**
 * Returns a promise that resolves after the specified delay.
 *
 * @param ms - Delay in milliseconds.
 * @returns A promise that resolves when the delay expires.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a promise with a timeout.
 *
 * @param promise - The promise to resolve.
 * @param timeoutMs - Maximum time to wait in milliseconds.
 * @param message - Optional timeout message.
 * @returns A promise that resolves/rejects with the original promise result, or rejects on timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new TimeoutError(message ?? `Operation timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Takes a dictionary from the remote debugger and converts it into a more
 * manageable AppInfo object with understandable keys.
 *
 * @param dict - Dictionary from the remote debugger containing application information.
 * @returns A tuple containing the application ID and the AppInfo object.
 */
export function appInfoFromDict(dict: Record<string, any>): [string, AppInfo] {
  const id = dict.WIRApplicationIdentifierKey;
  const isProxy =
    typeof dict.WIRIsApplicationProxyKey === 'string'
      ? dict.WIRIsApplicationProxyKey.toLowerCase() === 'true'
      : dict.WIRIsApplicationProxyKey;
  // automation enabled can be either from the keys
  //   - WIRRemoteAutomationEnabledKey (boolean)
  //   - WIRAutomationAvailabilityKey (string or boolean)
  let isAutomationEnabled: boolean | string = !!dict.WIRRemoteAutomationEnabledKey;
  if (Object.hasOwn(dict, 'WIRAutomationAvailabilityKey')) {
    if (typeof dict.WIRAutomationAvailabilityKey === 'string') {
      isAutomationEnabled =
        dict.WIRAutomationAvailabilityKey === 'WIRAutomationAvailabilityUnknown'
          ? 'Unknown'
          : dict.WIRAutomationAvailabilityKey === 'WIRAutomationAvailabilityAvailable';
    } else {
      isAutomationEnabled = !!dict.WIRAutomationAvailabilityKey;
    }
  }
  const entry: AppInfo = {
    id,
    isProxy,
    name: dict.WIRApplicationNameKey,
    bundleId: dict.WIRApplicationBundleIdentifierKey,
    hostId: dict.WIRHostApplicationIdentifierKey,
    isActive: dict.WIRIsApplicationActiveKey !== INACTIVE_APP_CODE,
    isAutomationEnabled,
  };

  return [id, entry];
}

/**
 * Takes a dictionary from the remote debugger and converts it into an array
 * of Page objects with understandable keys. Filters out non-web pages.
 *
 * @param pageDict - Dictionary from the remote debugger containing page information.
 * @returns An array of Page objects representing the available pages.
 */
export function pageArrayFromDict(pageDict: StringRecord): Page[] {
  return (
    Object.values(pageDict)
      // count only WIRTypeWeb pages and ignore all others (WIRTypeJavaScript etc)
      .filter(
        (dict) => dict.WIRTypeKey === undefined || ACCEPTED_PAGE_TYPES.includes(dict.WIRTypeKey),
      )
      .map((dict) => ({
        id: dict.WIRPageIdentifierKey,
        title: dict.WIRTitleKey,
        url: dict.WIRURLKey,
        isKey: dict.WIRConnectionIdentifierKey !== undefined,
      }))
  );
}

/**
 * Finds all application identifier keys that match the given bundle ID.
 * If no matches are found and the bundle ID is not WEB_CONTENT_BUNDLE_ID,
 * falls back to searching for WEB_CONTENT_BUNDLE_ID.
 *
 * @param bundleId - The bundle identifier to search for.
 * @param appDict - The application dictionary to search in.
 * @returns An array of unique application identifier keys matching the bundle ID.
 */
export function appIdsForBundle(bundleId: string, appDict: AppDict): string[] {
  const appIds: string[] = Object.entries(appDict)
    .filter(([, data]) => data.bundleId === bundleId)
    .map(([key]) => key);

  // if nothing is found, try to get the generic app
  if (appIds.length === 0 && bundleId !== WEB_CONTENT_BUNDLE_ID) {
    return appIdsForBundle(WEB_CONTENT_BUNDLE_ID, appDict);
  }

  return uniq(appIds);
}

/**
 * Validates that all parameters in the provided object have non-nil values.
 * Throws an error if any parameters are missing (null or undefined).
 *
 * @template T - The type of the parameters object.
 * @param params - An object containing parameters to validate.
 * @returns The same parameters object if all values are valid.
 * @throws Error if any parameters are missing, listing all missing parameter names.
 */
export function checkParams<T extends StringRecord>(params: T): T {
  // check if all parameters have a value
  const errors = Object.entries(params)
    .filter(([, value]) => value == null)
    .map(([param]) => param);
  if (errors.length) {
    throw new Error(`Missing ${util.pluralize('parameter', errors.length)}: ${errors.join(', ')}`);
  }
  return params;
}

/**
 * Converts a value to a best-effort JSON string for logging, removing noisy
 * function properties from cloneable objects when possible.
 *
 * Falls back to `String(value)` when JSON serialization returns `undefined`
 * or throws (for example, for functions, symbols, or circular structures).
 *
 * @param value - The value to stringify.
 * @param multiline - If true, formats JSON output with indentation. Defaults to false.
 * @returns A string representation suitable for logging.
 */
export function simpleStringify(value: any, multiline: boolean = false): string {
  const stringify = (val: any): string => {
    try {
      return multiline
        ? (JSON.stringify(val, null, 2) ?? String(val))
        : (JSON.stringify(val) ?? String(val));
    } catch {
      return String(val);
    }
  };

  if (!value) {
    return stringify(value);
  }

  let cleanValue = value;
  if (typeof value === 'object' && value !== null) {
    try {
      cleanValue = removeNoisyProperties(structuredClone(value));
    } catch {
      // Fall back to the original value when cloning fails (e.g., non-cloneable graph entries).
      cleanValue = value;
    }
  }
  return stringify(cleanValue);
}

/**
 * Converts the result from a JavaScript evaluation in the remote debugger
 * into a usable format. Handles errors, serialization, and cleans up noisy
 * function properties.
 *
 * @param res - The raw result from the remote debugger's JavaScript evaluation.
 * @returns The cleaned and converted result value.
 * @throws Error if the result is undefined, has an unexpected type, or contains
 *               an error status code.
 */
export function convertJavascriptEvaluationResult(res: any): any {
  if (res === undefined) {
    throw new Error(
      `Did not get OK result from remote debugger. Result was: ${truncateString(simpleStringify(res), RESPONSE_LOG_LENGTH)}`,
    );
  } else if (typeof res === 'string') {
    try {
      res = JSON.parse(res);
    } catch {
      // we might get a serialized object, but we might not
      // if we get here, it is just a value
    }
  } else if ((typeof res !== 'object' && typeof res !== 'function') || res === null) {
    throw new Error(`Result has unexpected type: (${typeof res}).`);
  }

  if (Object.hasOwn(res, 'status') && res.status !== 0) {
    // we got some form of error.
    throw errorFromMJSONWPStatusCode(res.status, res.value.message || res.value);
  }

  // with either have an object with a `value` property (even if `null`),
  // or a plain object
  const value = Object.hasOwn(res, 'value') ? res.value : res;
  return removeNoisyProperties(value);
}

/**
 * Calculates the path to the current module's root folder.
 * The result is memoized for performance.
 *
 * @returns The full path to the module root directory.
 * @throws Error if the module root folder cannot be determined.
 */
let cachedModuleRoot: string | undefined;
/**
 * Calculates and memoizes the path to the current module root.
 *
 * @returns The full path to the module root directory.
 * @throws Error if the module root folder cannot be determined.
 */
export function getModuleRoot(): string {
  if (cachedModuleRoot) {
    return cachedModuleRoot;
  }
  const root = node.getModuleRootSync(MODULE_NAME, __filename);
  if (!root) {
    throw new Error(`Cannot find the root folder of the ${MODULE_NAME} Node.js module`);
  }
  cachedModuleRoot = root;
  return root;
}

/**
 * Reads and parses the package.json file from the module root.
 *
 * @returns The parsed package.json contents as a StringRecord.
 */
export function getModuleProperties(): StringRecord {
  const fullPath = path.resolve(getModuleRoot(), 'package.json');
  return JSON.parse(nodeFs.readFileSync(fullPath, 'utf8'));
}

/**
 * Determines if the WebInspector shim can be used based on the provided iOS platform version.
 * @param platformVersion - The iOS platform version string (e.g., "18.0", "17.5.1")
 * @returns true if the WebInspector shim can be used, false otherwise
 */
export function canUseWebInspectorShim(platformVersion: string): boolean {
  return !!platformVersion && util.compareVersions(platformVersion, '>=', '18.0');
}

/**
 * Removes noisy function properties from an object that can muddy the logs.
 * These properties are often added by JavaScript number objects and similar.
 *
 * @param obj - The object to clean.
 * @returns The cleaned object.
 */
function removeNoisyProperties<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const property of ['ceil', 'clone', 'floor', 'round', 'scale', 'toString']) {
      delete obj[property];
    }
  }
  return obj;
}
