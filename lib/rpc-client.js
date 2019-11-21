import RemoteMessages from './remote-messages';
import { waitForCondition } from 'asyncbox';
import log from './logger';
import _ from 'lodash';
import B from 'bluebird';
import UUID from 'uuid-js';
import RpcMessageHandler from './rpc-message-handler';
import { getElapsedTime } from './helpers';
import { util } from 'appium-support';


const DATA_LOG_LENGTH = {length: 200};

const WAIT_FOR_TARGET_TIMEOUT = 10000;
const WAIT_FOR_TARGET_INTERVAL = 1000;

const MIN_PLATFORM_FOR_TARGET_BASED = '12.2';

function isTargetBased (isSafari, platformVersion) {
  // on iOS 12.2 the messages get sent through the Target domain
  const isHighVersion = util.compareVersions(platformVersion, '>=', MIN_PLATFORM_FOR_TARGET_BASED);
  log.debug(`Checking which communication style to use (${isSafari ? '' : 'non-'}Safari on platform version '${platformVersion}')`);
  log.debug(`Platform version equal or higher than '${MIN_PLATFORM_FOR_TARGET_BASED}': ${isHighVersion}`);
  return isSafari && isHighVersion;
}

export default class RpcClient {
  constructor (opts = {}) {
    this._targets = [];
    this._shouldCheckForTarget = !!opts.shouldCheckForTarget;

    const {
      bundleId,
      platformVersion = {},
      isSafari = true,
      specialMessageHandlers = {},
      logAllCommunication = false,
      logAllCommunicationHexDump = false,
      socketChunkSize,
    } = opts;

    this.isSafari = isSafari;

    this.connected = false;
    this.connId = UUID.create().toString();
    this.senderId = UUID.create().toString();
    this.msgId = 0;

    this.logAllCommunication = logAllCommunication;
    this.logAllCommunicationHexDump = logAllCommunicationHexDump;
    this.socketChunkSize = socketChunkSize;

    this.bundleId = bundleId;
    this.platformVersion = platformVersion;

    // message handlers
    this.specialMessageHandlers = specialMessageHandlers;
    // add message handlers for events that are purely rpc related
    this.specialMessageHandlers.targetCreated = this.addTarget.bind(this);
    this.specialMessageHandlers.targetDestroyed = this.removeTarget.bind(this),

    // start with a best guess for the protocol
    this.setCommunicationProtocol(isTargetBased(isSafari, this.platformVersion));
  }

  setCommunicationProtocol (isTargetBased = false) {
    log.warn(`Setting communication protocol: using ${isTargetBased ? 'Target-based' : 'full Web Inspector protocol'} communication`);
    this.isTargetBased = isTargetBased;

    if (!this.remoteMessages) {
      this.remoteMessages = new RemoteMessages(isTargetBased);
    } else {
      this.remoteMessages.setCommunicationProtocol(isTargetBased);
    }

    if (!this.messageHandler) {
      this.messageHandler = new RpcMessageHandler(this.specialMessageHandlers, isTargetBased);
    } else {
      this.messageHandler.setCommunicationProtocol(isTargetBased);
    }
  }

  needsTarget () {
    return this.shouldCheckForTarget && this.isTargetBased;
  }

  async waitForTarget (appIdKey, pageIdKey) {
    if (!this.needsTarget()) {
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
    const startTime = process.hrtime();
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
      if (err.message.includes(`'Target' domain was not found`)) {
        this.setCommunicationProtocol(false);
        return await this.sendToDevice(command, opts, waitForResponse);
      } else if (err.message.includes(`domain was not found`) || err.message.includes(`Some arguments of method`)) {
        this.setCommunicationProtocol(true);
        await this.waitForTarget(appIdKey, pageIdKey);
        return await this.sendToDevice(command, opts, waitForResponse);
      }
      throw err;
    } finally {
      log.debug(`Sending to Web Inspector took ${getElapsedTime(startTime)}ms`);
    }
  }

  async sendToDevice (command, opts = {}, waitForResponse = true) {
    return await new B(async (resolve, reject) => {
      // promise to be resolved whenever remote debugger
      // replies to our request

      // keep track of the messages coming and going using a simple sequential id
      const wrapperMsgId = this.msgId++;
      let msgId = wrapperMsgId;
      if (this.isTargetBased) {
        // for target-base communication, everything is wrapped up
        msgId = this.msgId++;
        // acknowledge wrapper message
        this.setDataMessageHandler(wrapperMsgId.toString(), reject, _.noop);
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

      if (cmd.__argument && cmd.__argument.WIRSocketDataKey) {
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
        this.setDataMessageHandler(msgId.toString(), reject, _.noop);
      } else if (this.messageHandler.hasSpecialMessageHandler(cmd.__selector)) {
        // special replies will return any number of arguments
        // temporarily wrap with promise handling
        const specialMessageHandler = this.getSpecialMessageHandler(cmd.__selector);
        this.setSpecialMessageHandler(cmd.__selector, reject, (...args) => {
          log.debug(`Received response from send (id: ${msgId}): '${_.truncate(JSON.stringify(args), DATA_LOG_LENGTH)}'`);

          // call the original listener, and put it back, if necessary
          specialMessageHandler(...args);
          if (this.messageHandler.hasSpecialMessageHandler(cmd.__selector)) {
            // this means that the system has not removed this listener
            this.setSpecialMessageHandler(cmd.__selector, null, specialMessageHandler);
          }

          resolve(args);
        });
      } else if (cmd.__argument && cmd.__argument.WIRSocketDataKey) {
        const errorHandler = function (err) {
          const msg = `Remote debugger error with code '${err.code}': ${err.message}`;
          reject(new Error(msg));
        };
        this.setDataMessageHandler(msgId.toString(), errorHandler, (value) => {
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
        (this.needsTarget() ? `, target '${targetId}'` : '') +
        ` (id: ${msgId})`;
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

  async sendMessage (/* command */) { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'sendMessage' function`);
  }

  addTarget (app, targetInfo) {
    if (_.isUndefined(targetInfo) || _.isUndefined(targetInfo.targetId)) {
      log.warn(`Received 'targetCreated' event with no target. Skipping`);

      return;
    }
    if (_.isEmpty(this.pendingTargetNotification)) {
      log.warn(`Received 'targetCreated' event with no pending request: ${JSON.stringify(targetInfo)}`);
      return;
    }

    const [appIdKey, pageIdKey] = this.pendingTargetNotification;
    if (_.has(targetInfo, 'type')) {
      // real target notifications (from Web Inspector, not from Appium)
      // have a 'type'. If we have already set the target, and get a new
      // notification, we want to follow it
      this.pendingTargetNotification = null;
    }

    log.debug(`Target created for app '${appIdKey}' and page '${pageIdKey}': ${JSON.stringify(targetInfo)}`);
    if (_.has(this.targets[appIdKey], pageIdKey)) {
      log.debug(`There is already a target for this app and page ('${this.targets[appIdKey][pageIdKey]}'). This might cause problems`);
    }
    this.targets[appIdKey] = this.targets[appIdKey] || {};
    this.targets[appIdKey][pageIdKey] = targetInfo.targetId;
  }

  removeTarget (app, targetInfo) {
    if (_.isUndefined(targetInfo) || _.isUndefined(targetInfo.targetId)) {
      log.debug(`Received 'targetDestroyed' event with no target. Skipping`);
      return;
    }
    log.debug(`Target destroyed: ${JSON.stringify(targetInfo)}`);
    _.pull(this.targets, targetInfo.targetId);
  }

  get targets () {
    this._targets = this._targets || {};
    return this._targets;
  }

  getTarget (appIdKey, pageIdKey) {
    return (this.targets[appIdKey] || {})[pageIdKey];
  }

  get shouldCheckForTarget () {
    return this._shouldCheckForTarget;
  }

  set shouldCheckForTarget (shouldCheckForTarget) {
    this._shouldCheckForTarget = !!shouldCheckForTarget;
  }

  async connect () { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'connect' function`);
  }

  async disconnect () { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'disconnect' function`);
  }

  isConnected () {
    return this.connected;
  }

  setSpecialMessageHandler (key, errorHandler, handler) {
    this.messageHandler.setSpecialMessageHandler(key, errorHandler, handler);
  }

  getSpecialMessageHandler (key) {
    return this.messageHandler.getSpecialMessageHandler(key);
  }

  setDataMessageHandler (key, errorHandler, handler) {
    this.messageHandler.setDataMessageHandler(key, errorHandler, handler);
  }

  async selectPage (appIdKey, pageIdKey) {
    this.pendingTargetNotification = [appIdKey, pageIdKey];
    this.shouldCheckForTarget = false;

    const sendOpts = {
      appIdKey,
      pageIdKey,
    };

    await this.send('setSenderKey', sendOpts);
    log.debug('Sender key set');

    if (this.isTargetBased) {
      await this.send('targetExists', sendOpts, false);
    }

    this.shouldCheckForTarget = true;

    await this.send('enableInspector', sendOpts);
    await this.send('enablePage', sendOpts);
    await this.send('enableRuntime', sendOpts);
    await this.send('enableDebugger', sendOpts);
    await this.send('enableConsole', sendOpts);
    await this.send('inspectorInitialized', sendOpts);
  }

  async selectApp (appIdKey, applicationConnectedHandler) {
    return await new B((resolve, reject) => {
      // local callback, temporarily added as callback to
      // `_rpc_applicationConnected:` remote debugger response
      // to handle the initial connection
      const onAppChange = (dict) => {
        // from the dictionary returned, get the ids
        let oldAppIdKey = dict.WIRHostApplicationIdentifierKey;
        let correctAppIdKey = dict.WIRApplicationIdentifierKey;

        // if this is a report of a proxy redirect from the remote debugger
        // we want to update our dictionary and get a new app id
        if (oldAppIdKey && correctAppIdKey !== oldAppIdKey) {
          log.debug(`We were notified we might have connected to the wrong app. ` +
                    `Using id ${correctAppIdKey} instead of ${oldAppIdKey}`);
        }

        applicationConnectedHandler(dict);
        reject(new Error('New application has connected'));
      };
      this.setSpecialMessageHandler('_rpc_applicationConnected:', reject, onAppChange);

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
    }).finally(() => {
      // no matter what, we want to restore the handler that was changed.
      this.setSpecialMessageHandler('_rpc_applicationConnected:', null, applicationConnectedHandler);
    });
  }

  async receive (/* data */) { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'receive' function`);
  }

  setTimelineEventHandler (timelineEventHandler) {
    this.timelineEventHandler = timelineEventHandler;
    this.messageHandler.setTimelineEventHandler(timelineEventHandler);
  }

  setConsoleLogEventHandler (consoleEventHandler) {
    this.consoleEventHandler = consoleEventHandler;
    this.messageHandler.setConsoleLogEventHandler(consoleEventHandler);
  }

  setNetworkLogEventHandler (networkEventHandler) {
    this.networkEventHandler = networkEventHandler;
    this.messageHandler.setNetworkEventHandler(networkEventHandler);
  }
}
