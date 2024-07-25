import events from './events';
import {
  pageArrayFromDict,
  getDebuggerAppKey,
  simpleStringify,
  appInfoFromDict,
  deferredPromise,
} from '../utils';
import _ from 'lodash';


/*
 * Generic callbacks used throughout the lifecycle of the Remote Debugger.
 * These will be added to the prototype.
 */

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {Error?} err
 * @param {string} appIdKey
 * @param {Record<string, any>} pageDict
 * @returns {Promise<void>}
 */
export async function onPageChange (err, appIdKey, pageDict) {
  if (_.isEmpty(pageDict)) {
    return;
  }

  const pageArray = pageArrayFromDict(pageDict);

  await useAppDictLock.bind(this)((/** @type {() => void} */ done) => {
    try {
      // save the page dict for this app
      if (this.appDict[appIdKey]) {
        if (this.appDict[appIdKey].pageArray) {
          if (this.appDict[appIdKey].pageArray.resolve) {
            // pageDict is a pending promise, so resolve
            this.appDict[appIdKey].pageArray.resolve();
          } else {
            // we have a pre-existing pageDict
            if (_.isEqual(this.appDict[appIdKey].pageArray, pageArray)) {
              this.log.debug(`Received page change notice for app '${appIdKey}' ` +
                        `but the listing has not changed. Ignoring.`);
              return done();
            }
          }
        }
        // keep track of the page dictionary
        this.appDict[appIdKey].pageArray = pageArray;
      }
    } finally {
      done();
    }
  });

  if (this._navigatingToPage) {
    // in the middle of navigating, so reporting a page change will cause problems
    return;
  }

  this.log.debug(`Page changed: ${simpleStringify(pageDict, true)}`);

  this.emit(events.EVENT_PAGE_CHANGE, {
    appIdKey: appIdKey.replace('PID:', ''),
    pageArray,
  });
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} dict
 * @returns {Promise<void>}
 */
export async function onAppConnect (err, dict) {
  const appIdKey = dict.WIRApplicationIdentifierKey;
  this.log.debug(`Notified that new application '${appIdKey}' has connected`);
  await useAppDictLock.bind(this)((/** @type {() => void} */ done) => {
    try {
      updateAppsWithDict.bind(this)(dict);
    } finally {
      done();
    }
  });
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} dict
 * @returns {void}
 */
export function onAppDisconnect (err, dict) {
  const appIdKey = dict.WIRApplicationIdentifierKey;
  this.log.debug(`Application '${appIdKey}' disconnected. Removing from app dictionary.`);
 this.log.debug(`Current app is '${this.appIdKey}'`);

  // get rid of the entry in our app dictionary,
  // since it is no longer available
  delete this.appDict[appIdKey];

  // if the disconnected app is the one we are connected to, try to find another
  if (this.appIdKey === appIdKey) {
    this.log.debug(`No longer have app id. Attempting to find new one.`);
    this.appIdKey = getDebuggerAppKey(/** @type {string} */ (this.bundleId), this.appDict);
  }

  if (!this.appDict) {
    // this means we no longer have any apps. what the what?
    this.log.debug('Main app disconnected. Disconnecting altogether.');
    this.connected = false;
    this.emit(events.EVENT_DISCONNECT, true);
  }
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} dict
 * @returns {Promise<void>}
 */
export async function onAppUpdate (err, dict) {
  await useAppDictLock.bind(this)((/** @type {() => void} */ done) => {
    try {
      updateAppsWithDict.bind(this)(dict);
    } finally {
      done();
    }
  });
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} drivers
 * @returns {void}
 */
export function onConnectedDriverList (err, drivers) {
  this.connectedDrivers = drivers.WIRDriverDictionaryKey;
  this.log.debug(`Received connected driver list: ${JSON.stringify(this.connectedDrivers)}`);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} state
 * @returns {void}
 */
export function onCurrentState (err, state) {
  this.currentState = state.WIRAutomationAvailabilityKey;
  // This state changes when 'Remote Automation' in 'Settings app' > 'Safari' > 'Advanced' > 'Remote Automation' changes
  // WIRAutomationAvailabilityAvailable or WIRAutomationAvailabilityNotAvailable
  this.log.debug(`Received connected automation availability state: ${JSON.stringify(this.currentState)}`);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {Error?} err
 * @param {Record<string, any>} apps
 * @returns {Promise<void>}
 */
export async function onConnectedApplicationList (err, apps) {
  this.log.debug(`Received connected applications list: ${_.keys(apps).join(', ')}`);

  // translate the received information into an easier-to-manage
  // hash with app id as key, and app info as value
  let newDict = {};
  for (const dict of _.values(apps)) {
    const [id, entry] = appInfoFromDict(dict);
    if (this.skippedApps.includes(entry.name)) {
      continue;
    }
    newDict[id] = entry;
  }
  // update the object's list of apps
  await useAppDictLock.bind(this)((/** @type {() => void} */ done) => {
    try {
      _.defaults(this.appDict, newDict);
    } finally {
      done();
    }
  });
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {(done: () => any) => any} fn
 * @returns {Promise<any>}
 */
async function useAppDictLock (fn) {
  return await this._lock.acquire('appDict', fn);
}


/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {import('@appium/types').StringRecord} dict
 * @returns {void}
 */
function updateAppsWithDict (dict) {
  // get the dictionary entry into a nice form, and add it to the
  // application dictionary
  this.appDict = this.appDict || {};
  let [id, entry] = appInfoFromDict(dict);
  if (this.appDict[id]) {
    // preserve the page dictionary for this entry
    entry.pageArray = this.appDict[id].pageArray;
  }
  this.appDict[id] = entry;

  // add a promise to get the page dictionary
  if (_.isUndefined(entry.pageArray)) {
    entry.pageArray = deferredPromise();
  }

  // try to get the app id from our connected apps
  if (!this.appIdKey) {
    this.appIdKey = getDebuggerAppKey(/** @type {string} */ (this.bundleId), this.appDict);
  }
}
