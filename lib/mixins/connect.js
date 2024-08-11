import {
  pageArrayFromDict,
  WEB_CONTENT_BUNDLE_ID,
  appIdsForBundle,
} from '../utils';
import events from './events';
import { timing, util } from '@appium/support';
import { retryInterval, waitForCondition } from 'asyncbox';
import _ from 'lodash';
import {
  setAppIdKey,
  getAppDict,
  getAppIdKey,
  setPageIdKey,
  getRcpClient,
  getIsSafari,
  getIncludeSafari,
  getBundleId,
  getAdditionalBundleIds,
} from './property-accessors';

const APP_CONNECT_TIMEOUT_MS = 0;
const APP_CONNECT_INTERVAL_MS = 100;
const SELECT_APP_RETRIES = 20;
const SELECT_APP_RETRY_SLEEP_MS = 500;
const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const BLANK_PAGE_URL = 'about:blank';
const WEB_CONTENT_PROCESS_BUNDLE_ID = 'process-com.apple.WebKit.WebContent';
const SAFARI_VIEW_PROCESS_BUNDLE_ID = 'process-SafariViewService';
const SAFARI_VIEW_BUNDLE_ID = 'com.apple.SafariViewService';
const WILDCARD_BUNDLE_ID = '*';

/**
 *
 * @this {RemoteDebugger}
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
 * @this {RemoteDebugger}
 * @param {number} [timeout=APP_CONNECT_TIMEOUT_MS]
 * @returns {Promise<import('../types').AppDict>}
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
      const timer = new timing.Timer().start();
      this.log.debug(`Waiting up to ${timeout}ms for applications to be reported`);
      try {
        await waitForCondition(() => !_.isEmpty(getAppDict(this)), {
          waitMs: timeout,
          intervalMs: APP_CONNECT_INTERVAL_MS,
        });
        this.log.debug(
          `Retrieved ${util.pluralize('application', _.size(getAppDict(this)), true)} ` +
          `within ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`
        );
      } catch (err) {
        this.log.debug(`Timed out waiting for applications to be reported`);
      }
    }
    return this.appDict;
  } catch (err) {
    this.log.error(`Error setting connection key: ${err.message}`);
    await this.disconnect();
    throw err;
  }
}

/**
 *
 * @this {RemoteDebugger}
 * @returns {Promise<void>}
 */
export async function disconnect () {
  await getRcpClient(this)?.disconnect();
  this.emit(events.EVENT_DISCONNECT, true);
  this.teardown();
}

/**
 *
 * @this {RemoteDebugger}
 * @param {string?} [currentUrl=null]
 * @param {number} [maxTries=SELECT_APP_RETRIES]
 * @param {boolean} [ignoreAboutBlankUrl=false]
 * @returns {Promise<import('../types').Page[]>}
 */
export async function selectApp (currentUrl = null, maxTries = SELECT_APP_RETRIES, ignoreAboutBlankUrl = false) {
  this.log.debug('Selecting application');
  const rpcClient = this.requireRpcClient();

  const shouldCheckForTarget = rpcClient.shouldCheckForTarget;
  rpcClient.shouldCheckForTarget = false;
  try {
    const timer = new timing.Timer().start();
    if (_.isEmpty(getAppDict(this))) {
      this.log.debug('No applications currently connected.');
      return [];
    }

    const { appIdKey } = await searchForApp.bind(this)(currentUrl, maxTries, ignoreAboutBlankUrl);
    if (getAppIdKey(this) !== appIdKey) {
      this.log.debug(`Received altered app id, updating from '${getAppIdKey(this)}' to '${appIdKey}'`);
      setAppIdKey(this, appIdKey);
    }
    logApplicationDictionary.bind(this)();
    // translate the dictionary into a useful form, and return to sender
    this.log.debug(`Finally selecting app ${getAppIdKey(this)}`);

    /** @type {import('../types').Page[]} */
    const fullPageArray = [];
    for (const [app, info] of _.toPairs(getAppDict(this))) {
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
 * @this {RemoteDebugger}
 * @param {string|number} appIdKey
 * @param {string|number} pageIdKey
 * @param {boolean} [skipReadyCheck]
 * @returns {Promise<void>}
 */
export async function selectPage (appIdKey, pageIdKey, skipReadyCheck = false) {
  const fullAppIdKey = _.startsWith(`${appIdKey}`, 'PID:') ? `${appIdKey}` : `PID:${appIdKey}`;
  setAppIdKey(this, fullAppIdKey);
  setPageIdKey(this, pageIdKey);

  this.log.debug(`Selecting page '${pageIdKey}' on app '${fullAppIdKey}' and forwarding socket setup`);

  const timer = new timing.Timer().start();

  await this.requireRpcClient().selectPage(fullAppIdKey, pageIdKey);

  if (!skipReadyCheck && !await this.checkPageIsReady()) {
    await this.waitForDom();
  }

  this.log.debug(`Selected page after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
}

/**
 *
 * @this {RemoteDebugger}
 * @param {string?} currentUrl
 * @param {number} maxTries
 * @param {boolean} ignoreAboutBlankUrl
 * @returns {Promise<import('../types').AppPage>}
 */
async function searchForApp (currentUrl, maxTries, ignoreAboutBlankUrl) {
  /** @type {string[]} */
  const bundleIds = _.compact(
    [
      getBundleId(this),
      ...(getAdditionalBundleIds(this) ?? []),
      ...(getIncludeSafari(this) && !getIsSafari(this) ? [SAFARI_BUNDLE_ID] : []),
    ]
  );
  let retryCount = 0;
  return /** @type {import('../types').AppPage} */ (await retryInterval(maxTries, SELECT_APP_RETRY_SLEEP_MS, async () => {
    logApplicationDictionary.bind(this)();
    const possibleAppIds = getPossibleDebuggerAppKeys.bind(this)(/** @type {string[]} */ (bundleIds));
    this.log.debug(`Trying out the possible app ids: ${possibleAppIds.join(', ')} (try #${retryCount + 1} of ${maxTries})`);
    for (const attemptedAppIdKey of possibleAppIds) {
      const appInfo = getAppDict(this)[attemptedAppIdKey];
      if (!appInfo) {
        continue;
      }
      if (!appInfo.isActive || (!appInfo.isAutomationEnabled && appInfo.bundleId === SAFARI_BUNDLE_ID)) {
        this.log.debug(
          `Skipping app '${attemptedAppIdKey}' because it is not ${appInfo.isActive ? 'enabled' : 'active'}`
        );
        continue;
      }

      this.log.debug(`Attempting app '${attemptedAppIdKey}'`);
      try {
        const [appIdKey, pageDict] = await this.requireRpcClient().selectApp(attemptedAppIdKey);

        // save the page array for this app
        getAppDict(this)[appIdKey].pageArray = pageArrayFromDict(pageDict);

        // if we are looking for a particular url, make sure we
        // have the right page. Ignore empty or undefined urls.
        // Ignore about:blank if requested.
        const result = searchForPage.bind(this)(getAppDict(this), currentUrl, ignoreAboutBlankUrl);
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
 * @this {RemoteDebugger}
 * @param {Record<string, import('../types').AppInfo>} appsDict
 * @param {string?} currentUrl
 * @param {boolean} [ignoreAboutBlankUrl]
 * @returns {import('../types').AppPage?}
 */
function searchForPage (appsDict, currentUrl = null, ignoreAboutBlankUrl = false) {
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
 * @this {RemoteDebugger}
 * @returns {void}
 */
function logApplicationDictionary () {
  this.log.debug('Current applications available:');
  for (const [app, info] of _.toPairs(getAppDict(this))) {
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
 * Find app keys based on assigned bundleIds from appDict
 * When bundleIds includes a wildcard ('*'), returns all appKeys in appDict.
 *
 * @this {RemoteDebugger}
 * @param {string[]} bundleIds
 * @returns {string[]}
 */
export function getPossibleDebuggerAppKeys(bundleIds) {
  if (bundleIds.includes(WILDCARD_BUNDLE_ID)) {
    this.log.debug('Skip checking bundle identifiers because the bundleIds includes a wildcard');
    return _.uniq(Object.keys(getAppDict(this)));
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
  this.log.debug(`Checking for bundle identifiers: ${possibleBundleIds.join(', ')}`);
  /** @type {Set<string>} */
  const proxiedAppIds = new Set();
  for (const bundleId of possibleBundleIds) {
    // now we need to determine if we should pick a proxy for this instead
    for (const appId of appIdsForBundle(bundleId, getAppDict(this))) {
      proxiedAppIds.add(appId);
      this.log.debug(`Found app id key '${appId}' for bundle '${bundleId}'`);
      for (const [key, data] of _.toPairs(getAppDict(this))) {
        if (data.isProxy && data.hostId === appId) {
          this.log.debug(
            `Found separate bundleId '${data.bundleId}' ` +
            `acting as proxy for '${bundleId}', with app id '${key}'`
          );
          proxiedAppIds.add(key);
        }
      }
    }
  }

  return Array.from(proxiedAppIds);
}

/**
 * @typedef {import('../remote-debugger').RemoteDebugger} RemoteDebugger
 */
