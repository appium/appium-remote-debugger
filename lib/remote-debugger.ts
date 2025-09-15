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
import type {
  RemoteDebuggerOptions,
  AppDict,
  EventListener,
  PageIdKey,
  AppIdKey,
} from './types';
import type { AppiumLogger, StringRecord } from '@appium/types';
import type { RpcClient } from './rpc/rpc-client';
import type B from 'bluebird';


export const REMOTE_DEBUGGER_PORT = 27753;
const PAGE_READY_TIMEOUT_MS = 5000;
const { version: MODULE_VERSION } = getModuleProperties();


export class RemoteDebugger extends EventEmitter {
  protected _skippedApps: string[];
  protected _clientEventListeners: StringRecord<EventListener[]>;
  protected _appDict: AppDict;
  protected _appIdKey?: AppIdKey;
  protected _pageIdKey?: PageIdKey;
  protected _connectedDrivers?: StringRecord[];
  protected _currentState?: string;
  protected _pageLoadDelay?: B<void>;
  protected _rpcClient: RpcClient | null;
  protected _pageLoading: boolean;
  protected _navigatingToPage: boolean;
  protected _allowNavigationWithoutReload: boolean;
  protected _pageLoadMs?: number;
  protected readonly _pageLoadStrategy?: string;
  protected readonly _log: AppiumLogger;
  protected readonly _bundleId?: string;
  protected readonly _additionalBundleIds?: string[];
  protected readonly _platformVersion?: string;
  protected readonly _isSafari: boolean;
  protected readonly _includeSafari: boolean;
  protected readonly _garbageCollectOnExecute: boolean;
  protected readonly _host?: string;
  protected readonly _port?: number;
  protected readonly _socketPath?: string;
  protected readonly _remoteDebugProxy?: any;
  protected readonly _pageReadyTimeout: number;
  protected readonly _logAllCommunication: boolean;
  protected readonly _logAllCommunicationHexDump: boolean;
  protected readonly _socketChunkSize?: number;
  protected readonly _webInspectorMaxFrameLength?: number;
  protected readonly _fullPageInitialization?: boolean;

  // events
  static readonly EVENT_PAGE_CHANGE: string;
  static readonly EVENT_DISCONNECT: string;
  static readonly EVENT_FRAMES_DETACHED: string;

  // methods
  setConnectionKey = connectMixins.setConnectionKey;
  disconnect = connectMixins.disconnect;
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
  startConsole = eventMixins.startConsole;
  stopConsole = eventMixins.stopConsole;
  startNetwork = eventMixins.startNetwork;
  stopNetwork = eventMixins.stopNetwork;
  launchSafari = miscellaneousMixins.launchSafari;
  startTimeline = miscellaneousMixins.startTimeline;
  stopTimeline = miscellaneousMixins.stopTimeline;
  overrideUserAgent = miscellaneousMixins.overrideUserAgent;
  garbageCollect = miscellaneousMixins.garbageCollect;
  isJavascriptExecutionBlocked = miscellaneousMixins.isJavascriptExecutionBlocked;

  // Callbacks
  onPageChange = messageHandlerMixins.onPageChange;
  onConnectedApplicationList = messageHandlerMixins.onConnectedApplicationList;
  onAppConnect = messageHandlerMixins.onAppConnect;
  onAppDisconnect = messageHandlerMixins.onAppDisconnect;
  onAppUpdate = messageHandlerMixins.onAppUpdate;
  onConnectedDriverList = messageHandlerMixins.onConnectedDriverList;
  onCurrentState = messageHandlerMixins.onCurrentState;
  frameDetached = navigationMixins.frameDetached;

  constructor (opts: RemoteDebuggerOptions = {}) {
    super();

    this._log = opts.log ?? defaultLog;
    this.log.info(`Remote Debugger version ${MODULE_VERSION}`);

    const {
      bundleId,
      additionalBundleIds = [],
      platformVersion,
      isSafari = true,
      includeSafari = false,
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

    this._bundleId = bundleId;
    this._additionalBundleIds = additionalBundleIds;
    this._platformVersion = platformVersion;
    this._isSafari = isSafari;
    this._includeSafari = includeSafari;
    this._pageLoadMs = pageLoadMs;
    this._allowNavigationWithoutReload = false;

    this._garbageCollectOnExecute = garbageCollectOnExecute;

    this._host = host;
    this._port = port;
    this._socketPath = socketPath;
    this._remoteDebugProxy = remoteDebugProxy;
    this._pageReadyTimeout = pageReadyTimeout;

    this._logAllCommunication = _.isNil(logAllCommunication) ? !!logFullResponse : !!logAllCommunication;
    this._logAllCommunicationHexDump = logAllCommunicationHexDump;
    this._socketChunkSize = socketChunkSize;

    if (_.isInteger(webInspectorMaxFrameLength)) {
      this._webInspectorMaxFrameLength = webInspectorMaxFrameLength;
    }

    this._fullPageInitialization = fullPageInitialization;

    this._pageLoadStrategy = pageLoadStrategy;
    this._skippedApps = [];

    this.setup();
  }

  get log(): AppiumLogger {
    return this._log;
  }

  requireRpcClient(checkConnected: boolean = false): RpcClient {
    if (!this._rpcClient) {
      throw new Error(`rpcClient is undefined. Has 'initRpcClient' been called before?`);
    }
    if (checkConnected && !this._rpcClient.isConnected) {
      throw new Error('Remote debugger is not connected');
    }
    return this._rpcClient;
  }

  setup (): void {
    // app handling configuration
    this._appDict = {};
    this._appIdKey = undefined;
    this._pageIdKey = undefined;
    this._pageLoading = false;
    this._navigatingToPage = false;
    this._currentState = undefined;
    this._connectedDrivers = undefined;
    this._pageLoadDelay = undefined;

    this._rpcClient = null;
    this._clientEventListeners = {};
  }

  teardown (): void {
    this.log.debug('Cleaning up listeners');

    this._appDict = {};
    this._appIdKey = undefined;
    this._pageIdKey = undefined;
    this._pageLoading = false;

    this._rpcClient = null;

    for (const evt of [
      RemoteDebugger.EVENT_DISCONNECT,
      RemoteDebugger.EVENT_PAGE_CHANGE,
      RemoteDebugger.EVENT_FRAMES_DETACHED,
    ]) {
      this.removeAllListeners(evt);
    }
  }

  initRpcClient (): void {
    this._rpcClient = new RpcClientSimulator({
      bundleId: this._bundleId,
      platformVersion: this._platformVersion,
      isSafari: this._isSafari,
      host: this._host,
      port: this._port,
      socketPath: this._socketPath,
      messageProxy: this._remoteDebugProxy,
      logAllCommunication: this._logAllCommunication,
      logAllCommunicationHexDump: this._logAllCommunicationHexDump,
      fullPageInitialization: this._fullPageInitialization,
      webInspectorMaxFrameLength: this._webInspectorMaxFrameLength,
      pageLoadTimeoutMs: this._pageLoadMs,
    });
  }

  get isConnected (): boolean {
    return !!this._rpcClient?.isConnected;
  }

  // Only use this getter to read the appDict value.
  // Any changes to it don't mutate the original property
  // because the getter always returns the copy of it
  get appDict(): AppDict {
    return _.cloneDeep(this._appDict);
  }

  set allowNavigationWithoutReload (allow: boolean) {
    this._allowNavigationWithoutReload = allow;
  }

  get allowNavigationWithoutReload (): boolean {
    return !!this._allowNavigationWithoutReload;
  }

  get currentState (): string | undefined {
    return this._currentState;
  }

  get connectedDrivers (): StringRecord[] | undefined {
    return this._connectedDrivers;
  }

  get pageLoadMs (): number {
    return this._pageLoadMs ?? navigationMixins.DEFAULT_PAGE_READINESS_TIMEOUT_MS;
  }

  set pageLoadMs (value: number) {
    this._pageLoadMs = value;
  }
}

for (const [name, event] of _.toPairs(eventMixins.events)) {
  RemoteDebugger[name] = event;
}

export default RemoteDebugger;
