import log from '../logger';
import { appInfoFromDict, pageArrayFromDict, getDebuggerAppKey,
         getPossibleDebuggerAppKeys, simpleStringify, deferredPromise } from '../utils';
import events from './events';
import { timing } from 'appium-support';
import { retryInterval, waitForCondition } from 'asyncbox';
import _ from 'lodash';


const APP_CONNECT_TIMEOUT_MS = 0;
const APP_CONNECT_INTERVAL_MS = 100;
const SELECT_APP_RETRIES = 20;
const SELECT_APP_RETRY_SLEEP_MS = 500;
const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const BLANK_PAGE_URL = 'about:blank';


async function setConnectionKey () {
  log.debug('Sending connection key request');
  // send but only wait to make sure the socket worked
  // as response from Web Inspector can take a long time
  await this.rpcClient.send('setConnectionKey', {}, false);
}

async function connect (timeout = APP_CONNECT_TIMEOUT_MS) {
  this.setup();

  // initialize the rpc client
  this.initRpcClient();

  // listen for basic debugger-level events
  this.rpcClient.on('_rpc_reportSetup:', _.noop);
  this.rpcClient.on('_rpc_forwardGetListing:', this.onPageChange.bind(this));
  this.rpcClient.on('_rpc_reportConnectedApplicationList:', this.onConnectedApplicationList.bind(this));
  this.rpcClient.on('_rpc_applicationConnected:', this.onAppConnect.bind(this));
  this.rpcClient.on('_rpc_applicationDisconnected:', this.onAppDisconnect.bind(this));
  this.rpcClient.on('_rpc_applicationUpdated:', this.onAppUpdate.bind(this));
  this.rpcClient.on('_rpc_reportConnectedDriverList:', this.onConnectedDriverList.bind(this));
  this.rpcClient.on('_rpc_reportCurrentState:', this.onCurrentState.bind(this));
  this.rpcClient.on('Page.frameDetached', this.frameDetached.bind(this));

  await this.rpcClient.connect();

  // get the connection information about the app
  try {
    await this.setConnectionKey();
    if (timeout) {
      log.debug(`Waiting up to ${timeout}ms for applications to be reported`);
      try {
        await waitForCondition(() => !_.isEmpty(this.appDict), {
          waitMs: timeout,
          interval: APP_CONNECT_INTERVAL_MS,
        });
      } catch (err) {
        log.debug(`Timed out waiting for applications to be reported`);
      }
    }
    return this.appDict || {};
  } catch (err) {
    log.error(`Error setting connection key: ${err.message}`);
    await this.disconnect();
    throw err;
  }
}

async function disconnect () {
  if (this.rpcClient) {
    await this.rpcClient.disconnect();
  }
  this.emit(events.EVENT_DISCONNECT, true);
  this.teardown();
}

async function selectApp (currentUrl = null, maxTries = SELECT_APP_RETRIES, ignoreAboutBlankUrl = false) {
  const shouldCheckForTarget = this.rpcClient.shouldCheckForTarget;
  this.rpcClient.shouldCheckForTarget = false;
  try {
    const timer = new timing.Timer().start();
    log.debug('Selecting application');
    if (!this.appDict || _.isEmpty(this.appDict)) {
      log.debug('No applications currently connected.');
      return [];
    }

    const {appIdKey, pageDict} = await this.searchForApp(currentUrl, maxTries, ignoreAboutBlankUrl);

    // if, after all this, we have no dictionary, we have failed
    if (!appIdKey || !pageDict) {
      log.errorAndThrow(`Could not connect to a valid app after ${maxTries} tries.`);
    }

    if (this.appIdKey !== appIdKey) {
      log.debug(`Received altered app id, updating from '${this.appIdKey}' to '${appIdKey}'`);
      this.appIdKey = appIdKey;
    }

    logApplicationDictionary(this.appDict);

    // translate the dictionary into a useful form, and return to sender
    const pageArray = _.isEmpty(this.appDict[appIdKey].pageArray)
      ? pageArrayFromDict(pageDict)
      : this.appDict[appIdKey].pageArray;
    log.debug(`Finally selecting app ${this.appIdKey}: ${simpleStringify(pageArray)}`);

    let fullPageArray = [];
    for (const [app, info] of _.toPairs(this.appDict)) {
      if (!_.isArray(info.pageArray) || !info.isActive) {
        continue;
      }
      const id = app.replace('PID:', '');
      for (const page of info.pageArray) {
        if (!(ignoreAboutBlankUrl && page.url === BLANK_PAGE_URL)) {
          let pageDict = _.clone(page);
          pageDict.id = `${id}.${pageDict.id}`;
          pageDict.bundleId = info.bundleId;
          fullPageArray.push(pageDict);
        }
      }
    }

    log.debug(`Selected app after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
    return fullPageArray;
  } finally {
    this.rpcClient.shouldCheckForTarget = shouldCheckForTarget;
  }
}

async function searchForApp (currentUrl, maxTries, ignoreAboutBlankUrl) {
  const bundleIds = this.includeSafari && !this.isSafari
    ? [this.bundleId, ...this.additionalBundleIds, SAFARI_BUNDLE_ID]
    : [this.bundleId, ...this.additionalBundleIds];
  try {
    return await retryInterval(maxTries, SELECT_APP_RETRY_SLEEP_MS, async (retryCount) => {
      logApplicationDictionary(this.appDict);
      const possibleAppIds = getPossibleDebuggerAppKeys(bundleIds, this.appDict);
      log.debug(`Trying out the possible app ids: ${possibleAppIds.join(', ')} (try #${retryCount + 1} of ${maxTries})`);
      for (const attemptedAppIdKey of possibleAppIds) {
        try {
          if (!this.appDict[attemptedAppIdKey].isActive) {
            log.debug(`Skipping app '${attemptedAppIdKey}' because it is not active`);
            continue;
          }
          log.debug(`Attempting app '${attemptedAppIdKey}'`);
          const [appIdKey, pageDict] = await this.rpcClient.selectApp(attemptedAppIdKey, this.onAppConnect.bind(this));
          // in iOS 8.2 the connect logic happens, but with an empty dictionary
          // which leads to the remote debugger getting disconnected, and into a loop
          if (_.isEmpty(pageDict)) {
            log.debug('Empty page dictionary received. Trying again.');
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
            log.debug(`Received app, but expected url ('${currentUrl}') was not found. Trying again.`);
          } else {
            log.debug('Received app, but no match was found. Trying again.');
          }
        } catch (err) {
          log.debug(`Error checking application: '${err.message}'. Retrying connection`);
        }
      }
      retryCount++;
      throw new Error('Failed to find an app to select');
    }, 0);
  } catch (ign) {
    log.errorAndThrow(`Could not connect to a valid app after ${maxTries} tries.`);
  }
}

function searchForPage (appsDict, currentUrl = null, ignoreAboutBlankUrl = false) {
  for (const appDict of _.values(appsDict)) {
    if (!appDict || !appDict.isActive || !appDict.pageArray || appDict.pageArray.promise) {
      continue;
    }

    for (const dict of appDict.pageArray) {
      if ((!ignoreAboutBlankUrl || dict.url !== BLANK_PAGE_URL) &&
          (!currentUrl || dict.url === currentUrl || dict.url === `${currentUrl}/`)) {
        return { appIdKey: appDict.id, pageDict: dict };
      }
    }
  }
  return null;
}

async function selectPage (appIdKey, pageIdKey, skipReadyCheck = false) {
  this.appIdKey = `PID:${appIdKey}`;
  this.pageIdKey = pageIdKey;

  log.debug(`Selecting page '${pageIdKey}' on app '${this.appIdKey}' and forwarding socket setup`);

  const timer = new timing.Timer().start();

  await this.rpcClient.selectPage(this.appIdKey, pageIdKey);

  // make sure everything is ready to go
  if (!skipReadyCheck && !await this.checkPageIsReady()) {
    await this.pageUnload();
  }

  log.debug(`Selected page after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
}

function logApplicationDictionary (apps) {
  function getValueString (key, value) {
    if (_.isFunction(value)) {
      return '[Function]';
    }
    if (key === 'pageArray' && !_.isArray(value)) {
      return `"Waiting for data"`;
    }
    return JSON.stringify(value);
  }
  log.debug('Current applications available:');
  for (const [app, info] of _.toPairs(apps)) {
    log.debug(`    Application: "${app}"`);
    for (const [key, value] of _.toPairs(info)) {
      if (key === 'pageArray' && Array.isArray(value) && value.length) {
        log.debug(`        ${key}:`);
        for (const page of value) {
          let prefix = '- ';
          for (const [k, v] of _.toPairs(page)) {
            log.debug(`          ${prefix}${k}: ${JSON.stringify(v)}`);
            prefix = '  ';
          }
        }
      } else {
        const valueString = getValueString(key, value);
        log.debug(`        ${key}: ${valueString}`);
      }
    }
  }
}

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
    this.appIdKey = getDebuggerAppKey(this.bundleId, this.appDict);
  }
}

export default { setConnectionKey, connect, disconnect, selectApp, searchForApp, searchForPage, selectPage, updateAppsWithDict };
