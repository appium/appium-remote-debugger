import events from './events';
import {
  pageArrayFromDict,
  appInfoFromDict,
} from '../utils';
import _ from 'lodash';
import {
  setAppIdKey,
  getAppDict,
  getAppIdKey,
  getBundleId,
  getNavigatingToPage,
  setCurrentState,
  setConnectedDrivers,
  getSkippedApps,
} from './property-accessors';

/*
 * Generic callbacks used throughout the lifecycle of the Remote Debugger.
 * These will be added to the prototype.
 */

/**
 * @this {RemoteDebugger}
 * @param {Error?} err
 * @param {string} appIdKey
 * @param {Record<string, any>} pageDict
 * @returns {Promise<void>}
 */
// eslint-disable-next-line require-await
export async function onPageChange (err, appIdKey, pageDict) {
  if (_.isEmpty(pageDict)) {
    return;
  }

  const currentPages = pageArrayFromDict(pageDict);
  // save the page dict for this app
  if (getAppDict(this)[appIdKey]) {
    const previousPages = getAppDict(this)[appIdKey].pageArray;
    // we have a pre-existing pageDict
    if (previousPages && _.isEqual(previousPages, currentPages)) {
      this.log.debug(
        `Received page change notice for app '${appIdKey}' ` +
        `but the listing has not changed. Ignoring.`
      );
      return;
    }
    // keep track of the page dictionary
    getAppDict(this)[appIdKey].pageArray = currentPages;
    this.log.debug(
      `Pages changed for ${appIdKey}: ${JSON.stringify(previousPages)} -> ${JSON.stringify(currentPages)}`
    );
  }

  if (getNavigatingToPage(this)) {
    // in the middle of navigating, so reporting a page change will cause problems
    return;
  }

  this.emit(events.EVENT_PAGE_CHANGE, {
    appIdKey: appIdKey.replace('PID:', ''),
    pageArray: currentPages,
  });
}

/**
 * @this {RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} dict
 * @returns {Promise<void>}
 */
// eslint-disable-next-line require-await
export async function onAppConnect (err, dict) {
  const appIdKey = dict.WIRApplicationIdentifierKey;
  this.log.debug(`Notified that new application '${appIdKey}' has connected`);
  updateAppsWithDict.bind(this)(dict);
}

/**
 * @this {RemoteDebugger}
 * @param {Error?} err
 * @param {import('@appium/types').StringRecord} dict
 * @returns {void}
 */
export function onAppDisconnect (err, dict) {
  const appIdKey = dict.WIRApplicationIdentifierKey;
  this.log.debug(`Application '${appIdKey}' disconnected. Removing from app dictionary.`);
  this.log.debug(`Current app is '${getAppIdKey(this)}'`);

  // get rid of the entry in our app dictionary,
  // since it is no longer available
  delete getAppDict(this)[appIdKey];

  // if the disconnected app is the one we are connected to, try to find another
  if (getAppIdKey(this) === appIdKey) {
    this.log.debug(`No longer have app id. Attempting to find new one.`);
    setAppIdKey(this, getDebuggerAppKey.bind(this)(/** @type {string} */ (getBundleId(this))));
  }

  if (_.isEmpty(getAppDict(this))) {
    // this means we no longer have any apps. what the what?
    this.log.debug('Main app disconnected. Disconnecting altogether.');
    this.emit(events.EVENT_DISCONNECT, true);
  }
}

/**
 * @this {RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} dict
 * @returns {Promise<void>}
 */
// eslint-disable-next-line require-await
export async function onAppUpdate (err, dict) {
  this.log.debug(`Notified that an application has been updated`);
  updateAppsWithDict.bind(this)(dict);
}

/**
 * @this {RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} drivers
 * @returns {void}
 */
export function onConnectedDriverList (err, drivers) {
  setConnectedDrivers(this, drivers.WIRDriverDictionaryKey);
  this.log.debug(`Received connected driver list: ${JSON.stringify(this.connectedDrivers)}`);
}

/**
 * @this {RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} state
 * @returns {void}
 */
export function onCurrentState (err, state) {
  setCurrentState(this, state.WIRAutomationAvailabilityKey);
  // This state changes when 'Remote Automation' in 'Settings app' > 'Safari' > 'Advanced' > 'Remote Automation' changes
  // WIRAutomationAvailabilityAvailable or WIRAutomationAvailabilityNotAvailable
  this.log.debug(`Received connected automation availability state: ${JSON.stringify(this.currentState)}`);
}

/**
 * @this {RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} apps
 * @returns {Promise<void>}
 */
// eslint-disable-next-line require-await
export async function onConnectedApplicationList (err, apps) {
  this.log.debug(`Received connected applications list: ${_.keys(apps).join(', ')}`);

  // translate the received information into an easier-to-manage
  // hash with app id as key, and app info as value
  let newDict = {};
  for (const dict of _.values(apps)) {
    const [id, entry] = appInfoFromDict(dict);
    if (getSkippedApps(this).includes(entry.name)) {
      continue;
    }
    newDict[id] = entry;
  }
  // update the object's list of apps
  _.defaults(getAppDict(this), newDict);
}

/**
 *
 * @this {RemoteDebugger}
 * @param {import('@appium/types').StringRecord} dict
 * @returns {void}
 */
function updateAppsWithDict (dict) {
  // get the dictionary entry into a nice form, and add it to the
  // application dictionary
  const [id, entry] = appInfoFromDict(dict);
  if (getAppDict(this)[id]?.pageArray) {
    // preserve the page dictionary for this entry
    entry.pageArray = getAppDict(this)[id].pageArray;
  }
  getAppDict(this)[id] = entry;

  // try to get the app id from our connected apps
  if (!getAppIdKey(this)) {
    setAppIdKey(this, getDebuggerAppKey.bind(this)(/** @type {string} */ (getBundleId(this))));
  }
}

/**
 * Given a bundle id, finds the correct remote debugger app that is
 * connected.
 *
 * @this {RemoteDebugger}
 * @param {string} bundleId
 * @returns {string|undefined}
 */
export function getDebuggerAppKey (bundleId) {
  let appId;
  for (const [key, data] of _.toPairs(getAppDict(this))) {
    if (data.bundleId === bundleId) {
      appId = key;
      break;
    }
  }
  // now we need to determine if we should pick a proxy for this instead
  if (appId) {
    this.log.debug(`Found app id key '${appId}' for bundle '${bundleId}'`);
    let proxyAppId;
    for (const [key, data] of _.toPairs(getAppDict(this))) {
      if (data.isProxy && data.hostId === appId) {
        this.log.debug(`Found separate bundleId '${data.bundleId}' ` +
                  `acting as proxy for '${bundleId}', with app id '${key}'`);
        // set the app id... the last one will be used, so just keep re-assigning
        proxyAppId = key;
      }
    }
    if (proxyAppId) {
      appId = proxyAppId;
      this.log.debug(`Using proxied app id '${appId}'`);
    }
  }

  return appId;
}

/**
 * @typedef {import('../remote-debugger').RemoteDebugger} RemoteDebugger
 */
