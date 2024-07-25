import { EventEmitter } from 'events';
import defaultLog from './logger';
import { RpcClientSimulator } from './rpc';
import { getModuleProperties } from './utils';
import * as connectMixins from './mixins/connect';
import * as executeMixins from './mixins/execute';
import * as messageHandlerMixins from './mixins/message-handlers';
import * as navigationMixins from './mixins/navigate';
import * as cookieMixins from './mixins/cookies';
import * as screenshotMixins from './mixins/screenshot';
import * as eventMixins from './mixins/events';
import * as miscellaneousMixins from './mixins/misc';
import _ from 'lodash';
import AsyncLock from 'async-lock';

export const REMOTE_DEBUGGER_PORT = 27753;
/* How many milliseconds to wait for webkit to return a response before timing out */
export const RPC_RESPONSE_TIMEOUT_MS = 5000;
const PAGE_READY_TIMEOUT_MS = 5000;
const { version: MODULE_VERSION } = getModuleProperties();


export class RemoteDebugger extends EventEmitter {
  // properties
  /** @type {string[]|undefined} */
  _skippedApps;
  /** @type {Record<string, any>} */
  _clientEventListeners;
  /** @type {Record<string, any>} */
  appDict;
  /** @type {string|null|undefined} */
  appIdKey;
  /** @type {string|number|null|undefined} */
  pageIdKey;
  /** @type {Record<string, any>[]|undefined} */
  connectedDrivers;
  /** @type {Record<string, any>[]|undefined} */
  currentState;
  /** @type {boolean|undefined} */
  connected;
  /** @type {import('bluebird')<void>} */
  pageLoadDelay;
  /** @type {import('bluebird')<void>} */
  navigationDelay;
  /** @type {import('./rpc/rpc-client').RpcClient?} */
  rpcClient;
  /** @type {string|undefined} */
  pageLoadStrategy;
  /** @type {import('@appium/types').AppiumLogger} */
  _log;

  // events
  /** @type {string} */
  static EVENT_PAGE_CHANGE;
  /** @type {string} */
  static EVENT_DISCONNECT;
  /** @type {string} */
  static EVENT_FRAMES_DETACHED;

  // methods
  setConnectionKey = connectMixins.setConnectionKey;
  disconnect = connectMixins.disconnect;
  searchForApp = connectMixins.searchForApp;
  searchForPage = connectMixins.searchForPage;
  checkPageIsReady = navigationMixins.checkPageIsReady;
  cancelPageLoad = navigationMixins.cancelPageLoad;
  waitForDom = navigationMixins.waitForDom;
  execute = executeMixins.execute;
  executeAtom = executeMixins.executeAtom;
  executeAtomAsync = executeMixins.executeAtomAsync;
  isPageLoadingCompleted = navigationMixins.isPageLoadingCompleted;
  selectApp = connectMixins.selectApp;
  connect = connectMixins.connect;
  selectPage = connectMixins.selectPage;
  navToUrl = navigationMixins.navToUrl;
  getCookies = cookieMixins.getCookies;
  setCookie = cookieMixins.setCookie;
  deleteCookie = cookieMixins.deleteCookie;
  captureScreenshot = screenshotMixins.captureScreenshot;
  addClientEventListener = eventMixins.addClientEventListener;
  removeClientEventListener = eventMixins.removeClientEventListener;
  launchSafari = miscellaneousMixins.launchSafari;
  startTimeline = miscellaneousMixins.startTimeline;
  stopTimeline = miscellaneousMixins.stopTimeline;
  startConsole = miscellaneousMixins.startConsole;
  stopConsole = miscellaneousMixins.stopConsole;
  startNetwork = miscellaneousMixins.startNetwork;
  stopNetwork = miscellaneousMixins.stopNetwork;
  overrideUserAgent = miscellaneousMixins.overrideUserAgent;
  garbageCollect = miscellaneousMixins.garbageCollect;

  // Callbacks
  onPageChange = messageHandlerMixins.onPageChange;
  onConnectedApplicationList = messageHandlerMixins.onConnectedApplicationList;
  onAppConnect = messageHandlerMixins.onAppConnect;
  onAppDisconnect = messageHandlerMixins.onAppDisconnect;
  onAppUpdate = messageHandlerMixins.onAppUpdate;
  onConnectedDriverList = messageHandlerMixins.onConnectedDriverList;
  onCurrentState = messageHandlerMixins.onCurrentState;
  frameDetached = navigationMixins.frameDetached;

  /**
   * @param {RemoteDebuggerOptions} opts
   */
  constructor (opts = {}) {
    super();

    // @ts-ignore This is OK
    this._log = opts.log ?? defaultLog;
    this.log.info(`Remote Debugger version ${MODULE_VERSION}`);

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
      pageReadyTimeout = PAGE_READY_TIMEOUT_MS,
      remoteDebugProxy,
      garbageCollectOnExecute = false,
      logFullResponse = false,
      logAllCommunication = false,
      logAllCommunicationHexDump = false,
      webInspectorMaxFrameLength,
      socketChunkSize,
      fullPageInitialization,
      pageLoadStrategy,
    } = opts;

    this.bundleId = bundleId;
    this.additionalBundleIds = additionalBundleIds;
    this.platformVersion = platformVersion;
    this.isSafari = isSafari;
    this.includeSafari = includeSafari;
    this.useNewSafari = useNewSafari;
    this.pageLoadMs = pageLoadMs;
    this.log.debug(`useNewSafari --> ${this.useNewSafari}`);

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

  /**
   * @returns {import('@appium/types').AppiumLogger}
   */
  get log() {
    return this._log;
  }

  /**
   * @param {boolean} [checkConnected=false]
   * @returns {import('./rpc/rpc-client').RpcClient}
   */
  requireRpcClient(checkConnected = false) {
    if (!this.rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }
    if (checkConnected && !this.rpcClient.isConnected) {
      throw new Error('Remote debugger is not connected');
    }
    return this.rpcClient;
  }

  /**
   * @returns {void}
   */
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

  /**
   * @returns {void}
   */
  teardown () {
    this.log.debug('Cleaning up listeners');

    this.appDict = {};
    this.appIdKey = null;
    this.pageIdKey = null;
    this.pageLoading = false;

    this.rpcClient = null;

    this.removeAllListeners(RemoteDebugger.EVENT_PAGE_CHANGE);
    this.removeAllListeners(RemoteDebugger.EVENT_DISCONNECT);
  }

  /**
   * @returns {void}
   */
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

  /**
   * @returns {boolean}
   */
  get isConnected () {
    return !!this.rpcClient?.isConnected;
  }

  /**
   * @param {boolean} allow
   */
  set allowNavigationWithoutReload (allow) {
    this._allowNavigationWithoutReload = allow;
  }

  /**
   * @returns {boolean}
   */
  get allowNavigationWithoutReload () {
    return !!this._allowNavigationWithoutReload;
  }

  /**
   * @returns {string[]}
   */
  get skippedApps () {
    return this._skippedApps ?? [];
  }
}

for (const [name, event] of _.toPairs(eventMixins.events)) {
  RemoteDebugger[name] = event;
}

export default RemoteDebugger;

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
 * @property {import('@appium/types').AppiumLogger} [log]
 */
