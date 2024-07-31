import _ from 'lodash';
import B from 'bluebird';
import { errorFromMJSONWPStatusCode } from '@appium/base-driver';
import { util, node } from '@appium/support';
import nodeFs from 'node:fs';
import path from 'node:path';

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
 * Takes a dictionary from the remote debugger and makes a more manageable
 * dictionary whose keys are understandable
 *
 * @param {Record<string, any>} dict
 * @returns {[string, import('./types').AppInfo]}
 */
export function appInfoFromDict (dict) {
  const id = dict.WIRApplicationIdentifierKey;
  const isProxy = _.isString(dict.WIRIsApplicationProxyKey)
    ? dict.WIRIsApplicationProxyKey.toLowerCase() === 'true'
    : dict.WIRIsApplicationProxyKey;
  // automation enabled can be either from the keys
  //   - WIRRemoteAutomationEnabledKey (boolean)
  //   - WIRAutomationAvailabilityKey (string or boolean)
  /** @type {boolean|string} */
  let isAutomationEnabled = !!dict.WIRRemoteAutomationEnabledKey;
  if (_.has(dict, 'WIRAutomationAvailabilityKey')) {
    if (_.isString(dict.WIRAutomationAvailabilityKey)) {
      isAutomationEnabled = dict.WIRAutomationAvailabilityKey === 'WIRAutomationAvailabilityUnknown'
        ? 'Unknown'
        : dict.WIRAutomationAvailabilityKey === 'WIRAutomationAvailabilityAvailable';
    } else {
      isAutomationEnabled = !!dict.WIRAutomationAvailabilityKey;
    }
  }
  /** @type {import('./types').AppInfo} */
  const entry = {
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
 * Take a dictionary from the remote debugger and makes a more manageable
 * dictionary of pages available.
 *
 * @param {import('@appium/types').StringRecord} pageDict
 * @returns {import('./types').Page[]}
 */
export function pageArrayFromDict (pageDict) {
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
 *
 * @param {string} bundleId
 * @param {import('./types').AppDict} appDict
 * @returns {string[]}
 */
export function appIdsForBundle (bundleId, appDict) {
  /** @type {Set<string>} */
  const appIds = new Set();
  for (const [key, data] of _.toPairs(appDict)) {
    if (data.bundleId.endsWith(bundleId)) {
      appIds.add(key);
    }
  }

  // if nothing is found, try to get the generic app
  if (appIds.size === 0 && bundleId !== WEB_CONTENT_BUNDLE_ID) {
    return appIdsForBundle(WEB_CONTENT_BUNDLE_ID, appDict);
  }

  return Array.from(appIds);
}

/**
 * @param {import('@appium/types').StringRecord} params
 * @returns {void}
 */
export function checkParams (params) {
  // check if all parameters have a value
  const errors = _.toPairs(params)
    .filter(([, value]) => _.isNil(value))
    .map(([param]) => param);
  if (errors.length) {
    throw new Error(`Missing ${util.pluralize('parameter', errors.length)}: ${errors.join(', ')}`);
  }
}

/**
 * @param {any} value
 * @param {boolean} [multiline=false]
 * @returns {string}
 */
export function simpleStringify (value, multiline = false) {
  if (!value) {
    return JSON.stringify(value);
  }

  // we get back objects sometimes with string versions of functions
  // which muddy the logs
  let cleanValue = _.clone(value);
  for (const property of ['ceil', 'clone', 'floor', 'round', 'scale', 'toString']) {
    delete cleanValue[property];
  }
  return multiline ? JSON.stringify(cleanValue, null, 2) : JSON.stringify(cleanValue);
}

/**
 * @returns {import('./types').DeferredPromise}
 */
export function deferredPromise () {
  // http://bluebirdjs.com/docs/api/deferred-migration.html
  /** @type {(...args: any[]) => void}  */
  let resolve;
  /** @type {(err?: Error) => void} */
  let reject;
  const promise = new B((res, rej) => { // eslint-disable-line promise/param-names
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    // @ts-ignore It will be assigned eventually
    resolve,
    // @ts-ignore It will be assigned eventually
    reject
  };
}

/**
 *
 * @param {any} res
 * @returns {any}
 */
export function convertResult (res) {
  if (_.isUndefined(res)) {
    throw new Error(`Did not get OK result from remote debugger. Result was: ${_.truncate(simpleStringify(res), {length: RESPONSE_LOG_LENGTH})}`);
  } else if (_.isString(res)) {
    try {
      res = JSON.parse(res);
    } catch (err) {
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

  // get rid of noisy functions on objects
  if (_.isObject(value)) {
    for (const property of ['ceil', 'clone', 'floor', 'round', 'scale', 'toString']) {
      delete value[property];
    }
  }
  return value;
}

/**
 * Calculates the path to the current module's root folder
 *
 * @returns {string} The full path to module root
 * @throws {Error} If the current module root folder cannot be determined
 */
export const getModuleRoot = _.memoize(function getModuleRoot () {
  const root = node.getModuleRootSync(MODULE_NAME, __filename);
  if (!root) {
    throw new Error(`Cannot find the root folder of the ${MODULE_NAME} Node.js module`);
  }
  return root;
});

/**
 * @returns {import('@appium/types').StringRecord}
 */
export function getModuleProperties() {
  const fullPath = path.resolve(getModuleRoot(), 'package.json');
  return JSON.parse(nodeFs.readFileSync(fullPath, 'utf8'));
}
