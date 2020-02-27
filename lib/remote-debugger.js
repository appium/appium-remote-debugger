import events from 'events';
import log from './logger';
import { errors } from 'appium-base-driver';
import { RpcClientSimulator } from './rpc';
import messageHandlers from './message-handlers';
import { appInfoFromDict, pageArrayFromDict, getDebuggerAppKey,
         getPossibleDebuggerAppKeys, checkParams, getScriptForAtom,
         simpleStringify, deferredPromise, convertResult,
         RESPONSE_LOG_LENGTH } from './helpers';
import { util, timing } from 'appium-support';
import { retryInterval, waitForCondition } from 'asyncbox';
import _ from 'lodash';
import B from 'bluebird';
import path from 'path';
import UUID from 'uuid-js';
import AsyncLock from 'async-lock';


let VERSION;
try {
  VERSION = require(path.resolve(__dirname, '..', '..', 'package.json')).version;
} catch (ign) {}

const APP_CONNECT_TIMEOUT_MS = 0;
const APP_CONNECT_INTERVAL_MS = 100;
const SELECT_APP_RETRIES = 20;
const SELECT_APP_RETRY_SLEEP_MS = 500;
const REMOTE_DEBUGGER_PORT = 27753;
const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const BLANK_PAGE_URL = 'about:blank';

/* How many milliseconds to wait for webkit to return a response before timing out */
const RPC_RESPONSE_TIMEOUT_MS = 5000;

const PAGE_READY_TIMEOUT = 5000;

const GARBAGE_COLLECT_TIMEOUT = 5000;

const ACTIVE_APP_CODE = 0;

class RemoteDebugger extends events.EventEmitter {
  /*
   * The constructor takes an opts hash with the following properties:
   *   - bundleId - id of the app being connected to
   *   - additionalBundleIds - array of possible bundle ids that the inspector
   *                           could return
   *   - platformVersion - version of iOS
   *   - useNewSafari - for web inspector, whether this is a new Safari instance
   *   - pageLoadMs - the time, in ms, that should be waited for page loading
   *   - host - the remote debugger's host address
   *   - port - the remote debugger port through which to communicate
   *   - logAllCommunication - log plists sent and received from Web Inspector
   *   - logAllCommunicationHexDump - log communication from Web Inspector as hex dump
   *   - socketChunkSize - size, in bytes, of chunks of data sent to Web Inspector (real device only)
   */
  constructor (opts = {}) {
    super();

    if (VERSION) {
      log.info(`Remote Debugger version ${VERSION}`);
    }

    const {
      bundleId,
      additionalBundleIds = [],
      platformVersion,
      isSafari = true,
      includeSafari = false,
      useNewSafari = false,
      pageLoadMs,
      host,
      port = REMOTE_DEBUGGER_PORT,
      socketPath,
      pageReadyTimeout = PAGE_READY_TIMEOUT,
      remoteDebugProxy,
      garbageCollectOnExecute = false,
      logFullResponse = false,
      logAllCommunication = false,
      logAllCommunicationHexDump = false,
      socketChunkSize,
      fullPageInitialization,
    } = opts;

    this.bundleId = bundleId;
    this.additionalBundleIds = additionalBundleIds;
    this.platformVersion = platformVersion;
    this.isSafari = isSafari;
    this.includeSafari = includeSafari;
    this.useNewSafari = useNewSafari;
    this.pageLoadMs = pageLoadMs;
    log.debug(`useNewSafari --> ${this.useNewSafari}`);

    this.garbageCollectOnExecute = garbageCollectOnExecute;

    this.host = host;
    this.port = port;
    this.socketPath = socketPath;
    this.remoteDebugProxy = remoteDebugProxy;
    this.pageReadyTimeout = pageReadyTimeout;

    this.logAllCommunication = _.isNil(logAllCommunication) ? !!logFullResponse : !!logAllCommunication;
    this.logAllCommunicationHexDump = logAllCommunicationHexDump;
    this.socketChunkSize = socketChunkSize;

    this.fullPageInitialization = fullPageInitialization;

    this.skippedApps = [];

    this._lock = new AsyncLock();
  }

  setup () {
    // app handling configuration
    this.appDict = {};
    this.appIdKey = null;
    this.pageIdKey = null;
    this.pageLoading = false;
    this._navigatingToPage = false;
    this.allowNavigationWithoutReload = false;

    this.rpcClient = null;
    this._clientEventListeners = {};
  }

  teardown () {
    log.debug('Cleaning up listeners');

    this.appDict = {};
    this.appIdKey = null;
    this.pageIdKey = null;
    this.pageLoading = false;

    this.rpcClient = null;

    this.removeAllListeners(RemoteDebugger.EVENT_PAGE_CHANGE);
    this.removeAllListeners(RemoteDebugger.EVENT_DISCONNECT);
  }

  initRpcClient () {
    this.rpcClient = new RpcClientSimulator({
      bundleId: this.bundleId,
      platformVersion: this.platformVersion,
      isSafari: this.isSafari,
      host: this.host,
      port: this.port,
      socketPath: this.socketPath,
      messageProxy: this.remoteDebugProxy,
      logAllCommunication: this.logAllCommunication,
      logAllCommunicationHexDump: this.logAllCommunicationHexDump,
      fullPageInitialization: this.fullPageInitialization,
    });
  }

  async connect (timeout = APP_CONNECT_TIMEOUT_MS) {
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
    this.rpcClient.on('pageLoad', this.pageLoad.bind(this));
    this.rpcClient.on('Page.frameDetached', this.frameDetached.bind(this));

    await this.rpcClient.connect();

    // get the connection information about the app
    try {
      await this.setConnectionKey();
      if (timeout) {
        log.debug(`Waiting up to ${timeout}ms for applications to be reported`);
        try {
          await waitForCondition(() => {
            return !_.isEmpty(this.appDict);
          }, {
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

  async disconnect () {
    if (this.rpcClient) {
      await this.rpcClient.disconnect();
    }
    this.emit(RemoteDebugger.EVENT_DISCONNECT, true);
    this.teardown();
  }

  get isConnected () {
    return !!this.rpcClient?.isConnected;
  }

  async setConnectionKey () {
    log.debug('Sending connection key request');
    // send but only wait to make sure the socket worked
    // as response from Web Inspector can take a long time
    await this.rpcClient.send('setConnectionKey', {}, false);
  }

  updateAppsWithDict (dict) {
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

  logApplicationDictionary (apps) {
    function getValueString (key, value) {
      if (_.isFunction(value)) {
        return '[Function]';
      }
      if (key === 'pageArray' && !_.isArray(value)) {
        return `'Waiting for data'`;
      }
      return JSON.stringify(value);
    }
    log.debug('Current applications available:');
    for (const [app, info] of _.toPairs(apps)) {
      log.debug(`    Application: '${app}'`);
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

  async selectApp (currentUrl = null, maxTries = SELECT_APP_RETRIES, ignoreAboutBlankUrl = false) {
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

      this.logApplicationDictionary(this.appDict);

      // translate the dictionary into a useful form, and return to sender
      const pageArray = _.isEmpty(this.appDict[appIdKey].pageArray)
        ? pageArrayFromDict(pageDict)
        : this.appDict[appIdKey].pageArray;
      log.debug(`Finally selecting app ${this.appIdKey}: ${simpleStringify(pageArray)}`);

      let fullPageArray = [];
      for (const [app, info] of _.toPairs(this.appDict)) {
        if (!_.isArray(info.pageArray) || info.isActive === ACTIVE_APP_CODE) {
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

  async searchForApp (currentUrl, maxTries, ignoreAboutBlankUrl) {
    const bundleIds = this.includeSafari && !this.isSafari
      ? [this.bundleId, ...this.additionalBundleIds, SAFARI_BUNDLE_ID]
      : [this.bundleId, ...this.additionalBundleIds];
    try {
      return await retryInterval(maxTries, SELECT_APP_RETRY_SLEEP_MS, async (retryCount) => {
        this.logApplicationDictionary(this.appDict);
        const possibleAppIds = getPossibleDebuggerAppKeys(bundleIds, this.appDict);
        log.debug(`Trying out the possible app ids: ${possibleAppIds.join(', ')} (try #${retryCount + 1} of ${maxTries})`);
        for (const attemptedAppIdKey of possibleAppIds) {
          try {
            if (this.appDict[attemptedAppIdKey].isActive === ACTIVE_APP_CODE) {
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

  searchForPage (appsDict, currentUrl = null, ignoreAboutBlankUrl = false) {
    for (const appDict of _.values(appsDict)) {
      if (!appDict || appDict.isActive === ACTIVE_APP_CODE || !appDict.pageArray || appDict.pageArray.promise) {
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

  async selectPage (appIdKey, pageIdKey, skipReadyCheck = false) {
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

  async executeAtom (atom, args, frames) {
    if (!this.rpcClient.isConnected) {
      throw new Error('Remote debugger is not connected');
    }

    log.debug(`Executing atom '${atom}'`);
    const script = await getScriptForAtom(atom, args, frames);
    const value = await this.execute(script, true);
    log.debug(`Received result for atom '${atom}' execution: ${_.truncate(simpleStringify(value), {length: RESPONSE_LOG_LENGTH})}`);
    return value;
  }

  async executeAtomAsync (atom, args, frames) {
    // helper to send directly to the web inspector
    const evaluate = async (method, opts) => {
      return await this.rpcClient.send(method, {
        ...opts,
        appIdKey: this.appIdKey,
        pageIdKey: this.pageIdKey,
        returnByValue: false,
      });
    };

    // first create a Promise on the page, saving the resolve/reject functions
    // as properties
    const promiseName = `appiumAsyncExecutePromise${UUID.create().toString().replace(/-/g, '')}`;
    const script =
      `var res, rej;
      window.${promiseName} = new Promise(function (resolve, reject) {
        res = resolve;
        rej = reject;
      });
      window.${promiseName}.resolve = res;
      window.${promiseName}.reject = rej;
      window.${promiseName};`;
    const obj = await evaluate('Runtime.evaluate', {command: script});
    const promiseObjectId = obj.result.objectId;

    // execute the atom, calling back to the resolve function
    const asyncCallBack =
      `function (res) {
        window.${promiseName}.resolve(res);
        window.${promiseName}Value = res;
      }`;
    await this.execute(await getScriptForAtom(atom, args, frames, asyncCallBack));

    // wait for the promise to be resolved
    let res;
    const subcommandTimeout = 1000; // timeout on individual commands
    try {
      res = await evaluate('Runtime.awaitPromise', {promiseObjectId});
    } catch (err) {
      if (!err.message.includes(`'Runtime.awaitPromise' was not found`)) {
        throw err;
      }
      // awaitPromise is not always available, so simulate it with poll
      const retryWait = 100;
      const timeout = (args.length >= 3) ? args[2] : RPC_RESPONSE_TIMEOUT_MS;
      // if the timeout math turns up 0 retries, make sure it happens once
      const retries = parseInt(timeout / retryWait, 10) || 1;
      const timer = new timing.Timer().start();
      log.debug(`Waiting up to ${timeout}ms for async execute to finish`);
      res = await retryInterval(retries, retryWait, async () => {
        // the atom _will_ return, either because it finished or an error
        // including a timeout error
        const hasValue = await evaluate('Runtime.evaluate', {
          command: `window.hasOwnProperty('${promiseName}Value');`,
        });
        if (hasValue) {
          // we only put the property on `window` when the callback is called,
          // so if it is there, everything is done
          return await evaluate('Runtime.evaluate', {
            command: `window.${promiseName}Value;`,
          });
        }
        // throw a TimeoutError, or else it needs to be caught and re-thrown
        throw new errors.TimeoutError(`Timed out waiting for asynchronous script ` +
                                      `result after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms'));`);
      });
    } finally {
      try {
        // try to get rid of the promise
        await this.executeAtom('execute_script', [`delete window.${promiseName};`, [null, null], subcommandTimeout], frames);
      } catch (ign) {}
    }
    return convertResult(res);
  }

  frameDetached () {
    this.emit(RemoteDebugger.EVENT_FRAMES_DETACHED);
  }

  async pageLoad (startPageLoadMs, pageLoadVerifyHook) {
    let timeoutMs = 500;
    let start = startPageLoadMs || Date.now();

    log.debug('Page loaded, verifying whether ready');
    this.pageLoading = true;

    const verify = async () => {
      this.pageLoadDelay = util.cancellableDelay(timeoutMs);
      try {
        await this.pageLoadDelay;
      } catch (err) {
        if (err instanceof B.CancellationError) {
          // if the promise has been cancelled
          // we want to skip checking the readiness
          return;
        }
      }

      // we can get this called in the middle of trying to find a new app
      if (!this.appIdKey) {
        log.debug('Not connected to an application. Ignoring page load');
        return;
      }

      if (_.isFunction(pageLoadVerifyHook)) {
        await pageLoadVerifyHook();
      }

      const ready = await this.checkPageIsReady();

      // if we are ready, or we've spend too much time on this
      if (ready || (this.pageLoadMs > 0 && (start + this.pageLoadMs) < Date.now())) {
        log.debug('Page is ready');
        this.pageLoading = false;
      } else {
        log.debug('Page was not ready, retrying');
        await verify();
      }
    };
    await verify();
  }

  cancelPageLoad () {
    log.debug('Unregistering from page readiness notifications');
    this.pageLoading = false;
    if (this.pageLoadDelay) {
      this.pageLoadDelay.cancel();
    }
  }

  async pageUnload () {
    log.debug('Page unloading');
    await this.waitForDom();
  }

  async waitForDom (startPageLoadMs, pageLoadVerifyHook) {
    log.debug('Waiting for dom...');
    await this.pageLoad(startPageLoadMs, pageLoadVerifyHook);
  }

  async checkPageIsReady () {
    const errors = checkParams({appIdKey: this.appIdKey});
    if (errors) throw new Error(errors); // eslint-disable-line curly

    log.debug('Checking document readyState');
    const readyCmd = 'document.readyState;';
    let readyState = 'loading';
    try {
      readyState = await B.resolve(this.execute(readyCmd, true)).timeout(this.pageReadyTimeout);
    } catch (err) {
      if (!(err instanceof B.TimeoutError)) {
        throw err;
      }
      log.debug(`Page readiness check timed out after ${this.pageReadyTimeout}ms`);
      return false;
    }
    log.debug(`Document readyState is '${readyState}'`);

    return readyState === 'complete';
  }

  async launchSafari () {
    await this.rpcClient.send('launchApplication', {
      bundleId: SAFARI_BUNDLE_ID
    });
  }

  async navToUrl (url, pageLoadVerifyHook) {
    const errors = checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});
    if (errors) {
      throw new Error(errors);
    }

    this._navigatingToPage = true;

    try {
      log.debug(`Navigating to new URL: '${url}'`);

      // begin listening for frame navigation event, which will be waited for later
      const waitForFramePromise = this.waitForFrameNavigated();

      await this.rpcClient.send('Page.navigate', {
        url,
        appIdKey: this.appIdKey,
        pageIdKey: this.pageIdKey,
      });

      if (!this.useNewSafari) {
        // a small pause for the browser to catch up
        await B.delay(1000);
      }

      // wait until the page has been navigated
      await waitForFramePromise;

      await this.waitForDom(Date.now(), pageLoadVerifyHook);

      // enable console logging, so we get the events (otherwise we only
      // get notified when navigating to a local page
      await this.rpcClient.send('Console.enable', {
        appIdKey: this.appIdKey,
        pageIdKey: this.pageIdKey,
      });
    } finally {
      this._navigatingToPage = false;
    }
  }

  async waitForFrameNavigated () {
    let navEventListener;
    return await new B(async (resolve) => {
      log.debug('Waiting for frame navigated message...');
      let startMs = Date.now();

      // add a handler for the `Page.frameNavigated` message
      // from the remote debugger
      navEventListener = (err, value) => {
        log.debug(`Frame navigated in ${((Date.now() - startMs) / 1000)}s from: ${value}`);
        if (!this.allowNavigationWithoutReload && !this.pageLoading) {
          resolve(value);
        } else {
          log.debug('Frame navigated but we were warned about it, not ' +
                    'considering page state unloaded');
          this.allowNavigationWithoutReload = false;
        }
        if (this.navigationDelay) {
          this.navigationDelay.cancel();
        }
      };

      this.rpcClient.once('Page.frameNavigated', navEventListener);

      // timeout, in case remote debugger doesn't respond,
      // or takes a long time
      if (!this.useNewSafari || this.pageLoadMs >= 0) {
        // use pageLoadMs, or a small amount of time
        const timeout = this.useNewSafari ? this.pageLoadMs : 500;
        this.navigationDelay = util.cancellableDelay(timeout);
        try {
          await this.navigationDelay;
          navEventListener(null, `${timeout}ms timeout`);
        } catch (err) {
          // nothing to do: we only get here if the remote debugger
          // already notified of frame navigation, and the delay
          // was cancelled
        }
      }
    }).finally(() => {
      if (navEventListener) {
        this.rpcClient.off('Page.frameNavigated', navEventListener);
      }
    });
  }

  async startTimeline (fn) {
    log.debug('Starting to record the timeline');
    this.rpcClient.on('Timeline.eventRecorded', fn);
    return await this.rpcClient.send('startTimeline', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });
  }

  async stopTimeline () {
    log.debug('Stopping to record the timeline');
    await this.rpcClient.send('Timeline.stop', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });
  }

  /*
   * Keep track of the client event listeners so they can be removed
   */
  addClientEventListener (eventName, listener) {
    this._clientEventListeners[eventName] = this._clientEventListeners[eventName] || [];
    this._clientEventListeners[eventName].push(listener);
    this.rpcClient.on(eventName, listener);
  }

  removeClientEventListener (eventName) {
    for (const listener of (this._clientEventListeners[eventName] || [])) {
      this.rpcClient.off(eventName, listener);
    }
  }

  startConsole (listener) {
    log.debug('Starting to listen for JavaScript console');
    this.addClientEventListener('Console.messageAdded', listener);
    this.addClientEventListener('Console.messageRepeatCountUpdated', listener);
  }

  stopConsole () {
    log.debug('Stopping to listen for JavaScript console');
    this.removeClientEventListener('Console.messageAdded');
    this.removeClientEventListener('Console.messageRepeatCountUpdated');
  }

  startNetwork (listener) {
    log.debug('Starting to listen for network events');
    this.addClientEventListener('NetworkEvent', listener);
  }

  stopNetwork () {
    log.debug('Stopping to listen for network events');
    this.removeClientEventListener('NetworkEvent');
  }

  async execute (command, override) {
    // if the page is not loaded yet, wait for it
    if (this.pageLoading && !override) {
      log.debug('Trying to execute but page is not loaded.');
      await this.waitForDom();
    }

    const errors = checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});
    if (errors) {
      throw new Error(errors);
    }

    if (this.garbageCollectOnExecute) {
      await this.garbageCollect();
    }

    log.debug(`Sending javascript command: '${_.truncate(command, {length: 50})}'`);
    const res = await this.rpcClient.send('Runtime.evaluate', {
      command,
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });

    return convertResult(res);
  }

  async callFunction (objId, fn, args) {
    let errors = checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});
    if (errors) throw new Error(errors); // eslint-disable-line curly

    if (this.garbageCollectOnExecute) {
      await this.garbageCollect();
    }

    log.debug('Calling javascript function');
    const res = await this.rpcClient.send('Runtime.callFunctionOn', {
      objId,
      fn,
      args,
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });

    return convertResult(res);
  }

  set allowNavigationWithoutReload (allow) {
    this._allowNavigationWithoutReload = allow;
  }

  get allowNavigationWithoutReload () {
    return this._allowNavigationWithoutReload;
  }

  async getCookies (urls) {
    log.debug('Getting network cookies');
    return await this.rpcClient.send('Page.getCookies', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      urls,
    });
  }

  async deleteCookie (cookieName, url) {
    log.debug(`Deleting cookie '${cookieName}' on '${url}'`);
    return await this.rpcClient.send('Page.deleteCookie', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      cookieName,
      url,
    });
  }

  async garbageCollect (timeoutMs = GARBAGE_COLLECT_TIMEOUT) {
    log.debug(`Garbage collecting with ${timeoutMs}ms timeout`);
    const errors = checkParams({
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });
    if (errors) {
      log.debug(`Unable to collect garbage at this time`);
      return;
    }

    await B.resolve(this.rpcClient.send('Heap.gc', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    })).timeout(timeoutMs)
    .then(function gcSuccess () { // eslint-disable-line promise/prefer-await-to-then
      log.debug(`Garbage collection successful`);
    }).catch(function gcError (err) { // eslint-disable-line promise/prefer-await-to-callbacks
      if (err instanceof B.TimeoutError) {
        log.debug(`Garbage collection timed out after ${timeoutMs}ms`);
      } else {
        log.debug(`Unable to collect garbage: ${err.message}`);
      }
    });
  }

  async useAppDictLock (fn) {
    return await this._lock.acquire('appDict', fn);
  }
}

// event emitted publically
RemoteDebugger.EVENT_PAGE_CHANGE = 'remote_debugger_page_change';
RemoteDebugger.EVENT_FRAMES_DETACHED = 'remote_debugger_frames_detached';
RemoteDebugger.EVENT_DISCONNECT = 'remote_debugger_disconnect';

// add generic callbacks
for (const [name, handler] of _.toPairs(messageHandlers)) {
  RemoteDebugger.prototype[name] = handler;
}

export default RemoteDebugger;
export {
  RemoteDebugger, REMOTE_DEBUGGER_PORT, RPC_RESPONSE_TIMEOUT_MS,
};
