import RemoteMessages from './remote-messages';
import { waitForCondition } from 'asyncbox';
import log from '../logger';
import _ from 'lodash';
import B from 'bluebird';
import RpcMessageHandler from './rpc-message-handler';
import { util, timing } from 'appium-support';


const DATA_LOG_LENGTH = {length: 200};

const WAIT_FOR_TARGET_TIMEOUT = 10000;
const WAIT_FOR_TARGET_INTERVAL = 1000;

const MIN_PLATFORM_FOR_TARGET_BASED = '12.2';

// `Target.exists` protocol method was removed from WebKitin 13.4
const MIN_PLATFORM_NO_TARGET_EXISTS = '13.4';

function isTargetBased (isSafari, platformVersion) {
  // On iOS 12.2 the messages get sent through the Target domain
  // On iOS 13.0+, WKWebView also needs to follow the Target domain,
  // so here only check the target OS version as the default behaviour.
  const isHighVersion = util.compareVersions(platformVersion, '>=', MIN_PLATFORM_FOR_TARGET_BASED);
  log.debug(`Checking which communication style to use (${isSafari ? '' : 'non-'}Safari on platform version '${platformVersion}')`);
  log.debug(`Platform version equal or higher than '${MIN_PLATFORM_FOR_TARGET_BASED}': ${isHighVersion}`);
  return isHighVersion;
}

export default class RpcClient {
  constructor (opts = {}) {
    this._targets = [];
    this._shouldCheckForTarget = !!opts.shouldCheckForTarget;

    const {
      bundleId,
      platformVersion = {},
      isSafari = true,
      logAllCommunication = false,
      logAllCommunicationHexDump = false,
      webInspectorMaxFrameLength,
      socketChunkSize,
      fullPageInitialization = false,
    } = opts;

    this.isSafari = isSafari;

    this.isConnected = false;
    this.connId = util.uuidV4();
    this.senderId = util.uuidV4();
    this.msgId = 0;

    this.logAllCommunication = logAllCommunication;
    this.logAllCommunicationHexDump = logAllCommunicationHexDump;
    this.socketChunkSize = socketChunkSize;
    this.webInspectorMaxFrameLength = webInspectorMaxFrameLength;

    this.fullPageInitialization = fullPageInitialization;

    this.bundleId = bundleId;
    this.platformVersion = platformVersion;

    this._contexts = [];
    this._targets = {};

    // start with a best guess for the protocol
    this.isTargetBased = isTargetBased(isSafari, this.platformVersion);
  }

  get contexts () {
    return this._contexts;
  }

  get needsTarget () {
    return this.shouldCheckForTarget && this.isTargetBased;
  }

  get targets () {
    return this._targets;
  }

  get shouldCheckForTarget () {
    return this._shouldCheckForTarget;
  }

  set shouldCheckForTarget (shouldCheckForTarget) {
    this._shouldCheckForTarget = !!shouldCheckForTarget;
  }

  get isConnected () {
    return this.connected;
  }

  set isConnected (connected) {
    this.connected = !!connected;
  }

  on (event, listener) {
    this.messageHandler.on(event, listener);
    return this;
  }

  once (event, listener) {
    this.messageHandler.once(event, listener);
    return this;
  }

  off (event, listener) {
    this.messageHandler.off(event, listener);
    return this;
  }

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

  get isTargetBased () {
    return this._isTargetBased;
  }

  async waitForTarget (appIdKey, pageIdKey, force = false) {
    if (!force && !this.needsTarget) {
      return;
    }

    if (this.getTarget(appIdKey, pageIdKey)) {
      return;
    }

    // otherwise waiting is necessary to see what the target is
    try {
      await waitForCondition(() => !_.isEmpty(this.getTarget(appIdKey, pageIdKey)), {
        waitMs: WAIT_FOR_TARGET_TIMEOUT,
        intervalMs: WAIT_FOR_TARGET_INTERVAL,
        error: 'No targets found, unable to communicate with device',
      });
    } catch (err) {
      if (!err.message.includes('Condition unmet')) {
        throw err;
      }
      throw new Error('No targets found, unable to communicate with device');
    }
  }

  async send (command, opts = {}, waitForResponse = true) {
    const timer = new timing.Timer().start();
    const {
      appIdKey,
      pageIdKey
    } = opts;
    try {
      if (!_.isEmpty(appIdKey) && !_.isEmpty(pageIdKey)) {
        await this.waitForTarget(appIdKey, pageIdKey);
      }
      return await this.sendToDevice(command, opts, waitForResponse);
    } catch (err) {
      let { message = '' } = err;
      message = message.toLowerCase();
      if (message.includes(`'target' domain was not found`)) {
        log.info('The target device does not support Target based communication. ' +
          'Will follow non-target based communication.');
        this.isTargetBased = false;
        return await this.sendToDevice(command, opts, waitForResponse);
      } else if (message.includes(`domain was not found`) ||
          message.includes(`some arguments of method`) ||
          message.includes(`missing target`)) {
        this.isTargetBased = true;
        await this.waitForTarget(appIdKey, pageIdKey);
        return await this.sendToDevice(command, opts, waitForResponse);
      }
      throw err;
    } finally {
      log.debug(`Sending to Web Inspector took ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
    }
  }

  async sendToDevice (command, opts = {}, waitForResponse = true) {
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
        this.messageHandler.on(wrapperMsgId.toString(), function (err) {
          if (err) {
            reject(err);
          }
        });
      }

      const appIdKey = opts.appIdKey;
      const pageIdKey = opts.pageIdKey;
      const targetId = this.getTarget(appIdKey, pageIdKey);

      // retrieve the correct command to send
      const fullOpts = _.defaults({
        connId: this.connId,
        senderId: this.senderId,
        targetId,
        id: msgId,
      }, opts);
      const cmd = this.remoteMessages.getRemoteCommand(command, fullOpts);

      if (cmd?.__argument?.WIRSocketDataKey) {
        // make sure the message being sent has all the information that is needed
        if (_.isNil(cmd.__argument.WIRSocketDataKey.id)) {
          cmd.__argument.WIRSocketDataKey.id = wrapperMsgId;
        }
        cmd.__argument.WIRSocketDataKey =
          Buffer.from(JSON.stringify(cmd.__argument.WIRSocketDataKey));
      }

      let messageHandled = true;
      if (!waitForResponse) {
        // the promise will be resolved as soon as the socket has been sent
        messageHandled = false;
        // do not log receipts
        this.messageHandler.once(msgId.toString(), function (err) {
          if (err) {
            // we are not waiting for this, and if it errors it is most likely
            // a protocol change. Log and check during testing
            log.error(`Received error from send that is not being waited for (id: ${msgId}): '${_.truncate(JSON.stringify(err), DATA_LOG_LENGTH)}'`);
            // reject, though it is very rare that this will be triggered, since
            // the promise is resolved directlty after send. On the off chance,
            // though, it will alert of a protocol change.
            reject(err);
          }
        });
      } else if (this.messageHandler.listeners(cmd.__selector).length) {
        this.messageHandler.prependOnceListener(cmd.__selector, function (err, ...args) {
          if (err) {
            return reject(err);
          }
          log.debug(`Received response from send (id: ${msgId}): '${_.truncate(JSON.stringify(args), DATA_LOG_LENGTH)}'`);
          resolve(args);
        });
      } else if (cmd?.__argument?.WIRSocketDataKey) {
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
        (fullOpts.appIdKey ? ` to app '${fullOpts.appIdKey}'` : '') +
        (fullOpts.pageIdKey ? `, page '${fullOpts.pageIdKey}'` : '') +
        (this.needsTarget && targetId ? `, target '${targetId}'` : '') +
        ` (id: ${msgId}): '${command}'`;
      log.debug(msg);
      try {
        const res = await this.sendMessage(cmd);
        if (!messageHandled) {
          // There are no handlers waiting for a response before resolving,
          // and no errors sending the message over the socket, so resolve
          resolve(res);
        }
      } catch (err) {
        return reject(err);
      }
    });
  }

  async connect () { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'connect' function`);
  }

  async disconnect () { // eslint-disable-line require-await
    this.messageHandler.removeAllListeners();
  }

  async sendMessage (/* command */) { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'sendMessage' function`);
  }

  async receive (/* data */) { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'receive' function`);
  }

  addTarget (err, app, targetInfo) {
    if (_.isNil(targetInfo?.targetId)) {
      log.warn(`Received 'Target.targetCreated' event for app '${app}' with no target. Skipping`);
      return;
    }
    if (_.isEmpty(this.pendingTargetNotification) && !targetInfo.isProvisional) {
      log.warn(`Received 'Target.targetCreated' event for app '${app}' with no pending request: ${JSON.stringify(targetInfo)}`);
      return;
    }

    if (targetInfo.isProvisional) {
      log.debug(`Provisional target created for app '${app}', '${targetInfo.targetId}'. Ignoring until target update event`);
      return;
    }

    const [appIdKey, pageIdKey] = this.pendingTargetNotification;

    log.debug(`Target created for app '${appIdKey}' and page '${pageIdKey}': ${JSON.stringify(targetInfo)}`);
    if (_.has(this.targets[appIdKey], pageIdKey)) {
      log.debug(`There is already a target for this app and page ('${this.targets[appIdKey][pageIdKey]}'). This might cause problems`);
    }
    this.targets[app] = this.targets[app] || {};
    this.targets[appIdKey][pageIdKey] = targetInfo.targetId;
  }

  updateTarget (err, app, oldTargetId, newTargetId) {
    log.debug(`Target updated for app '${app}'. Old target: '${oldTargetId}', new target: '${newTargetId}'`);
    if (!this.targets[app]) {
      log.warn(`No existing target for app '${app}'. Not sure what to do`);
      return;
    }
    // save this, to be used if/when the existing target is destroyed
    this.targets[app].provisional = {
      oldTargetId,
      newTargetId,
    };
  }

  removeTarget (err, app, targetInfo) {
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
      const targets = this.targets[app];
      for (const [page, targetId] of _.toPairs(targets)) {
        if (targetId === oldTargetId) {
          log.debug(`Found provisional target for app '${app}'. Old target: '${oldTargetId}', new target: '${newTargetId}'. Updating`);
          targets[page] = newTargetId;
          return;
        }
      }
      log.warn(`Provisional target for app '${app}' found, but no suitable existing target found. This may cause problems`);
      log.warn(`Old target: '${oldTargetId}', new target: '${newTargetId}'. Existing targets: ${JSON.stringify(targets)}`);
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

  getTarget (appIdKey, pageIdKey) {
    return (this.targets[appIdKey] || {})[pageIdKey];
  }

  async selectPage (appIdKey, pageIdKey) {
    this.pendingTargetNotification = [appIdKey, pageIdKey];
    this.shouldCheckForTarget = false;

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

    if (this.isTargetBased && util.compareVersions(this.platformVersion, '<', MIN_PLATFORM_NO_TARGET_EXISTS)) {
      await this.send('Target.exists', sendOpts, false);
    }

    this.shouldCheckForTarget = true;

    if (this.fullPageInitialization) {
      await this.initializePageFull(appIdKey, pageIdKey);
    } else {
      await this.initializePage(appIdKey, pageIdKey);
    }
  }

  /*
   * Perform the minimal initialization to get the Web Inspector working
   */
  async initializePage (appIdKey, pageIdKey) {
    const sendOpts = {
      appIdKey,
      pageIdKey,
    };

    await this.send('Inspector.enable', sendOpts, false);
    await this.send('Page.enable', sendOpts, false);

    // go through the tasks to initialize
    await this.send('Network.enable', sendOpts, false);
    await this.send('Runtime.enable', sendOpts, false);
    await this.send('Heap.enable', sendOpts, false);
    await this.send('Debugger.enable', sendOpts, false);
    await this.send('Console.enable', sendOpts, false);
    await this.send('Inspector.initialized', sendOpts, false);
  }

  /*
   * Mimic every step that Desktop Safari Develop tools uses to initialize a
   * Web Inspector session
   */
  async initializePageFull (appIdKey, pageIdKey) {
    const sendOpts = {
      appIdKey,
      pageIdKey,
    };

    await this.send('Inspector.enable', sendOpts, false);
    await this.send('Page.enable', sendOpts, false);

    // go through the tasks to initialize
    await this.send('Page.getResourceTree', sendOpts, false);
    await this.send('Network.enable', sendOpts, false);
    await this.send('Network.setResourceCachingDisabled', Object.assign({
      disabled: false,
    }, sendOpts), false);
    await this.send('DOMStorage.enable', sendOpts, false);
    await this.send('Database.enable', sendOpts, false);
    await this.send('IndexedDB.enable', sendOpts, false);
    await this.send('CSS.enable', sendOpts, false);
    await this.send('Runtime.enable', sendOpts, false);
    await this.send('Heap.enable', sendOpts, false);
    await this.send('Memory.enable', sendOpts, false);
    await this.send('ApplicationCache.enable', sendOpts, false);
    await this.send('ApplicationCache.getFramesWithManifests', sendOpts, false);
    await this.send('Timeline.setInstruments', Object.assign({
      instruments: ['Timeline', 'ScriptProfiler', 'CPU'],
    }, sendOpts), false);
    await this.send('Timeline.setAutoCaptureEnabled', Object.assign({
      enabled: false,
    }, sendOpts), false);
    await this.send('Debugger.enable', sendOpts, false);
    await this.send('Debugger.setBreakpointsActive', Object.assign({
      active: true,
    }, sendOpts), false);
    await this.send('Debugger.setPauseOnExceptions', Object.assign({
      state: 'none',
    }, sendOpts), false);
    await this.send('Debugger.setPauseOnAssertions', Object.assign({
      enabled: false,
    }, sendOpts), false);
    await this.send('Debugger.setAsyncStackTraceDepth', Object.assign({
      depth: 200,
    }, sendOpts), false);
    await this.send('Debugger.setPauseForInternalScripts', Object.assign({
      shouldPause: false,
    }, sendOpts), false);

    await this.send('LayerTree.enable', sendOpts, false);
    await this.send('Worker.enable', sendOpts, false);
    await this.send('Canvas.enable', sendOpts, false);
    await this.send('Console.enable', sendOpts, false);
    await this.send('DOM.getDocument', sendOpts, false);
    const loggingChannels = await this.send('Console.getLoggingChannels', sendOpts);
    for (const source of (loggingChannels.channels || []).map((entry) => entry.source)) {
      await this.send('Console.setLoggingChannelLevel', Object.assign({
        source,
        level: 'verbose',
      }, sendOpts), false);
    }

    await this.send('Inspector.initialized', sendOpts, false);
  }

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

        reject(new Error('New application has connected'));
      };
      this.messageHandler.prependOnceListener('_rpc_applicationConnected:', onAppChange);

      // do the actual connecting to the app
      return (async () => {
        let pageDict, connectedAppIdKey;
        try {
          ([connectedAppIdKey, pageDict] = await this.send('connectToApp', {
            appIdKey
          }));
        } catch (err) {
          log.warn(`Unable to connect to app: ${err.message}`);
          reject(err);
        }

        // sometimes the connect logic happens, but with an empty dictionary
        // which leads to the remote debugger getting disconnected, and into a loop
        if (_.isEmpty(pageDict)) {
          let msg = 'Empty page dictionary received';
          log.debug(msg);
          reject(new Error(msg));
        } else {
          resolve([connectedAppIdKey, pageDict]);
        }
      })();
    });
  }

  onExecutionContextCreated (err, context) {
    // { id: 2, isPageContext: true, name: '', frameId: '0.1' }
    // right now we have no way to map contexts to apps/pages
    // so just store
    this.contexts.push(context.id);
  }

  onGarbageCollected () {
    // just want to log that this is happening, as it can affect opertion
    log.debug(`Web Inspector garbage collected`);
  }

  onScriptParsed (err, scriptInfo) {
    // { scriptId: '13', url: '', startLine: 0, startColumn: 0, endLine: 82, endColumn: 3 }
    log.debug(`Script parsed: ${JSON.stringify(scriptInfo)}`);
  }
}
