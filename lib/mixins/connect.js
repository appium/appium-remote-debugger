import {
  pageArrayFromDict,
  getPossibleDebuggerAppKeys,
} from '../utils';
import events from './events';
import { timing } from '@appium/support';
import { retryInterval, waitForCondition } from 'asyncbox';
import _ from 'lodash';

const APP_CONNECT_TIMEOUT_MS = 0;
const APP_CONNECT_INTERVAL_MS = 100;
const SELECT_APP_RETRIES = 20;
const SELECT_APP_RETRY_SLEEP_MS = 500;
const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const BLANK_PAGE_URL = 'about:blank';

/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {Promise<void>}
 */
export async function setConnectionKey () {
  this.log.debug('Sending connection key request');

  // send but only wait to make sure the socket worked
  // as response from Web Inspector can take a long time
  await this.requireRpcClient().send('setConnectionKey', {}, false);
}

/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {number} [timeout=APP_CONNECT_TIMEOUT_MS]
 * @returns {Promise<import('@appium/types').StringRecord>}
 */
export async function connect (timeout = APP_CONNECT_TIMEOUT_MS) {
  this.setup();

  // initialize the rpc client
  this.initRpcClient();

  const rpcClient = this.requireRpcClient();

  // listen for basic debugger-level events
  rpcClient.on('_rpc_reportSetup:', _.noop);
  rpcClient.on('_rpc_forwardGetListing:', this.onPageChange.bind(this));
  rpcClient.on('_rpc_reportConnectedApplicationList:', this.onConnectedApplicationList.bind(this));
  rpcClient.on('_rpc_applicationConnected:', this.onAppConnect.bind(this));
  rpcClient.on('_rpc_applicationDisconnected:', this.onAppDisconnect.bind(this));
  rpcClient.on('_rpc_applicationUpdated:', this.onAppUpdate.bind(this));
  rpcClient.on('_rpc_reportConnectedDriverList:', this.onConnectedDriverList.bind(this));
  rpcClient.on('_rpc_reportCurrentState:', this.onCurrentState.bind(this));
  rpcClient.on('Page.frameDetached', this.frameDetached.bind(this));

  await rpcClient.connect();

  // get the connection information about the app
  try {
    await this.setConnectionKey();
    if (timeout) {
      this.log.debug(`Waiting up to ${timeout}ms for applications to be reported`);
      try {
        await waitForCondition(() => !_.isEmpty(this.appDict), {
          waitMs: timeout,
          intervalMs: APP_CONNECT_INTERVAL_MS,
        });
      } catch (err) {
        this.log.debug(`Timed out waiting for applications to be reported`);
      }
    }
    return this.appDict || {};
  } catch (err) {
    this.log.error(`Error setting connection key: ${err.message}`);
    await this.disconnect();
    throw err;
  }
}

/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {Promise<void>}
 */
export async function disconnect () {
  if (this.rpcClient) {
    await this.rpcClient.disconnect();
  }
  this.emit(events.EVENT_DISCONNECT, true);
  this.teardown();
}

/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string?} [currentUrl=null]
 * @param {number} [maxTries=SELECT_APP_RETRIES]
 * @param {boolean} [ignoreAboutBlankUrl=false]
 * @returns {Promise<Page[]>}
 */
export async function selectApp (currentUrl = null, maxTries = SELECT_APP_RETRIES, ignoreAboutBlankUrl = false) {
  this.log.debug('Selecting application');
  const rpcClient = this.requireRpcClient();

  const shouldCheckForTarget = rpcClient.shouldCheckForTarget;
  rpcClient.shouldCheckForTarget = false;
  try {
    const timer = new timing.Timer().start();
    if (!this.appDict || _.isEmpty(this.appDict)) {
      this.log.debug('No applications currently connected.');
      return [];
    }

    const { appIdKey } = await this.searchForApp(currentUrl, maxTries, ignoreAboutBlankUrl);
    if (this.appIdKey !== appIdKey) {
      this.log.debug(`Received altered app id, updating from '${this.appIdKey}' to '${appIdKey}'`);
      this.appIdKey = appIdKey;
    }
    logApplicationDictionary.bind(this)();
    // translate the dictionary into a useful form, and return to sender
    this.log.debug(`Finally selecting app ${this.appIdKey}`);

    /** @type {Page[]} */
    const fullPageArray = [];
    for (const [app, info] of _.toPairs(this.appDict)) {
      if (!_.isArray(info.pageArray) || !info.isActive) {
        continue;
      }
      const id = app.replace('PID:', '');
      for (const page of info.pageArray) {
        if (!(ignoreAboutBlankUrl && page.url === BLANK_PAGE_URL)) {
          const pageDict = _.clone(page);
          pageDict.id = `${id}.${pageDict.id}`;
          pageDict.bundleId = info.bundleId;
          fullPageArray.push(pageDict);
        }
      }
    }

    this.log.debug(`Selected app after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
    return fullPageArray;
  } finally {
    rpcClient.shouldCheckForTarget = shouldCheckForTarget;
  }
}

/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string?} currentUrl
 * @param {number} maxTries
 * @param {boolean} ignoreAboutBlankUrl
 * @returns {Promise<AppPage>}
 */
export async function searchForApp (currentUrl, maxTries, ignoreAboutBlankUrl) {
  const bundleIds = this.includeSafari && !this.isSafari
    ? [this.bundleId, ...this.additionalBundleIds, SAFARI_BUNDLE_ID]
    : [this.bundleId, ...this.additionalBundleIds];
  let retryCount = 0;
  return /** @type {AppPage} */ (await retryInterval(maxTries, SELECT_APP_RETRY_SLEEP_MS, async () => {
    logApplicationDictionary.bind(this)();
    const possibleAppIds = getPossibleDebuggerAppKeys(/** @type {string[]} */ (bundleIds), this.appDict);
    this.log.debug(`Trying out the possible app ids: ${possibleAppIds.join(', ')} (try #${retryCount + 1} of ${maxTries})`);
    for (const attemptedAppIdKey of possibleAppIds) {
      try {
        if (!this.appDict[attemptedAppIdKey].isActive) {
          this.log.debug(`Skipping app '${attemptedAppIdKey}' because it is not active`);
          continue;
        }

        this.log.debug(`Attempting app '${attemptedAppIdKey}'`);
        /** @type {string} */
        let appIdKey;
        /** @type {import('@appium/types').StringRecord} */
        let pageDict;
        try {
          [appIdKey, pageDict] = await this.requireRpcClient().selectApp(attemptedAppIdKey);
        } catch (e) {
          this.log.info(`Skipping app '${attemptedAppIdKey}'. Original error: ${e.message}`);
          continue;
        }

        // save the page array for this app
        this.appDict[appIdKey].pageArray = pageArrayFromDict(pageDict);

        // if we are looking for a particular url, make sure we
        // have the right page. Ignore empty or undefined urls.
        // Ignore about:blank if requested.
        const result = this.searchForPage(this.appDict, currentUrl, ignoreAboutBlankUrl);
        if (result) {
          return result;
        }

        if (currentUrl) {
          this.log.debug(`Received app, but expected url ('${currentUrl}') was not found. Trying again.`);
        } else {
          this.log.debug('Received app, but no match was found. Trying again.');
        }
      } catch (err) {
        this.log.debug(err.stack);
        this.log.warn(`Error checking application ${attemptedAppIdKey}: '${err.message}'`);
      }
    }
    retryCount++;
    throw new Error(
      `Could not connect to a valid webapp. Make sure it is debuggable and has at least one active page.`
    );
  }));
}

/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {Record<string, import('../utils').AppInfo>} appsDict
 * @param {string?} currentUrl
 * @param {boolean} [ignoreAboutBlankUrl]
 * @returns {AppPage?}
 */
export function searchForPage (appsDict, currentUrl = null, ignoreAboutBlankUrl = false) {
  for (const appDict of _.values(appsDict)) {
    if (!appDict || !appDict.isActive || !appDict.pageArray || _.isEmpty(appDict.pageArray)) {
      continue;
    }

    for (const page of appDict.pageArray) {
      if ((!ignoreAboutBlankUrl || page.url !== BLANK_PAGE_URL) &&
          (!currentUrl || page.url === currentUrl || page.url === `${currentUrl}/`)) {
        return {
          appIdKey: appDict.id,
          pageDict: page
        };
      }
    }
  }
  return null;
}

/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string|number} appIdKey
 * @param {string|number} pageIdKey
 * @param {boolean} [skipReadyCheck]
 * @returns {Promise<void>}
 */
export async function selectPage (appIdKey, pageIdKey, skipReadyCheck = false) {
  this.appIdKey = _.startsWith(`${appIdKey}`, 'PID:') ? `${appIdKey}` : `PID:${appIdKey}`;
  this.pageIdKey = pageIdKey;

  this.log.debug(`Selecting page '${pageIdKey}' on app '${this.appIdKey}' and forwarding socket setup`);

  const timer = new timing.Timer().start();

  await this.requireRpcClient().selectPage(this.appIdKey, pageIdKey);

  // make sure everything is ready to go
  if (!skipReadyCheck && !await this.checkPageIsReady()) {
    await this.waitForDom();
  }

  this.log.debug(`Selected page after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {void}
 */
function logApplicationDictionary () {
  this.log.debug('Current applications available:');
  for (const [app, info] of _.toPairs(this.appDict)) {
    this.log.debug(`    Application: "${app}"`);
    for (const [key, value] of _.toPairs(info)) {
      if (key === 'pageArray' && Array.isArray(value) && value.length) {
        this.log.debug(`        ${key}:`);
        for (const page of value) {
          let prefix = '- ';
          for (const [k, v] of _.toPairs(page)) {
            this.log.debug(`          ${prefix}${k}: ${JSON.stringify(v)}`);
            prefix = '  ';
          }
        }
      } else {
        const valueString = _.isFunction(value) ? '[Function]' : JSON.stringify(value);
        this.log.debug(`        ${key}: ${valueString}`);
      }
    }
  }
}

/**
 * @typedef {Object} AppPage
 * @property {string} appIdKey
 * @property {Page} pageDict
 */

/**
 * @typedef {Object} App
 * @property {string} id
 * @property {string} bundleId
 */

/**
 * @typedef {Object} Page
 * @property {string} url
 * @property {string} title
 * @property {number} id
 * @property {boolean} isKey
 * @property {string} [bundleId]
 */
