import {
  pageArrayFromDict,
  WEB_CONTENT_BUNDLE_ID,
  appIdsForBundle,
} from '../utils';
import { events } from './events';
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
import { NEW_APP_CONNECTED_ERROR, EMPTY_PAGE_DICTIONARY_ERROR } from '../rpc/rpc-client';
import type { RemoteDebugger } from '../remote-debugger';
import type { AppDict, Page, AppIdKey, PageIdKey, AppPage } from '../types';

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
 * Sends a connection key request to the Web Inspector.
 * This method only waits to ensure the socket connection works, as the response
 * from Web Inspector can take a long time.
 */
export async function setConnectionKey(this: RemoteDebugger): Promise<void> {
  this.log.debug('Sending connection key request');

  // send but only wait to make sure the socket worked
  // as response from Web Inspector can take a long time
  await this.requireRpcClient().send('setConnectionKey', {}, false);
}

/**
 * Establishes a connection to the remote debugger and initializes the RPC client.
 * Sets up event listeners for debugger-level events and waits for applications
 * to be reported if a timeout is specified.
 *
 * @param timeout - Maximum time in milliseconds to wait for applications to be reported.
 *                  Defaults to 0 (no waiting). If provided, the method will wait up to
 *                  this duration for applications to appear in the app dictionary.
 * @returns A promise that resolves to the application dictionary containing all
 *          connected applications.
 */
export async function connect(this: RemoteDebugger, timeout: number = APP_CONNECT_TIMEOUT_MS): Promise<AppDict> {
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
      } catch {
        this.log.debug(`Timed out waiting for applications to be reported`);
      }
    }
    return this.appDict;
  } catch (err: any) {
    this.log.error(`Error setting connection key: ${err.message}`);
    await this.disconnect();
    throw err;
  }
}

/**
 * Disconnects from the remote debugger by closing the RPC client connection,
 * emitting a disconnect event, and performing cleanup via teardown.
 */
export async function disconnect(this: RemoteDebugger): Promise<void> {
  await getRcpClient(this)?.disconnect();
  this.emit(events.EVENT_DISCONNECT, true);
  this.teardown();
}

/**
 * Selects an application from the available connected applications.
 * Searches for an app matching the provided URL and bundle IDs, then returns
 * all pages from the selected application.
 *
 * @param currentUrl - Optional URL to match when selecting an application.
 *                     If provided, the method will try to find an app containing
 *                     a page with this URL.
 * @param maxTries - Maximum number of retry attempts when searching for an app.
 *                   Defaults to SELECT_APP_RETRIES (20).
 * @param ignoreAboutBlankUrl - If true, pages with 'about:blank' URL will be
 *                              excluded from the results. Defaults to false.
 * @returns A promise that resolves to an array of Page objects from the selected
 *          application. Returns an empty array if no applications are connected.
 */
export async function selectApp(
  this: RemoteDebugger,
  currentUrl: string | null = null,
  maxTries: number = SELECT_APP_RETRIES,
  ignoreAboutBlankUrl: boolean = false
): Promise<Page[]> {
  this.log.debug('Selecting application');

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

  const fullPageArray: Page[] = [];
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
}

/**
 * Selects a specific page within an application and forwards socket setup.
 * Optionally waits for the page to be ready based on the page load strategy.
 *
 * @param appIdKey - The application identifier key. Will be prefixed with 'PID:'
 *                    if not already present.
 * @param pageIdKey - The page identifier key to select.
 * @param skipReadyCheck - If true, skips the page readiness check. Defaults to false.
 *                         When false, the method will wait for the page to be ready
 *                         according to the configured page load strategy.
 */
export async function selectPage(
  this: RemoteDebugger,
  appIdKey: AppIdKey,
  pageIdKey: PageIdKey,
  skipReadyCheck: boolean = false
): Promise<void> {
  const fullAppIdKey = _.startsWith(`${appIdKey}`, 'PID:') ? `${appIdKey}` : `PID:${appIdKey}`;
  setAppIdKey(this, fullAppIdKey);
  setPageIdKey(this, pageIdKey);

  this.log.debug(`Selecting page '${pageIdKey}' on app '${fullAppIdKey}' and forwarding socket setup`);

  const timer = new timing.Timer().start();

  const pageReadinessDetector = skipReadyCheck ? undefined : {
    timeoutMs: this.pageLoadMs,
    readinessDetector: (readyState: string) => this.isPageLoadingCompleted(readyState),
  };
  await this.requireRpcClient().selectPage(fullAppIdKey, pageIdKey, pageReadinessDetector);

  this.log.debug(`Selected page after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
}

/**
 * Finds app keys based on assigned bundle IDs from the app dictionary.
 * When bundleIds includes a wildcard ('*'), returns all app keys in the app dictionary.
 * Also handles proxy applications that may act on behalf of other bundle IDs.
 *
 * @param bundleIds - Array of bundle identifiers to match against. If the array
 *                    contains a wildcard ('*'), all apps will be returned.
 * @returns Array of application identifier keys that match the provided bundle IDs.
 */
export function getPossibleDebuggerAppKeys(this: RemoteDebugger, bundleIds: string[]): string[] {
  const appDict = getAppDict(this);

  if (bundleIds.includes(WILDCARD_BUNDLE_ID)) {
    this.log.info(
      'Returning all apps because the list of matching bundle identifiers includes a wildcard'
    );
    return _.keys(appDict);
  }

  // go through the possible bundle identifiers
  const possibleBundleIds = _.uniq([
    WEB_CONTENT_BUNDLE_ID,
    WEB_CONTENT_PROCESS_BUNDLE_ID,
    SAFARI_VIEW_PROCESS_BUNDLE_ID,
    SAFARI_VIEW_BUNDLE_ID,
    ...bundleIds,
  ]);
  this.log.debug(
    `Checking for apps with matching bundle identifiers: ${possibleBundleIds.join(', ')}`
  );
  const proxiedAppIds: string[] = [];
  for (const bundleId of possibleBundleIds) {
    // now we need to determine if we should pick a proxy for this instead
    for (const appId of appIdsForBundle(bundleId, appDict)) {
      if (proxiedAppIds.includes(appId)) {
        continue;
      }

      proxiedAppIds.push(appId);
      this.log.debug(`Found app id key '${appId}' for bundle '${bundleId}'`);
      for (const [key, data] of _.toPairs(appDict)) {
        if (data.isProxy && data.hostId === appId && !proxiedAppIds.includes(key)) {
          this.log.debug(
            `Found separate bundleId '${data.bundleId}' ` +
            `acting as proxy for '${bundleId}', with app id '${key}'`
          );
          proxiedAppIds.push(key);
        }
      }
    }
  }

  this.log.debug(
    `You may also consider providing more values to 'additionalWebviewBundleIds' ` +
    `capability to match other applications. Add a wildcard ('*') to match all apps.`
  );

  return _.uniq(proxiedAppIds);
}

/**
 * Searches for an application matching the given criteria by retrying with
 * exponential backoff. Attempts to connect to apps matching the bundle IDs
 * and optionally filters by URL.
 *
 * @param currentUrl - Optional URL to match when searching for a page.
 *                     If provided, only apps containing a page with this URL
 *                     will be considered.
 * @param maxTries - Maximum number of retry attempts.
 * @param ignoreAboutBlankUrl - If true, pages with 'about:blank' URL will be
 *                              ignored during the search.
 * @returns A promise that resolves to an AppPage object containing the matched
 *          app ID key and page dictionary.
 * @throws Error if no valid webapp can be connected after all retry attempts.
 */
async function searchForApp(
  this: RemoteDebugger,
  currentUrl: string | null,
  maxTries: number,
  ignoreAboutBlankUrl: boolean
): Promise<AppPage> {
  const bundleIds: string[] = _.compact(
    [
      getBundleId(this),
      ...(getAdditionalBundleIds(this) ?? []),
      ...(getIncludeSafari(this) && !getIsSafari(this) ? [SAFARI_BUNDLE_ID] : []),
    ]
  );
  let retryCount = 0;
  return await retryInterval(maxTries, SELECT_APP_RETRY_SLEEP_MS, async () => {
    logApplicationDictionary.bind(this)();
    const possibleAppIds = getPossibleDebuggerAppKeys.bind(this)(bundleIds);
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
      } catch (err: any) {
        if (![NEW_APP_CONNECTED_ERROR, EMPTY_PAGE_DICTIONARY_ERROR].some((msg) => msg === err.message)) {
          this.log.debug(err.stack);
        }
        this.log.warn(`The application ${attemptedAppIdKey} is not connectable yet: ${err.message}`);
      }
    }
    retryCount++;
    throw new Error(
      `Could not connect to a valid webapp. Make sure it is debuggable and has at least one active page.`
    );
  }) as Promise<AppPage>;
}

/**
 * Searches through the application dictionary to find a page matching the given URL.
 * Only considers active applications with non-empty page arrays.
 *
 * @param appsDict - The application dictionary to search through.
 * @param currentUrl - Optional URL to match. If provided, only pages with this exact
 *                     URL or with this URL followed by '/' will be considered.
 * @param ignoreAboutBlankUrl - If true, pages with 'about:blank' URL will be ignored.
 * @returns An AppPage object if a matching page is found, null otherwise.
 */
function searchForPage(
  this: RemoteDebugger,
  appsDict: AppDict,
  currentUrl: string | null = null,
  ignoreAboutBlankUrl: boolean = false
): AppPage | null {
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
 * Logs the current application dictionary to the debug log.
 * Displays all applications, their properties, and their associated pages
 * in a formatted structure.
 */
function logApplicationDictionary(this: RemoteDebugger): void {
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
