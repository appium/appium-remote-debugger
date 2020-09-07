import { EventEmitter } from 'events';
import log from './logger';
import { RpcClientSimulator } from './rpc';
import { checkParams } from './utils';
import { mixins, events } from './mixins';
import _ from 'lodash';
import B from 'bluebird';
import path from 'path';
import AsyncLock from 'async-lock';


let VERSION;
try {
  VERSION = require(path.resolve(__dirname, '..', '..', 'package.json')).version;
} catch (ign) {}

const REMOTE_DEBUGGER_PORT = 27753;
const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';

/* How many milliseconds to wait for webkit to return a response before timing out */
const RPC_RESPONSE_TIMEOUT_MS = 5000;

const PAGE_READY_TIMEOUT = 5000;

const GARBAGE_COLLECT_TIMEOUT = 5000;


class RemoteDebugger extends EventEmitter {
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
   *   - webInspectorMaxFrameLength - The maximum size in bytes of a single data frame
   *                                  in the device communication protocol
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
      webInspectorMaxFrameLength,
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

    if (_.isInteger(webInspectorMaxFrameLength)) {
      this.webInspectorMaxFrameLength = webInspectorMaxFrameLength;
    }

    this.fullPageInitialization = fullPageInitialization;

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
    await this.rpcClient.send('launchApplication', {
      bundleId: SAFARI_BUNDLE_ID
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

  set allowNavigationWithoutReload (allow) {
    this._allowNavigationWithoutReload = allow;
  }

  get allowNavigationWithoutReload () {
    return this._allowNavigationWithoutReload;
  }

  async getCookies (urls) {
    log.debug('Getting cookies');
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
