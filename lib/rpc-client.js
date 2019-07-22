import RemoteMessages from './remote-messages';
import { retryInterval } from 'asyncbox';
import log from './logger';
import _ from 'lodash';
import B from 'bluebird';
import UUID from 'uuid-js';
import RpcMessageHandler from './remote-debugger-message-handler';
import { isTargetBased } from './helpers';


const DATA_LOG_LENGTH = {length: 200};

const WAIT_FOR_TARGET_RETRIES = 10;
const WAIT_FOR_TARGET_INTERVAL = 1000;

export default class RpcClient {
  constructor (opts = {}) {
    this._targets = [];
    this._shouldCheckForTarget = !!opts.shouldCheckForTarget;

    const {
      platformVersion = {},
      isSafari = true,
      specialMessageHandlers = {},
      logFullResponse = false,
    } = opts;

    this.connected = false;
    this.connId = UUID.create().toString();
    this.senderId = UUID.create().toString();
    this.msgId = 0;
    this.logFullResponse = logFullResponse;

    // message handlers
    this.specialMessageHandlers = specialMessageHandlers;

    // start with a best guess for the protocol
    this.setCommunicationProtocol(isTargetBased(isSafari, platformVersion));
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

  async waitForTarget () {
    if (!this.shouldCheckForTarget || !this.isTargetBased) {
      return;
    }

    await retryInterval(WAIT_FOR_TARGET_RETRIES, WAIT_FOR_TARGET_INTERVAL, () => {
      if (_.isEmpty(this.targets)) {
        throw new Error('No targets found, unable to communicate with device');
      }
    });
  }

  async send (command, opts = {}) {
    try {
      await this.waitForTarget();
      return await this.sendToDevice(command, opts);
    } catch (err) {
      if (err.message.includes(`'Target' domain was not found`)) {
        this.setCommunicationProtocol(false);
        return await this.sendToDevice(command, opts);
      } else if (err.message.includes(`domain was not found`)) {
        this.setCommunicationProtocol(true);
        await this.waitForTarget();
        return await this.sendToDevice(command, opts);
      }
      throw err;
    }
  }

  async sendToDevice (command, opts = {}) {
    return await new B(async (resolve, reject) => {
      // promise to be resolved whenever remote debugger
      // replies to our request

      // keep track of the messages coming and going using a simple sequential id
      const msgId = this.msgId++;

      // retrieve the correct command to send
      const sendOpts = _.defaults({connId: this.connId, senderId: this.senderId}, opts);
      const cmd = this.remoteMessages.getRemoteCommand(command, sendOpts);

      let messageHandled = false;
      if (this.messageHandler.hasSpecialMessageHandler(cmd.__selector)) {
        messageHandled = true;

        // special replies will return any number of arguments
        // temporarily wrap with promise handling
        const specialMessageHandler = this.getSpecialMessageHandler(cmd.__selector);
        this.setSpecialMessageHandler(cmd.__selector, reject, (...args) => {
          const response = this.logFullResponse
            ? JSON.stringify(args, null, 2)
            : _.truncate(JSON.stringify(args), DATA_LOG_LENGTH);
          log.debug(`Received response from send: '${response}'`);

          // call the original listener, and put it back, if necessary
          specialMessageHandler(...args);
          if (this.messageHandler.hasSpecialMessageHandler(cmd.__selector)) {
            // this means that the system has not removed this listener
            this.setSpecialMessageHandler(cmd.__selector, null, specialMessageHandler);
          }

          resolve(args);
        });
      } else if (cmd.__argument && cmd.__argument.WIRSocketDataKey) {
        messageHandled = true;

        const errorHandler = function (err) {
          const msg = `Remote debugger error with code '${err.code}': ${err.message}`;
          reject(new Error(msg));
        };

        this.setDataMessageHandler(msgId.toString(), errorHandler, function dataMessageHandler (value) {
          const msg = _.truncate(_.isString(value) ? value : JSON.stringify(value), {length: 50});
          log.debug(`Received data response from send: '${msg}'`);
          log.debug(`Original command: ${command}`);
          resolve(value);
        });

        // make sure the message being sent has all the information that is needed
        if (cmd.__argument.WIRSocketDataKey.params) {
          cmd.__argument.WIRSocketDataKey.params.id = msgId;
          if (!cmd.__argument.WIRSocketDataKey.params.targetId) {
            cmd.__argument.WIRSocketDataKey.params.targetId = `page-${sendOpts.pageIdKey}`;
          }
          if (cmd.__argument.WIRSocketDataKey.params.message) {
            cmd.__argument.WIRSocketDataKey.params.message.id = msgId;
            cmd.__argument.WIRSocketDataKey.params.message = JSON.stringify(cmd.__argument.WIRSocketDataKey.params.message);
          }
        }
        cmd.__argument.WIRSocketDataKey.id = msgId;
        cmd.__argument.WIRSocketDataKey =
          Buffer.from(JSON.stringify(cmd.__argument.WIRSocketDataKey));
      }

      log.debug(`Sending '${cmd.__selector}' message to remote debugger (id: ${msgId})`);
      try {
        const res = await this.sendMessage(cmd, messageHandled);
        if (!messageHandled) {
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

  addTarget (targetInfo) {
    if (_.isUndefined(targetInfo) || _.isUndefined(targetInfo.targetId)) {
      log.debug(`Received 'targetCreated' event with no target. Skipping`);
      return;
    }
    log.debug(`Target created: ${JSON.stringify(targetInfo)}`);
    if (!this.targets.includes(targetInfo.targetId)) {
      this.targets.push(targetInfo.targetId);
    }
  }

  removeTarget (targetInfo) {
    if (_.isUndefined(targetInfo) || _.isUndefined(targetInfo.targetId)) {
      log.debug(`Received 'taretDestroyed' event with no target. Skipping`);
      return;
    }
    log.debug(`Target destroyed: ${JSON.stringify(targetInfo)}`);
    _.pull(this.targets, targetInfo.targetId);
  }

  get targets () {
    this._targets = this._targets || [];
    return this._targets;
  }

  get target () {
    if (_.isEmpty(this.targets)) {
      throw new Error('No targets found, unable to communicate with device');
    }

    // at the moment, there is no indication of how the mapping works
    // so take the first?
    return _.first(this.targets);
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

  allowNavigationWithoutReload (allow = true) {
    this.messageHandler.allowNavigationWithoutReload(allow);
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
        const [connectedAppIdKey, pageDict] = await this.send('connectToApp', {
          appIdKey
        });

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
