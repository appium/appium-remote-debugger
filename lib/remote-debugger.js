import { EventEmitter } from 'events';
import log from './logger';
import { RpcClientSimulator } from './rpc';
import { checkParams, getModuleRoot } from './utils';
import { mixins, events } from './mixins';
import _ from 'lodash';
import B from 'bluebird';
import path from 'path';
import AsyncLock from 'async-lock';

const REMOTE_DEBUGGER_PORT = 27753;
const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';

/* How many milliseconds to wait for webkit to return a response before timing out */
const RPC_RESPONSE_TIMEOUT_MS = 5000;

const PAGE_READY_TIMEOUT = 5000;

const GARBAGE_COLLECT_TIMEOUT = 5000;


class RemoteDebugger extends EventEmitter {
  // properties
  /** @type {any[]|undefined} */
  _skippedApps;
  /** @type {Record<string, any>} */
  _clientEventListeners;
  /** @type {Record<string, any>} */
  appDict;
  /** @type {Record<string, any>[]|undefined} */
  connectedDrivers;
  /** @type {Record<string, any>[]|undefined} */
  currentState;
  /** @type {boolean|undefined} */
  connected;
  /** @type {B<void>} */
  pageLoadDelay;
  /** @type {B<void>} */
  navigationDelay;
  /** @type {import('./rpc/rpc-client').default?} */
  rpcClient;
  /** @type {string|undefined} */
  pageLoadStrategy;

  // events
  /** @type {string} */
  static EVENT_PAGE_CHANGE;
  /** @type {string} */
  static EVENT_DISCONNECT;
  /** @type {string} */
  static EVENT_FRAMES_DETACHED;

  // methods
  /** @type {() => Promise<void>} */
  setConnectionKey;
  /** @type {() => Promise<void>} */
  disconnect;
  /** @type {(currentUrl: string?, maxTries: number, ignoreAboutBlankUrl: boolean) => Promise<Record<string, any>>} */
  searchForApp;
  /** @type {(appsDict:Record<string, any>, currentUrl: string?, ignoreAboutBlankUrl: boolean) => import('./mixins/connect').AppPages?} */
  searchForPage;
  /** @type {(timeoutMs?: number) => Promise<boolean>} */
  checkPageIsReady;
  /** @type {(dict: Record<string, any>) => void} */
  updateAppsWithDict;
  /** @type {(startPageLoadTimer?: import('@appium/support').timing.Timer) => Promise<void>} */
  waitForDom;
  /** @type {(command: string, override?: boolean) => Promise<any>} */
  execute;
  /** @type {(command: string, args?: any[], frames?: string[]) => Promise<any>} */
  executeAtom;
  /** @type {(readyState: string) => boolean} */
  isPageLoadingCompleted;

  // Callbacks
  /** @type {(err: Error?, appIdKey: string, pageDict: Record<string, any>) => Promise<void>} */
  onPageChange;
  /** @type {(err: Error?, apps: Record<string, any>) => Promise<void>} */
  onConnectedApplicationList;
  /** @type {(err: Error?, dict: Record<string, any>) => Promise<void>} */
  onAppConnect;
  /** @type {(err: Error?, dict: Record<string, any>) => void} */
  onAppDisconnect;
  /** @type {(err: Error?, dict: Record<string, any>) => Promise<void>} */
  onAppUpdate;
  /** @type {(err: Error?, drivers: Record<string, any>) => void} */
  onConnectedDriverList;
  /** @type {(err: Error?, state: Record<string, any>) => void} */
  onCurrentState;
  /** @type {(err: Error?, state: Record<string, any>) => void} */
  frameDetached;

  /**
   * @typedef {Object} RemoteDebuggerOptions
   * @property {string} [bundleId] id of the app being connected to
   * @property {string[]} [additionalBundleIds=[]] array of possible bundle
   *                      ids that the inspector could return
   * @property {string} [platformVersion] version of iOS
   * @property {boolean} [isSafari=true]
   * @property {boolean} [includeSafari=false]
   * @property {boolean} [useNewSafari=false] for web inspector, whether this is a new Safari instance
   * @property {number} [pageLoadMs] the time, in ms, that should be waited for page loading
   * @property {string} [host] the remote debugger's host address
   * @property {number} [port=REMOTE_DEBUGGER_PORT] the remote debugger port through which to communicate
   * @property {string} [socketPath]
   * @property {number} [pageReadyTimeout=PAGE_READY_TIMEOUT]
   * @property {string} [remoteDebugProxy]
   * @property {boolean} [garbageCollectOnExecute=false]
   * @property {boolean} [logFullResponse=false]
   * @property {boolean} [logAllCommunication=false] log plists sent and received from Web Inspector
   * @property {boolean} [logAllCommunicationHexDump=false] log communication from Web Inspector as hex dump
   * @property {number} [webInspectorMaxFrameLength] The maximum size in bytes of a single data
   *                    frame in the device communication protocol
   * @property {number} [socketChunkSize] size, in bytes, of chunks of data sent to
   *                    Web Inspector (real device only)
   * @property {boolean} [fullPageInitialization]
   * @property {string} [pageLoadStrategy]
   */

  /**
   * @param {RemoteDebuggerOptions} opts
   */
  constructor (opts = {}) {
    super();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    log.info(`Remote Debugger version ${require(path.resolve(getModuleRoot(), 'package.json')).version}`);

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
      webInspectorMaxFrameLength,
      socketChunkSize,
      fullPageInitialization,
      pageLoadStrategy
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

    if (_.isInteger(webInspectorMaxFrameLength)) {
      this.webInspectorMaxFrameLength = webInspectorMaxFrameLength;
    }

    this.fullPageInitialization = fullPageInitialization;

    this.pageLoadStrategy = pageLoadStrategy;

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
      webInspectorMaxFrameLength: this.webInspectorMaxFrameLength,
    });
  }

  get isConnected () {
    return !!this.rpcClient?.isConnected;
  }

  async launchSafari () {
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

    await this.rpcClient.send('launchApplication', {
      bundleId: SAFARI_BUNDLE_ID
    });
  }

  async startTimeline (fn) {
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

    log.debug('Starting to record the timeline');
    this.rpcClient.on('Timeline.eventRecorded', fn);
    return await this.rpcClient.send('Timeline.start', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });
  }

  async stopTimeline () {
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

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
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

    this._clientEventListeners[eventName] = this._clientEventListeners[eventName] || [];
    this._clientEventListeners[eventName].push(listener);
    this.rpcClient.on(eventName, listener);
  }

  removeClientEventListener (eventName) {
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

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

  set allowNavigationWithoutReload (allow) {
    this._allowNavigationWithoutReload = allow;
  }

  get allowNavigationWithoutReload () {
    return this._allowNavigationWithoutReload;
  }

  // Potentially this does not work for mobile safari
  async overrideUserAgent (value) {
    log.debug('Setting overrideUserAgent');
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

    return await this.rpcClient.send('Page.overrideUserAgent', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      value
    });
  }

  /**
   * Capture a rect of the page or by default the viewport
   * @param {{rect: import('@appium/types').Rect?, coordinateSystem: "Viewport"|"Page"}} [opts={rect: null, coordinateSystem: 'Viewport'}]
   * if rect is null capture the whole coordinate system else capture the rect in the given coordinateSystem
   * @returns {Promise<string>} a base64 encoded string of the screenshot
   */
  async captureScreenshot(opts) {
    const {rect = null, coordinateSystem = 'Viewport'} = opts ?? {};
    log.debug('Capturing screenshot');
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

    const arect = rect ?? /** @type {import('@appium/types').Rect} */ (await this.executeAtom(
      'execute_script',
      ['return {x: 0, y: 0, width: window.innerWidth, height: window.innerHeight}', []]
    ));
    const response = await this.rpcClient.send('Page.snapshotRect', {
      ...arect,
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      coordinateSystem,
    });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.dataURL.replace(/^data:image\/png;base64,/, '');
  }

  async getCookies () {
    log.debug('Getting cookies');
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

    return await this.rpcClient.send('Page.getCookies', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey
    });
  }

  async setCookie (cookie) {
    log.debug('Setting cookie');
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

    return await this.rpcClient.send('Page.setCookie', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      cookie
    });
  }

  async deleteCookie (cookieName, url) {
    log.debug(`Deleting cookie '${cookieName}' on '${url}'`);
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

    return await this.rpcClient.send('Page.deleteCookie', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      cookieName,
      url,
    });
  }

  async garbageCollect (timeoutMs = GARBAGE_COLLECT_TIMEOUT) {
    log.debug(`Garbage collecting with ${timeoutMs}ms timeout`);
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }

    try {
      checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});
    } catch (err) {
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

  get skippedApps () {
    return this._skippedApps || [];
  }
}

for (const [name, fn] of _.toPairs(mixins)) {
  RemoteDebugger.prototype[name] = fn;
}

for (const [name, event] of _.toPairs(events)) {
  RemoteDebugger[name] = event;
}

export default RemoteDebugger;
export {
  RemoteDebugger, REMOTE_DEBUGGER_PORT, RPC_RESPONSE_TIMEOUT_MS,
};
