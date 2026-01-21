import _ from 'lodash';
import { errorFromMJSONWPStatusCode } from '@appium/base-driver';
import { util, node } from '@appium/support';
import nodeFs from 'node:fs';
import path from 'node:path';
import type { StringRecord } from '@appium/types';
import type { AppInfo, AppDict, Page } from './types';

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
 * Takes a dictionary from the remote debugger and converts it into a more
 * manageable AppInfo object with understandable keys.
 *
 * @param dict - Dictionary from the remote debugger containing application information.
 * @returns A tuple containing the application ID and the AppInfo object.
 */
export function appInfoFromDict(dict: Record<string, any>): [string, AppInfo] {
  const id = dict.WIRApplicationIdentifierKey;
  const isProxy = _.isString(dict.WIRIsApplicationProxyKey)
    ? dict.WIRIsApplicationProxyKey.toLowerCase() === 'true'
    : dict.WIRIsApplicationProxyKey;
  // automation enabled can be either from the keys
  //   - WIRRemoteAutomationEnabledKey (boolean)
  //   - WIRAutomationAvailabilityKey (string or boolean)
  let isAutomationEnabled: boolean | string = !!dict.WIRRemoteAutomationEnabledKey;
  if (_.has(dict, 'WIRAutomationAvailabilityKey')) {
    if (_.isString(dict.WIRAutomationAvailabilityKey)) {
      isAutomationEnabled = dict.WIRAutomationAvailabilityKey === 'WIRAutomationAvailabilityUnknown'
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
  return _.values(pageDict)
    // count only WIRTypeWeb pages and ignore all others (WIRTypeJavaScript etc)
    .filter((dict) => _.isUndefined(dict.WIRTypeKey) || ACCEPTED_PAGE_TYPES.includes(dict.WIRTypeKey))
    .map((dict) => ({
      id: dict.WIRPageIdentifierKey,
      title: dict.WIRTitleKey,
      url: dict.WIRURLKey,
      isKey: !_.isUndefined(dict.WIRConnectionIdentifierKey),
    }));
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
  const appIds: string[] = _.toPairs(appDict)
    .filter(([, data]) => data.bundleId === bundleId)
    .map(([key]) => key);

  // if nothing is found, try to get the generic app
  if (appIds.length === 0 && bundleId !== WEB_CONTENT_BUNDLE_ID) {
    return appIdsForBundle(WEB_CONTENT_BUNDLE_ID, appDict);
  }

  return _.uniq(appIds);
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
  const errors = _.toPairs(params)
    .filter(([, value]) => _.isNil(value))
    .map(([param]) => param);
  if (errors.length) {
    throw new Error(`Missing ${util.pluralize('parameter', errors.length)}: ${errors.join(', ')}`);
  }
  return params;
}

/**
 * Converts a value to a JSON string, removing noisy function properties
 * that can muddy the logs.
 *
 * @param value - The value to stringify.
 * @param multiline - If true, formats the JSON with indentation. Defaults to false.
 * @returns A JSON string representation of the value with noisy properties removed.
 */
export function simpleStringify(value: any, multiline: boolean = false): string {
  if (!value) {
    return JSON.stringify(value);
  }

  const cleanValue = removeNoisyProperties(_.clone(value));
  return multiline ? JSON.stringify(cleanValue, null, 2) : JSON.stringify(cleanValue);
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
  if (_.isUndefined(res)) {
    throw new Error(`Did not get OK result from remote debugger. Result was: ${_.truncate(simpleStringify(res), {length: RESPONSE_LOG_LENGTH})}`);
  } else if (_.isString(res)) {
    try {
      res = JSON.parse(res);
    } catch {
      // we might get a serialized object, but we might not
      // if we get here, it is just a value
    }
  } else if (!_.isObject(res)) {
    throw new Error(`Result has unexpected type: (${typeof res}).`);
  }

  if (res.status && res.status !== 0) {
    // we got some form of error.
    throw errorFromMJSONWPStatusCode(res.status, res.value.message || res.value);
  }

  // with either have an object with a `value` property (even if `null`),
  // or a plain object
  const value = _.has(res, 'value') ? res.value : res;
  return removeNoisyProperties(value);
}

/**
 * Calculates the path to the current module's root folder.
 * The result is memoized for performance.
 *
 * @returns The full path to the module root directory.
 * @throws Error if the module root folder cannot be determined.
 */
export const getModuleRoot = _.memoize(function getModuleRoot(): string {
  const root = node.getModuleRootSync(MODULE_NAME, __filename);
  if (!root) {
    throw new Error(`Cannot find the root folder of the ${MODULE_NAME} Node.js module`);
  }
  return root;
});

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
 * Removes noisy function properties from an object that can muddy the logs.
 * These properties are often added by JavaScript number objects and similar.
 *
 * @param obj - The object to clean.
 * @returns The cleaned object.
 */
function removeNoisyProperties<T>(obj: T): T {
  if (_.isObject(obj)) {
    for (const property of ['ceil', 'clone', 'floor', 'round', 'scale', 'toString']) {
      delete obj[property];
    }
  }
  return obj;
}
