import { RemoteMessages } from './remote-messages';
import { waitForCondition } from 'asyncbox';
import log from '../logger';
import _ from 'lodash';
import B from 'bluebird';
import RpcMessageHandler from './rpc-message-handler';
import { util, timing } from '@appium/support';
import { EventEmitter } from 'node:events';
import AsyncLock from 'async-lock';
import { convertJavascriptEvaluationResult } from '../utils';

const DATA_LOG_LENGTH = {length: 200};
const MIN_WAIT_FOR_TARGET_TIMEOUT_MS = 30000;
const DEFAULT_TARGET_CREATION_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const WAIT_FOR_TARGET_INTERVAL_MS = 100;
const NO_TARGET_SUPPORTED_ERROR = `'target' domain was not found`;
const MISSING_TARGET_ERROR_PATTERN = /Missing target/i;
const NO_TARGET_PRESENT_YET_ERRORS = [
  `domain was not found`,
  `some arguments of method`,
  `missing target`,
];
export const NEW_APP_CONNECTED_ERROR = 'New application has connected';
export const EMPTY_PAGE_DICTIONARY_ERROR = 'Empty page dictionary received';
const ON_PAGE_INITIALIZED_EVENT = 'onPageInitialized';


export class RpcClient {
  /** @type {RpcMessageHandler|undefined} */
  messageHandler;

  /** @type {RemoteMessages|undefined} */
  remoteMessages;

  /** @type {boolean} */
  connected;

  /** @type {boolean} */
  isSafari;

  /** @type {string} */
  connId;

  /** @type {string} */
  senderId;

  /** @type {number} */
  msgId;

  /** @type {string|undefined} */
  udid;

  /** @type {boolean|undefined} */
  logAllCommunication;

  /** @type {boolean|undefined} */
  logAllCommunicationHexDump;

  /** @type {number|undefined} */
  socketChunkSize;

  /** @type {number|undefined} */
  webInspectorMaxFrameLength;

  /** @type {boolean|undefined} */
  fullPageInitialization;

  /** @type {string|undefined} */
  bundleId;

  /** @type {number | undefined} */
  pageLoadTimeoutMs;

  /** @type {string} */
  platformVersion;

  /** @type {string[]} */
  _contexts;

  /** @type {AppToTargetsMap} */
  _targets;

  /** @type {EventEmitter} */
  _targetSubscriptions;

  /** @type {PendingPageTargetDetails | undefined} */
  _pendingTargetNotification;

  /** @type {number} */
  _targetCreationTimeoutMs;

  /**
   *
   * @param {RpcClientOptions} [opts={}]
   */
  constructor (opts = {}) {
    const {
      bundleId,
      platformVersion = '',
      isSafari = true,
      logAllCommunication = false,
      logAllCommunicationHexDump = false,
      webInspectorMaxFrameLength,
      socketChunkSize,
      fullPageInitialization = false,
      udid,
      pageLoadTimeoutMs,
      targetCreationTimeoutMs = DEFAULT_TARGET_CREATION_TIMEOUT_MS,
    } = opts;

    this.isSafari = isSafari;

    this.isConnected = false;
    this.connId = util.uuidV4();
    this.senderId = util.uuidV4();
    this.msgId = 0;

    this.udid = udid;

    this.logAllCommunication = logAllCommunication;
    this.logAllCommunicationHexDump = logAllCommunicationHexDump;
    this.socketChunkSize = socketChunkSize;
    this.webInspectorMaxFrameLength = webInspectorMaxFrameLength;
    this.pageLoadTimeoutMs = pageLoadTimeoutMs;

    this.fullPageInitialization = fullPageInitialization;

    this.bundleId = bundleId;
    this.platformVersion = platformVersion;

    this._contexts = [];
    this._targets = {};
    this._targetSubscriptions = new EventEmitter();
    this._provisionedPages = new Set();
    this._pageSelectionLock = new AsyncLock();
    this._pageSelectionMonitor = new EventEmitter();
    this._targetCreationTimeoutMs = targetCreationTimeoutMs;

    this.remoteMessages = new RemoteMessages();

    this.messageHandler = new RpcMessageHandler();
    // add handlers for internal events
    this.messageHandler.on('Target.targetCreated', this.addTarget.bind(this));
    this.messageHandler.on('Target.didCommitProvisionalTarget', this.updateTarget.bind(this));
    this.messageHandler.on('Target.targetDestroyed', this.removeTarget.bind(this));
    this.messageHandler.on('Runtime.executionContextCreated', this.onExecutionContextCreated.bind(this));
    this.messageHandler.on('Heap.garbageCollected', this.onGarbageCollected.bind(this));
  }

  /**
   * @returns {string[]}
   */
  get contexts () {
    return this._contexts;
  }

  /**
   * @returns {AppToTargetsMap}
   */
  get targets () {
    return this._targets;
  }

  /**
   * @returns {boolean}
   */
  get isConnected () {
    return this.connected;
  }

  /**
   * @param {boolean} connected
   */
  set isConnected (connected) {
    this.connected = !!connected;
  }

  /**
   * @returns {EventEmitter}
   */
  get targetSubscriptions() {
    return this._targetSubscriptions;
  }

  /**
   *
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  on (event, listener) {
    // @ts-ignore messageHandler must be defined here
    this.messageHandler.on(event, listener);
    return this;
  }

  /**
   *
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  once (event, listener) {
    // @ts-ignore messageHandler must be defined here
    this.messageHandler.once(event, listener);
    return this;
  }

  /**
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  off (event, listener) {
    // @ts-ignore messageHandler must be defined here
    this.messageHandler.off(event, listener);
    return this;
  }

  /**
   *
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} pageIdKey
   * @returns {Promise<import('../types').TargetId | undefined>}
   */
  async waitForTarget (appIdKey, pageIdKey) {
    let target = this.getTarget(appIdKey, pageIdKey);
    if (target) {
      log.debug(
        `The target '${target}' for app '${appIdKey}' and page '${pageIdKey}' already exists, no need to wait`
      );
      return target;
    }

    // otherwise waiting is necessary to see what the target is
    const waitMs = Math.max(MIN_WAIT_FOR_TARGET_TIMEOUT_MS, this.pageLoadTimeoutMs || 0);
    log.debug(
      `Waiting up to ${waitMs}ms for a target to be created for ` +
      `app '${appIdKey}' and page '${pageIdKey}'`
    );
    try {
      await waitForCondition(() => {
        target = this.getTarget(appIdKey, pageIdKey);
        return !_.isEmpty(target);
      }, {
        waitMs,
        intervalMs: WAIT_FOR_TARGET_INTERVAL_MS,
      });
      return target;
    } catch (err) {
      if (!err.message.includes('Condition unmet')) {
        throw err;
      }
      throw new Error(
        `No targets could be matched for the app '${appIdKey}' and page '${pageIdKey}' after ${waitMs}ms`
      );
    }
  }

  /**
   *
   * @param {string} command
   * @param {import('../types').RemoteCommandOpts} opts
   * @param {boolean} [waitForResponse=true]
   * @returns {Promise<any>}
   */
  async send (command, opts, waitForResponse = true) {
    const timer = new timing.Timer().start();
    try {
      return await this.sendToDevice(command, opts, waitForResponse);
    } catch (err) {
      const {
        appIdKey,
        pageIdKey
      } = opts;
      const messageLc = (err.message || '').toLowerCase();
      if (messageLc.includes(NO_TARGET_SUPPORTED_ERROR)) {
        return await this.sendToDevice(command, opts, waitForResponse);
      } else if (appIdKey && NO_TARGET_PRESENT_YET_ERRORS.some((error) => messageLc.includes(error))) {
        await this.waitForTarget(appIdKey, /** @type {import('../types').PageIdKey} */ (pageIdKey));
        return await this.sendToDevice(command, opts, waitForResponse);
      }
      throw err;
    } finally {
      log.debug(`Sending to Web Inspector took ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
    }
  }

  /**
   *
   * @template {boolean} TWaitForResponse
   * @param {string} command
   * @param {import('../types').RemoteCommandOpts} opts
   * @param {TWaitForResponse} [waitForResponse=true]
   * @returns {Promise<TWaitForResponse extends true ? import('../types').RemoteCommandOpts : any>}
   */
  // @ts-ignore Compiler issue
  async sendToDevice (command, opts, waitForResponse = true) {
    return await new B(async (resolve, reject) => {
      // promise to be resolved whenever remote debugger
      // replies to our request

      // keep track of the messages coming and going using a simple sequential id
      const msgId = this.msgId++;
      // for target-base communication, everything is wrapped up
      const wrapperMsgId = this.msgId++;
      // acknowledge wrapper message
      // @ts-ignore messageHandler must be defined
      this.messageHandler.on(wrapperMsgId.toString(), function (err) {
        if (err) {
          reject(err);
        }
      });

      const appIdKey = opts.appIdKey;
      const pageIdKey = opts.pageIdKey;
      const targetId = opts.targetId ?? this.getTarget(appIdKey, pageIdKey);

      // retrieve the correct command to send
      /** @type {import('../types').RemoteCommandOpts} */
      const fullOpts = _.defaults({
        connId: this.connId,
        senderId: this.senderId,
        targetId,
        id: msgId,
      }, opts);
      /** @type {import('../types').RawRemoteCommand} */
      let cmd;
      try {
        // @ts-ignore remoteMessages must be defined
        cmd = this.remoteMessages.getRemoteCommand(command, fullOpts);
      } catch (err) {
        log.error(err);
        return reject(err);
      }

      /** @type {import('../types').RemoteCommand} */
      const finalCommand = {
        __argument: _.omit(cmd.__argument, ['WIRSocketDataKey']),
        __selector: cmd.__selector,
      };

      const hasSocketData = _.isPlainObject(cmd.__argument?.WIRSocketDataKey);
      if (hasSocketData) {
        // make sure the message being sent has all the information that is needed
        // @ts-ignore We have asserted it's a plain object above
        if (_.isNil(cmd.__argument.WIRSocketDataKey.id)) {
          // @ts-ignore We have already asserted it's a plain object above
          cmd.__argument.WIRSocketDataKey.id = wrapperMsgId;
        }
        finalCommand.__argument.WIRSocketDataKey = Buffer.from(JSON.stringify(cmd.__argument.WIRSocketDataKey));
      }

      let messageHandled = true;
      if (!waitForResponse) {
        // the promise will be resolved as soon as the socket has been sent
        messageHandled = false;
        // do not log receipts
        // @ts-ignore messageHandler must be defined
        this.messageHandler.once(msgId.toString(), (err) => {
          if (err) {
            // we are not waiting for this, and if it errors it is most likely
            // a protocol change. Log and check during testing
            log.error(
              `Received error from send that is not being waited for (id: ${msgId}): ` +
              _.truncate(JSON.stringify(err), DATA_LOG_LENGTH)
            );
            // reject, though it is very rare that this will be triggered, since
            // the promise is resolved directlty after send. On the off chance,
            // though, it will alert of a protocol change.
            reject(err);
          }
        });
      // @ts-ignore messageHandler must be defined
      } else if (this.messageHandler.listeners(cmd.__selector).length) {
        // @ts-ignore messageHandler must be defined
        this.messageHandler.prependOnceListener(cmd.__selector, (err, ...args) => {
          if (err) {
            return reject(err);
          }
          log.debug(`Received response from send (id: ${msgId}): '${_.truncate(JSON.stringify(args), DATA_LOG_LENGTH)}'`);
          // @ts-ignore This is ok
          resolve(args);
        });
      } else if (hasSocketData) {
        // @ts-ignore messageHandler must be defined
        this.messageHandler.once(msgId.toString(), (err, value) => {
          if (err) {
            return reject(new Error(`Remote debugger error with code '${err.code}': ${err.message}`));
          }
          log.debug(`Received data response from send (id: ${msgId}): '${_.truncate(JSON.stringify(value), DATA_LOG_LENGTH)}'`);
          resolve(value);
        });
      } else {
        // nothing else is handling things, so just resolve when the message is sent
        messageHandled = false;
      }

      const msg = `Sending '${cmd.__selector}' message` +
        (appIdKey ? ` to app '${appIdKey}'` : '') +
        (pageIdKey ? `, page '${pageIdKey}'` : '') +
        (targetId ? `, target '${targetId}'` : '') +
        ` (id: ${msgId}): '${command}'`;
      log.debug(msg);
      try {
        await this.sendMessage(finalCommand);
        if (!messageHandled) {
          // There are no handlers waiting for a response before resolving,
          // and no errors sending the message over the socket, so resolve
          // @ts-ignore This is ok
          resolve(fullOpts);
        }
      } catch (err) {
        return reject(err);
      }
    });
  }

  async connect () {
    throw new Error(`Sub-classes need to implement a 'connect' function`);
  }

  async disconnect () {
    this.messageHandler?.removeAllListeners();
  }

  /**
   * @param {import('../types').RemoteCommand} command
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendMessage (command) {
    throw new Error(`Sub-classes need to implement a 'sendMessage' function`);
  }

  /**
   * @param {any} data
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async receive (data) {
    throw new Error(`Sub-classes need to implement a 'receive' function`);
  }

  /**
   *
   * @param {Error | undefined} err
   * @param {import('../types').AppIdKey} app
   * @param {import('../types').TargetInfo} targetInfo
   * @returns {Promise<void>}
   */
  async addTarget (err, app, targetInfo) {
    if (_.isNil(targetInfo?.targetId)) {
      log.info(`Received 'Target.targetCreated' event for app '${app}' with no target. Skipping`);
      return;
    }

    const pendingPageTargetDetails = this._getPendingPageTargetDetails(app, targetInfo);
    if (!pendingPageTargetDetails) {
      return;
    }
    const {
      appIdKey,
      pageIdKey,
      pageReadinessDetector,
    } = pendingPageTargetDetails;

    if (!_.isPlainObject(this.targets[appIdKey])) {
      this.targets[appIdKey] = {
        lock: new AsyncLock({maxOccupationTime: this._targetCreationTimeoutMs}),
      };
    }
    const timer = new timing.Timer().start();

    const adjustPageReadinessDetector = () => {
      if (!pageReadinessDetector) {
        return;
      }

      const elapsedMs = timer.getDuration().asMilliSeconds;
      if (elapsedMs >= pageReadinessDetector.timeoutMs) {
        log.warn(
          `Page '${pageIdKey}' took too long to initialize, skipping readiness check`
        );
        return;
      }
      return {
        timeoutMs: pageReadinessDetector.timeoutMs - elapsedMs,
        readinessDetector: pageReadinessDetector.readinessDetector,
      };
    };

    if (targetInfo.isProvisional) {
      log.debug(
        `Provisional target created for app '${appIdKey}' and page '${pageIdKey}': '${JSON.stringify(targetInfo)}'`
      );

      this._provisionedPages.add(pageIdKey);
      try {
        await this.targets[appIdKey].lock.acquire(pageIdKey, async () => {
          let wasInitialized = false;
          try {
            wasInitialized = await this._initializePage(appIdKey, pageIdKey, targetInfo.targetId);
          } finally {
            if (targetInfo.isPaused) {
              await this._resumeTarget(appIdKey, pageIdKey, targetInfo.targetId);
            } else {
              log.debug(
                `Provisional target ${targetInfo.targetId}@${appIdKey} is not paused, so not resuming`
              );
            }
          }
          if (wasInitialized) {
            await this._waitForPageReadiness(
              appIdKey, pageIdKey, targetInfo.targetId, adjustPageReadinessDetector()
            );
          }
        });
      } catch (e) {
        log.warn(
          `Cannot complete the initialization of the provisional target '${targetInfo.targetId}' ` +
          `after ${timer.getDuration().asMilliSeconds}ms: ${e.message}`
        );
      }
      return;
    }

    log.debug(`Target created for app '${appIdKey}' and page '${pageIdKey}': ${JSON.stringify(targetInfo)}`);
    if (_.has(this.targets[appIdKey], pageIdKey)) {
      log.debug(
        `There is already a target for this app and page ('${this.targets[appIdKey][pageIdKey]}'). ` +
        `This might cause problems`
      );
    }
    this.targets[appIdKey][pageIdKey] = targetInfo.targetId;

    try {
      await this.send('Target.setPauseOnStart', {
        pauseOnStart: true,
        appIdKey,
        pageIdKey,
      });
    } catch (e) {
      log.debug(
        `Cannot setup pause on start for app '${appIdKey}' and page '${pageIdKey}': ${e.message}`
      );
    }

    try {
      await this.targets[appIdKey].lock.acquire(pageIdKey, async () => {
        let wasInitialized = false;
        try {
          if (this._provisionedPages.has(pageIdKey)) {
            log.debug(`Page '${pageIdKey}' has been already provisioned`);
            this._provisionedPages.delete(pageIdKey);
          } else {
            wasInitialized = await this._initializePage(appIdKey, pageIdKey);
          }
        } finally {
          if (targetInfo.isPaused) {
            await this._resumeTarget(appIdKey, pageIdKey, targetInfo.targetId);
          }
        }
        if (wasInitialized) {
          await this._waitForPageReadiness(
            appIdKey, pageIdKey, targetInfo.targetId, adjustPageReadinessDetector()
          );
        }
      });
    } catch (e) {
      log.warn(e.message);
    } finally {
      // Target creation is happening after provisioning,
      // which means the above lock would be already released
      // after provisioning is completed.
      this._pageSelectionMonitor.emit(ON_PAGE_INITIALIZED_EVENT, appIdKey, pageIdKey);
    }
  }

  /**
   *
   * @param {Error | undefined} err
   * @param {import('../types').AppIdKey} app
   * @param {import('../types').ProvisionalTargetInfo} targetInfo
   * @returns {Promise<void>}
   */
  async updateTarget (err, app, targetInfo) {
    const {
      oldTargetId,
      newTargetId,
    } = targetInfo;
    log.debug(`Target updated for app '${app}'. Old target: '${oldTargetId}', new target: '${newTargetId}'`);

    const appTargetsMap = this.targets[app];
    if (!appTargetsMap) {
      log.warn(`No existing target for app '${app}'. Not sure what to do`);
      return;
    }

    // save this, to be used if/when the existing target is destroyed
    appTargetsMap.provisional = {
      oldTargetId,
      newTargetId,
    };
  }

  /**
   *
   * @param {Error | undefined} err
   * @param {import('../types').AppIdKey} app
   * @param {import('../types').TargetInfo} targetInfo
   * @returns {Promise<void>}
   */
  async removeTarget (err, app, targetInfo) {
    if (_.isNil(targetInfo?.targetId)) {
      log.debug(`Received 'Target.targetDestroyed' event with no target. Skipping`);
      return;
    }

    log.debug(`Target destroyed for app '${app}': ${targetInfo.targetId}`);

    // go through the targets and find the one that has a waiting provisional target
    if (this.targets[app]?.provisional?.oldTargetId === targetInfo.targetId) {
      const {oldTargetId, newTargetId} = this.targets[app].provisional;
      delete this.targets[app].provisional;

      // we do not know the page, so go through and find the existing target
      const appTargetsMap = this.targets[app];
      for (const [page, targetId] of _.toPairs(appTargetsMap)) {
        if (targetId === oldTargetId) {
          log.debug(
            `Found provisional target for app '${app}'. ` +
            `Old target: '${oldTargetId}', new target: '${newTargetId}'. Updating`
          );
          appTargetsMap[page] = newTargetId;
          return;
        }
      }
      log.warn(
        `Provisional target for app '${app}' found, but no suitable existing target found. This may cause problems`
      );
      log.warn(
        `Old target: '${oldTargetId}', new target: '${newTargetId}'. Existing targets: ${JSON.stringify(appTargetsMap)}`
      );
    }

    // if there is no waiting provisional target, just get rid of the existing one
    const targets = this.targets[app];
    for (const [page, targetId] of _.toPairs(targets)) {
      if (targetId === targetInfo.targetId) {
        delete targets[page];
        return;
      }
    }
    log.debug(`Target '${targetInfo.targetId}' deleted for app '${app}', but no such target exists`);
  }

  /**
   * @param {import('../types').AppIdKey} [appIdKey]
   * @param {import('../types').PageIdKey} [pageIdKey]
   * @returns {string | undefined}
   */
  getTarget (appIdKey, pageIdKey) {
    if (!appIdKey || !pageIdKey) {
      return;
    }
    return this.targets[appIdKey]?.[pageIdKey];
  }

  /**
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} pageIdKey
   * @param {PageReadinessDetector} [pageReadinessDetector]
   * @returns {Promise<void>}
   */
  async selectPage (appIdKey, pageIdKey, pageReadinessDetector) {
    await this._pageSelectionLock.acquire(toPageSelectionKey(appIdKey, pageIdKey), async () => {
      this._pendingTargetNotification = {appIdKey, pageIdKey, pageReadinessDetector};
      this._provisionedPages.clear();

      if (this.getTarget(appIdKey, pageIdKey)) {
        log.debug(`Page '${pageIdKey}' is already selected for app '${appIdKey}'`);
        return;
      }

      // go through the steps that the Desktop Safari system
      // goes through to initialize the Web Inspector session

      const sendOpts = {
        appIdKey,
        pageIdKey,
      };

      const timeoutMs = Math.trunc(this._targetCreationTimeoutMs * 1.2);
      const timer = new timing.Timer().start();

      const setupWebview = async () => {
        // highlight and then un-highlight the webview
        for (const enabled of [true, false]) {
          await this.send('indicateWebView', Object.assign({
            enabled,
          }, sendOpts), false);
        }
        await this.send('setSenderKey', sendOpts);
      };
      await B.resolve(setupWebview())
        .timeout(timeoutMs, `Cannot set up page '${pageIdKey}' for app '${appIdKey}' within ${timeoutMs}ms`);

      const msLeft = Math.max(timeoutMs - Math.trunc(timer.getDuration().asMilliSeconds), 1000);
      log.debug(
        `Waiting up to ${msLeft}ms for page '${pageIdKey}' of app '${appIdKey}' to be selected`
      );
      await new Promise((resolve) => {
        const onPageInitialized = (
          /** @type {import("../types").AppIdKey} */ notifiedAppIdKey,
          /** @type {import("../types").PageIdKey} */ notifiedPageIdKey
        ) => {
          const timeoutHandler = setTimeout(() => {
            this._pageSelectionMonitor.off(ON_PAGE_INITIALIZED_EVENT, onPageInitialized);
            log.warn(
              `Page '${pageIdKey}' for app '${appIdKey}' has not been selected ` +
              `within ${timer.getDuration().asMilliSeconds}ms. Continuing anyway`
            );
            resolve(false);
          }, msLeft);

          if (notifiedAppIdKey === appIdKey && notifiedPageIdKey === pageIdKey) {
            clearTimeout(timeoutHandler);
            this._pageSelectionMonitor.off(ON_PAGE_INITIALIZED_EVENT, onPageInitialized);
            log.debug(
              `Selected the page ${pageIdKey}@${appIdKey} after ${timer.getDuration().asMilliSeconds}ms`
            );
            resolve(true);
          } else {
            log.debug(
              `Got notified that page ${notifiedPageIdKey}@${notifiedAppIdKey} is initialized, ` +
              `but we are waiting for ${pageIdKey}@${appIdKey}. Continuing to wait`
            );
          }
        };

        this._pageSelectionMonitor.on(ON_PAGE_INITIALIZED_EVENT, onPageInitialized);
      });
    });
  }

  /**
   * Mimic every step that Desktop Safari Develop tools uses to initialize a
   * Web Inspector session
   *
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} pageIdKey
   * @param {import('../types').TargetId} [targetId]
   * @returns {Promise<boolean>}
   */
  async _initializePage (appIdKey, pageIdKey, targetId) {
    const sendOpts = {
      appIdKey,
      pageIdKey,
      targetId,
    };

    log.debug(`Initializing page '${pageIdKey}' for app '${appIdKey}'`);
    const timer = new timing.Timer().start();
    if (!this.fullPageInitialization) {
      // The sequence of domains is important
      for (const domain of [
        'Inspector.enable',
        'Page.enable',
        'Runtime.enable',

        'Network.enable',
        'Heap.enable',
        'Debugger.enable',
        'Console.enable',

        'Inspector.initialized',
      ]) {
        try {
          await this.send(domain, sendOpts);
        } catch (err) {
          log.info(`Cannot enable domain '${domain}' during initialization: ${err.message}`);
          if (MISSING_TARGET_ERROR_PATTERN.test(err.message)) {
            return false;
          }
        }
      }
      log.debug(
        `Simple initialization of page '${pageIdKey}' for app '${appIdKey}' completed ` +
        `in ${timer.getDuration().asMilliSeconds}ms`
      );
      return true;
    }

    // The sequence of commands here is important
    const domainsToOptsMap = {
      'Inspector.enable': sendOpts,
      'Page.enable': sendOpts,
      'Runtime.enable': sendOpts,

      'Page.getResourceTree': sendOpts,
      'Network.enable': sendOpts,
      'Network.setResourceCachingDisabled': {
        disabled: false,
        ...sendOpts,
      },
      'DOMStorage.enable': sendOpts,
      'Database.enable': sendOpts,
      'IndexedDB.enable': sendOpts,
      'CSS.enable': sendOpts,
      'Heap.enable': sendOpts,
      'Memory.enable': sendOpts,
      'ApplicationCache.enable': sendOpts,
      'ApplicationCache.getFramesWithManifests': sendOpts,
      'Timeline.setInstruments': {
        instruments: ['Timeline', 'ScriptProfiler', 'CPU'],
        ...sendOpts,
      },
      'Timeline.setAutoCaptureEnabled': {
        enabled: false,
        ...sendOpts,
      },
      'Debugger.enable': sendOpts,
      'Debugger.setBreakpointsActive': {
        active: true,
        ...sendOpts,
      },
      'Debugger.setPauseOnExceptions': {
        state: 'none',
        ...sendOpts,
      },
      'Debugger.setPauseOnAssertions': {
        enabled: false,
        ...sendOpts,
      },
      'Debugger.setAsyncStackTraceDepth': {
        depth: 200,
        ...sendOpts,
      },
      'Debugger.setPauseForInternalScripts': {
        shouldPause: false,
        ...sendOpts,
      },
      'LayerTree.enable': sendOpts,
      'Worker.enable': sendOpts,
      'Canvas.enable': sendOpts,
      'Console.enable': sendOpts,
      'DOM.getDocument': sendOpts,
      'Console.getLoggingChannels': sendOpts,

      'Inspector.initialized': sendOpts,
    };

    for (const [domain, opts] of Object.entries(domainsToOptsMap)) {
      try {
        const res = await this.send(domain, opts);
        if (domain === 'Console.getLoggingChannels') {
          for (const source of (res?.channels || []).map((/** @type {{ source: any; }} */ entry) => entry.source)) {
            try {
              await this.send('Console.setLoggingChannelLevel', Object.assign({
                source,
                level: 'verbose',
              }, sendOpts));
            } catch (err) {
              log.info(`Cannot set logging channel level for '${source}': ${err.message}`);
              if (MISSING_TARGET_ERROR_PATTERN.test(err.message)) {
                return false;
              }
            }
          }
        }
      } catch (err) {
        log.info(`Cannot enable domain '${domain}' during full initialization: ${err.message}`);
        if (MISSING_TARGET_ERROR_PATTERN.test(err.message)) {
          return false;
        }
      }
    }
    log.debug(
      `Full initialization of page '${pageIdKey}' for app '${appIdKey}' completed ` +
      `in ${timer.getDuration().asMilliSeconds}ms`
    );
    return true;
  }

  /**
   *
   * @param {import('../types').AppIdKey} appIdKey
   * @returns {Promise<[string, Record<string, any>]>}
   */
  async selectApp (appIdKey) {
    return await new B((resolve, reject) => {
      // local callback, temporarily added as callback to
      // `_rpc_applicationConnected:` remote debugger response
      // to handle the initial connection
      const onAppChange = (err, dict) => {
        if (err) {
          return reject(err);
        }
        // from the dictionary returned, get the ids
        const oldAppIdKey = dict.WIRHostApplicationIdentifierKey;
        const correctAppIdKey = dict.WIRApplicationIdentifierKey;

        // if this is a report of a proxy redirect from the remote debugger
        // we want to update our dictionary and get a new app id
        if (oldAppIdKey && correctAppIdKey !== oldAppIdKey) {
          log.debug(`We were notified we might have connected to the wrong app. ` +
                    `Using id ${correctAppIdKey} instead of ${oldAppIdKey}`);
        }

        reject(new Error(NEW_APP_CONNECTED_ERROR));
      };
      this.messageHandler?.prependOnceListener('_rpc_applicationConnected:', onAppChange);

      // do the actual connecting to the app
      (async () => {
        try {
          const [connectedAppIdKey, pageDict] = await this.send('connectToApp', {appIdKey});
          // sometimes the connect logic happens, but with an empty dictionary
          // which leads to the remote debugger getting disconnected, and into a loop
          if (_.isEmpty(pageDict)) {
            reject(new Error(EMPTY_PAGE_DICTIONARY_ERROR));
          } else {
            resolve([connectedAppIdKey, pageDict]);
          }
        } catch (err) {
          log.warn(`Unable to connect to the app: ${err.message}`);
          reject(err);
        } finally {
          this.messageHandler?.off('_rpc_applicationConnected:', onAppChange);
        }
      })();
    });
  }

  /**
   *
   * @param {Error?} err
   * @param {Record<string, any>} context
   */
  onExecutionContextCreated (err, context) {
    // { id: 2, isPageContext: true, name: '', frameId: '0.1' }
    // right now we have no way to map contexts to apps/pages
    // so just store
    this.contexts.push(context.id);
  }

  /**
   * @returns {void}
   */
  onGarbageCollected () {
    // just want to log that this is happening, as it can affect opertion
    log.debug(`Web Inspector garbage collected`);
  }

  /**
   *
   * @param {Error?} err
   * @param {Record<string, any>} scriptInfo
   */
  onScriptParsed (err, scriptInfo) {
    // { scriptId: '13', url: '', startLine: 0, startColumn: 0, endLine: 82, endColumn: 3 }
    log.debug(`Script parsed: ${JSON.stringify(scriptInfo)}`);
  }

  /**
   *
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} pageIdKey
   * @param {import('../types').TargetId} targetId
   * @returns {Promise<void>}
   */
  async _resumeTarget (appIdKey, pageIdKey, targetId) {
    try {
      await this.send('Target.resume', {
        appIdKey,
        pageIdKey,
        targetId,
      });
      log.debug(`Successfully resumed the target ${targetId}@${appIdKey}`);
    } catch (e) {
      log.warn(`Could not resume the target ${targetId}@${appIdKey}: ${e.message}`);
    }
  }

  /**
   *
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} pageIdKey
   * @param {import('../types').TargetId} targetId
   * @param {PageReadinessDetector} [pageReadinessDetector]
   * @returns {Promise<void>}
   */
  async _waitForPageReadiness(appIdKey, pageIdKey, targetId, pageReadinessDetector) {
    if (!pageReadinessDetector) {
      return;
    }

    log.debug(`Waiting up to ${pageReadinessDetector.timeoutMs}ms for page readiness`);
    const timer = new timing.Timer().start();
    while (pageReadinessDetector.timeoutMs - timer.getDuration().asMilliSeconds > 0) {
      /** @type {string} */
      let readyState;
      try {
        const commandTimeoutMs = Math.max(
          100,
          Math.trunc((pageReadinessDetector.timeoutMs - timer.getDuration().asMilliSeconds) * 0.8)
        );
        const rawResult = await B.resolve(this.send('Runtime.evaluate', {
          expression: 'document.readyState;',
          returnByValue: true,
          appIdKey,
          pageIdKey,
          targetId,
        })).timeout(commandTimeoutMs);
        readyState = convertJavascriptEvaluationResult(rawResult);
      } catch (e) {
        log.debug(`Cannot determine page readiness: ${e.message}`);
        continue;
      }
      if (pageReadinessDetector.readinessDetector(readyState)) {
        log.info(
          `Page '${pageIdKey}' for app '${appIdKey}' is ready after ` +
          `${timer.getDuration().asMilliSeconds}ms`
        );
        return;
      }
      await B.delay(100);
    }
    log.warn(
      `Page '${pageIdKey}' for app '${appIdKey}' is not ready after ` +
      `${timer.getDuration().asMilliSeconds}ms. Continuing anyway`
    );
  }

  /**
   *
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} pageIdKey
   * @returns {Promise<void>}
   */
  async waitForPage (appIdKey, pageIdKey) {
    const appTargetsMap = this.targets[appIdKey];
    if (!appTargetsMap) {
      throw new Error(`No targets found for app '${appIdKey}'`);
    }
    const lock = appTargetsMap.lock;
    const timer = new timing.Timer().start();
    await Promise.all([
      lock.acquire(pageIdKey, async () => await B.delay(0)),
      this._pageSelectionLock.acquire(toPageSelectionKey(appIdKey, pageIdKey), async () => await B.delay(0))
    ]);
    const durationMs = timer.getDuration().asMilliSeconds;
    if (durationMs > 10) {
      log.debug(`Waited ${durationMs}ms until the page ${pageIdKey}@${appIdKey} is initialized`);
    }
  }

  /**
   * Get the pending target details if there is a pending request.
   *
   * @param {import('../types').AppIdKey} appId
   * @param {import('../types').TargetInfo} targetInfo
   * @returns {PendingPageTargetDetails | undefined}
   */
  _getPendingPageTargetDetails(appId, targetInfo) {
    const logInfo = (/** @type {string} */ message) => void log.info(
      `Skipping 'Target.targetCreated' event ${message} for app '${appId}': ${JSON.stringify(targetInfo)}`
    );
    if (!this._pendingTargetNotification) {
      return logInfo('with no pending request');
    }
    if (targetInfo.type !== 'page') {
      // TODO: We'll need to handle 'frame' type for several domains.
      // Target, Runtime, Debugger and Console should ignore this target for now.
      // https://github.com/WebKit/WebKit/commit/06f8ad1a5a66f9ffaa33696a5b9fba4f4c65070b#diff-42db8526b5e72dc714b9561e283ef57fbbc3000576a36839ad03df52b5e54667
      // https://github.com/appium/appium/issues/21705
      return logInfo(`with type '${targetInfo.type}'`);
    }

    return this._pendingTargetNotification.appIdKey === appId
      ? {...this._pendingTargetNotification}
      : logInfo('with different app id');
  }
}

/**
 *
 * @param {import('../types').AppIdKey} appIdKey
 * @param {import('../types').PageIdKey} pageIdKey
 * @returns {string}
 */
function toPageSelectionKey(appIdKey, pageIdKey) {
  return `${appIdKey}:${pageIdKey}`;
}

export default RpcClient;

/**
 * @typedef {Object} RpcClientOptions
 * @property {string} [bundleId]
 * @property {string} [platformVersion='']
 * @property {boolean} [isSafari=true]
 * @property {boolean} [logAllCommunication=false]
 * @property {boolean} [logAllCommunicationHexDump=false]
 * @property {number} [webInspectorMaxFrameLength]
 * @property {number} [socketChunkSize]
 * @property {boolean} [fullPageInitialization=false]
 * @property {number} [pageLoadTimeoutMs]
 * @property {string} [udid]
 * @property {number} [targetCreationTimeoutMs]
 */

/**
 * @typedef {Object} PendingPageTargetDetails
 * @property {import('../types').AppIdKey} appIdKey
 * @property {import('../types').PageIdKey} pageIdKey
 * @property {PageReadinessDetector | undefined} pageReadinessDetector
 */

/**
 * @typedef {{[key: import('../types').PageIdKey]: import('../types').TargetId}} PageDict
 */

/**
 * @typedef {PageDict & {provisional?: import('../types').ProvisionalTargetInfo, lock: AsyncLock}} PagesToTargets
 * @typedef {{[key: import('../types').AppIdKey]: PagesToTargets}} AppToTargetsMap
 */

/**
 * @typedef {Object} PageReadinessDetector
 * @property {number} timeoutMs
 * @property {(readyState: string) => boolean} readinessDetector
 */
