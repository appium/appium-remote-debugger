import { RemoteMessages } from './remote-messages';
import { waitForCondition } from 'asyncbox';
import log from '../logger';
import _ from 'lodash';
import B from 'bluebird';
import RpcMessageHandler from './rpc-message-handler';
import { util, timing } from '@appium/support';
import { EventEmitter } from 'node:events';
import AsyncLock from 'async-lock';

const DATA_LOG_LENGTH = {length: 200};
const WAIT_FOR_TARGET_TIMEOUT_MS = 10000;
const WAIT_FOR_TARGET_INTERVAL_MS = 100;
const MIN_PLATFORM_FOR_TARGET_BASED = '12.2';
// `Target.exists` protocol method was removed from WebKit in 13.4
const MIN_PLATFORM_NO_TARGET_EXISTS = '13.4';
const NO_TARGET_SUPPORTED_ERROR = `'target' domain was not found`;
const NO_TARGET_PRESENT_YET_ERRORS = [
  `domain was not found`,
  `some arguments of method`,
  `missing target`,
];
export const NEW_APP_CONNECTED_ERROR = 'New application has connected';
export const EMPTY_PAGE_DICTIONARY_ERROR = 'Empty page dictionary received';

/**
 * @param {boolean} isSafari
 * @param {string} platformVersion
 * @returns {boolean}
 */
function isTargetBased (isSafari, platformVersion) {
  // On iOS 12.2 the messages get sent through the Target domain
  // On iOS 13.0+, WKWebView also needs to follow the Target domain,
  // so here only check the target OS version as the default behaviour.
  const isHighVersion = util.compareVersions(platformVersion, '>=', MIN_PLATFORM_FOR_TARGET_BASED);
  log.debug(`Checking which communication style to use (${isSafari ? '' : 'non-'}Safari on platform version '${platformVersion}')`);
  log.debug(`Platform version equal or higher than '${MIN_PLATFORM_FOR_TARGET_BASED}': ${isHighVersion}`);
  return isHighVersion;
}

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

  /** @type {string} */
  platformVersion;

  /** @type {string[]} */
  _contexts;

  /** @type {AppToTargetsMap} */
  _targets;

  /** @type {EventEmitter} */
  _targetSubscriptions;

  /** @type {[import('../types').AppIdKey, import('../types').PageIdKey] | undefined} */
  _pendingTargetNotification;

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

    this.fullPageInitialization = fullPageInitialization;

    this.bundleId = bundleId;
    this.platformVersion = platformVersion;

    this._contexts = [];
    this._targets = {};
    this._targetSubscriptions = new EventEmitter();

    // start with a best guess for the protocol
    this.isTargetBased = platformVersion ? isTargetBased(isSafari, platformVersion) : true;
  }

  /**
   * @returns {string[]}
   */
  get contexts () {
    return this._contexts;
  }

  /**
   * @returns {boolean}
   */
  get needsTarget () {
    return this.isTargetBased;
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
   * @param {boolean} isTargetBased
   */
  set isTargetBased (isTargetBased) {
    log.warn(`Setting communication protocol: using ${isTargetBased ? 'Target-based' : 'full Web Inspector protocol'} communication`);
    this._isTargetBased = isTargetBased;

    if (!this.remoteMessages) {
      this.remoteMessages = new RemoteMessages(isTargetBased);
    } else {
      this.remoteMessages.isTargetBased = isTargetBased;
    }

    if (!this.messageHandler) {
      this.messageHandler = new RpcMessageHandler(isTargetBased);

      // add handlers for internal events
      this.messageHandler.on('Target.targetCreated', this.addTarget.bind(this));
      this.messageHandler.on('Target.didCommitProvisionalTarget', this.updateTarget.bind(this));
      this.messageHandler.on('Target.targetDestroyed', this.removeTarget.bind(this));
      this.messageHandler.on('Runtime.executionContextCreated', this.onExecutionContextCreated.bind(this));
      this.messageHandler.on('Heap.garbageCollected', this.onGarbageCollected.bind(this));
    } else {
      this.messageHandler.isTargetBased = isTargetBased;
    }
  }

  /**
   * @returns {boolean}
   */
  get isTargetBased () {
    return !!this._isTargetBased;
  }

  /**
   *
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} pageIdKey
   * @returns {Promise<import('../types').TargetId | undefined>}
   */
  async waitForTarget (appIdKey, pageIdKey) {
    if (!this.needsTarget) {
      log.debug(`Target-based communication is not needed, skipping wait for target`);
      return;
    }
    let target = this.getTarget(appIdKey, pageIdKey);
    if (target) {
      log.debug(
        `The target '${target}' for app '${appIdKey}' and page '${pageIdKey}' already exists, no need to wait`
      );
      return target;
    }

    // otherwise waiting is necessary to see what the target is
    try {
      await waitForCondition(() => {
        target = this.getTarget(appIdKey, pageIdKey);
        return !_.isEmpty(target);
      }, {
        waitMs: WAIT_FOR_TARGET_TIMEOUT_MS,
        intervalMs: WAIT_FOR_TARGET_INTERVAL_MS,
      });
      return target;
    } catch (err) {
      if (!err.message.includes('Condition unmet')) {
        throw err;
      }
      throw new Error(
        `No targets could be matched for the app '${appIdKey}' and page '${pageIdKey}' after ` +
        `${WAIT_FOR_TARGET_TIMEOUT_MS}ms. This is likely a bug.`
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
        log.info(
          'The target device does not support Target based communication. ' +
          'Will follow non-target based communication.'
        );
        this.isTargetBased = false;
        return await this.sendToDevice(command, opts, waitForResponse);
      } else if (appIdKey && NO_TARGET_PRESENT_YET_ERRORS.some((error) => messageLc.includes(error))) {
        this.isTargetBased = true;
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
      let wrapperMsgId = msgId;
      if (this.isTargetBased) {
        // for target-base communication, everything is wrapped up
        wrapperMsgId = this.msgId++;
        // acknowledge wrapper message
        // @ts-ignore messageHandler must be defined
        this.messageHandler.on(wrapperMsgId.toString(), function (err) {
          if (err) {
            reject(err);
          }
        });
      }

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
        this.messageHandler.once(msgId.toString(), function (err) {
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
        this.messageHandler.prependOnceListener(cmd.__selector, function (err, ...args) {
          if (err) {
            return reject(err);
          }
          log.debug(`Received response from send (id: ${msgId}): '${_.truncate(JSON.stringify(args), DATA_LOG_LENGTH)}'`);
          // @ts-ignore This is ok
          resolve(args);
        });
      } else if (hasSocketData) {
        // @ts-ignore messageHandler must be defined
        this.messageHandler.once(msgId.toString(), function (err, value) {
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
        (this.needsTarget && targetId ? `, target '${targetId}'` : '') +
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
    if (!this._pendingTargetNotification) {
      log.info(
        `Received 'Target.targetCreated' event for app '${app}' with no pending request: ${JSON.stringify(targetInfo)}`
      );
      return;
    }

    const [appIdKey, pageIdKey] = this._pendingTargetNotification;
    if (appIdKey !== app) {
      log.info(
        `Received 'Target.targetCreated' event for app '${app}' with no pending request: ${JSON.stringify(targetInfo)}`
      );
      return;
    }

    if (targetInfo.isProvisional) {
      log.debug(
        `Provisional target created for app '${appIdKey}' and page '${pageIdKey}': '${targetInfo.targetId}'`
      );
      if (!targetInfo.isPaused) {
        return;
      }

      log.debug(`The target ${targetInfo.targetId}@${appIdKey} is paused`);
      const appTargetsMap = this.targets[appIdKey];
      if (appTargetsMap) {
        await appTargetsMap.lock.acquire(toLockKey(appIdKey, pageIdKey), async () => {
          try {
            await this._initializePage(appIdKey, pageIdKey, targetInfo.targetId);
          } finally {
            await this._resumeTarget(appIdKey, pageIdKey, targetInfo.targetId);
          }
        });
      }
      return;
    }

    log.debug(`Target created for app '${appIdKey}' and page '${pageIdKey}': ${JSON.stringify(targetInfo)}`);
    if (_.has(this.targets[appIdKey], pageIdKey)) {
      log.debug(`There is already a target for this app and page ('${this.targets[appIdKey][pageIdKey]}'). This might cause problems`);
    }
    const lock = new AsyncLock();
    this.targets[app] = this.targets[app] || { lock };
    this.targets[appIdKey][pageIdKey] = targetInfo.targetId;

    await lock.acquire(toLockKey(appIdKey, pageIdKey), async () => {
      try {
        await this.send('Target.setPauseOnStart', {
          pauseOnStart: true,
          appIdKey,
          pageIdKey,
        });
      } catch {}
      try {
        await this._initializePage(appIdKey, pageIdKey);
      } finally {
        if (targetInfo.isPaused) {
          await this._resumeTarget(appIdKey, pageIdKey);
        }
      }
    });
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
    return (this.targets[appIdKey] || {})[pageIdKey];
  }

  /**
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} pageIdKey
   * @returns {Promise<void>}
   */
  async selectPage (appIdKey, pageIdKey) {
    this._pendingTargetNotification = [appIdKey, pageIdKey];

    // go through the steps that the Desktop Safari system
    // goes through to initialize the Web Inspector session

    const sendOpts = {
      appIdKey,
      pageIdKey,
    };

    // highlight and then un-highlight the webview
    for (const enabled of [true, false]) {
      await this.send('indicateWebView', Object.assign({
        enabled,
      }, sendOpts), false);
    }

    await this.send('setSenderKey', sendOpts);
    log.debug('Sender key set');

    if (!this.isTargetBased) {
      await this._initializePage(appIdKey, pageIdKey);
      return;
    }

    if (this.isTargetBased && util.compareVersions(this.platformVersion, '<', MIN_PLATFORM_NO_TARGET_EXISTS)) {
      await this.send('Target.exists', sendOpts, false);
    }

    await this.waitForTarget(appIdKey, pageIdKey);
    await this.waitForPageInitialization(appIdKey, pageIdKey);
  }

  /**
   * Mimic every step that Desktop Safari Develop tools uses to initialize a
   * Web Inspector session
   *
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} pageIdKey
   * @param {import('../types').TargetId} [targetId]
   * @returns {Promise<void>}
   */
  async _initializePage (appIdKey, pageIdKey, targetId) {
    const sendOpts = {
      appIdKey,
      pageIdKey,
      targetId,
    };

    log.debug(`Initializing page '${pageIdKey}' for app '${appIdKey}'`);
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
        }
      }
      log.debug(`Simple initialization of page '${pageIdKey}' for app '${appIdKey}' completed`);
      return;
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
            }
          }
        }
      } catch (err) {
        log.info(`Cannot enable domain '${domain}' during full initialization: ${err.message}`);
      }
    }
    log.debug(`Full initialization of page '${pageIdKey}' for app '${appIdKey}' completed`);
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
   * @param {import('../types').TargetId} [targetId]
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
    } catch {}
  }

  /**
   *
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} pageIdKey
   */
  async waitForPageInitialization (appIdKey, pageIdKey) {
    const appTargetsMap = this.targets[appIdKey];
    if (!appTargetsMap) {
      throw new Error(`No targets found for app '${appIdKey}'`);
    }
    /** @type {AsyncLock | undefined}  */
    const lock = appTargetsMap.lock;
    if (lock?.isBusy()) {
      const timer = new timing.Timer().start();
      log.debug(`Waiting until page ${pageIdKey}@${appIdKey} is fully initialized`);
      await lock.acquire(toLockKey(appIdKey, pageIdKey), async () => await B.delay(0));
      log.debug(
        `The initalization of the page ${pageIdKey}@${appIdKey} took ${timer.getDuration().asMilliSeconds}ms`
      );
    }
  }
}

/**
 *
 * @param {import('../types').AppIdKey} appIdKey
 * @param {import('../types').PageIdKey} pageIdKey
 * @returns {string}
 */
export function toLockKey(appIdKey, pageIdKey) {
  return `${appIdKey}-${pageIdKey}`;
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
 * @property {string} [udid]
 */

/**
 * @typedef {{[key: import('../types').PageIdKey]: import('../types').TargetId}} PageDict
 */

/**
 * @typedef {PageDict & {provisional?: import('../types').ProvisionalTargetInfo, lock: import('async-lock').default}} PagesToTargets
 * @typedef {{[key: import('../types').AppIdKey]: PagesToTargets}} AppToTargetsMap
 */