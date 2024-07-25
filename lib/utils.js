import log from './logger';
import _ from 'lodash';
import B from 'bluebird';
import { errorFromMJSONWPStatusCode } from '@appium/base-driver';
import { util, node } from '@appium/support';
import nodeFs from 'node:fs';
import path from 'node:path';

const MODULE_NAME = 'appium-remote-debugger';

const WEB_CONTENT_BUNDLE_ID = 'com.apple.WebKit.WebContent';
const WEB_CONTENT_PROCESS_BUNDLE_ID = 'process-com.apple.WebKit.WebContent';
const SAFARI_VIEW_PROCESS_BUNDLE_ID = 'process-SafariViewService';
const SAFARI_VIEW_BUNDLE_ID = 'com.apple.SafariViewService';
const WILDCARD_BUNDLE_ID = '*';

const INACTIVE_APP_CODE = 0;

// values for the page `WIRTypeKey` entry
const ACCEPTED_PAGE_TYPES = [
  'WIRTypeWeb', // up to iOS 11.3
  'WIRTypeWebPage', // iOS 11.4
  'WIRTypePage', // iOS 11.4 webview
];

export const RESPONSE_LOG_LENGTH = 100;

/**
 * @typedef {Object} DeferredPromise
 * @property {B<any>} promise
 * @property {(...args: any[]) => void} resolve
 * @property {(err?: Error) => void} reject
 */

/**
 * @typedef {Object} AppInfo
 * @property {string} id
 * @property {boolean} isProxy
 * @property {string} name
 * @property {string} bundleId
 * @property {string} hostId
 * @property {boolean} isActive
 * @property {boolean|string} isAutomationEnabled
 * @property {any[]|undefined|DeferredPromise} [pageArray]
 */

/**
 * Takes a dictionary from the remote debugger and makes a more manageable
 * dictionary whose keys are understandable
 *
 * @param {Record<string, any>} dict
 * @returns {[string, AppInfo]}
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

/*
 * Take a dictionary from the remote debugger and makes a more manageable
 * dictionary of pages available.
 */
export function pageArrayFromDict (pageDict) {
  if (pageDict.id) {
    // the page is already translated, so wrap in an array and pass back
    return [pageDict];
  }
  let newPageArray = [];
  for (const dict of _.values(pageDict)) {
    // count only WIRTypeWeb pages and ignore all others (WIRTypeJavaScript etc)
    if (_.isUndefined(dict.WIRTypeKey) || ACCEPTED_PAGE_TYPES.includes(dict.WIRTypeKey)) {
      newPageArray.push({
        id: dict.WIRPageIdentifierKey,
        title: dict.WIRTitleKey,
        url: dict.WIRURLKey,
        isKey: !_.isUndefined(dict.WIRConnectionIdentifierKey),
      });
    }
  }
  return newPageArray;
}

/**
 * Given a bundle id, finds the correct remote debugger app that is
 * connected.
 * @param {string} bundleId
 * @param {Record<string, any>} appDict
 * @returns {string|undefined}
 */
export function getDebuggerAppKey (bundleId, appDict) {
  let appId;
  for (const [key, data] of _.toPairs(appDict)) {
    if (data.bundleId === bundleId) {
      appId = key;
      break;
    }
  }
  // now we need to determine if we should pick a proxy for this instead
  if (appId) {
    log.debug(`Found app id key '${appId}' for bundle '${bundleId}'`);
    let proxyAppId;
    for (const [key, data] of _.toPairs(appDict)) {
      if (data.isProxy && data.hostId === appId) {
        log.debug(`Found separate bundleId '${data.bundleId}' ` +
                  `acting as proxy for '${bundleId}', with app id '${key}'`);
        // set the app id... the last one will be used, so just keep re-assigning
        proxyAppId = key;
      }
    }
    if (proxyAppId) {
      appId = proxyAppId;
      log.debug(`Using proxied app id '${appId}'`);
    }
  }

  return appId;
}

/**
 * Find app keys based on assigned bundleIds from appDict
 * When bundleIds includes a wildcard ('*'), returns all appKeys in appDict.
 * @param {string[]} bundleIds
 * @param {Record<string, any>} appDict
 * @returns {string[]}
 */
export function getPossibleDebuggerAppKeys(bundleIds, appDict) {
  if (bundleIds.includes(WILDCARD_BUNDLE_ID)) {
    log.debug('Skip checking bundle identifiers because the bundleIds includes a wildcard');
    return _.uniq(Object.keys(appDict));
  }

  // go through the possible bundle identifiers
  const possibleBundleIds = _.uniq([
    WEB_CONTENT_BUNDLE_ID,
    WEB_CONTENT_PROCESS_BUNDLE_ID,
    SAFARI_VIEW_PROCESS_BUNDLE_ID,
    SAFARI_VIEW_BUNDLE_ID,
    WILDCARD_BUNDLE_ID,
    ...bundleIds,
  ]);
  log.debug(`Checking for bundle identifiers: ${possibleBundleIds.join(', ')}`);
  /** @type {Set<string>} */
  const proxiedAppIds = new Set();
  for (const bundleId of possibleBundleIds) {
    // now we need to determine if we should pick a proxy for this instead
    for (const appId of appIdsForBundle(bundleId, appDict)) {
      proxiedAppIds.add(appId);
      log.debug(`Found app id key '${appId}' for bundle '${bundleId}'`);
      for (const [key, data] of _.toPairs(appDict)) {
        if (data.isProxy && data.hostId === appId) {
          log.debug(`Found separate bundleId '${data.bundleId}' ` +
                    `acting as proxy for '${bundleId}', with app id '${key}'`);
          proxiedAppIds.add(key);
        }
      }
    }
  }

  return Array.from(proxiedAppIds);
}

export function checkParams (params) {
  // check if all parameters have a value
  const errors = _.toPairs(params)
    .filter(([, value]) => _.isNil(value))
    .map(([param]) => param);
  if (errors.length) {
    throw new Error(`Missing ${util.pluralize('parameter', errors.length)}: ${errors.join(', ')}`);
  }
}

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
 * @returns {DeferredPromise}
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

/**
 *
 * @param {string} bundleId
 * @param {Record<string, any>} appDict
 * @returns {string[]}
 */
function appIdsForBundle (bundleId, appDict) {
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
