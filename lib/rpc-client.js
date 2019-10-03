import RemoteMessages from './remote-messages';
import { waitForCondition } from 'asyncbox';
import log from './logger';
import _ from 'lodash';
import B from 'bluebird';
import UUID from 'uuid-js';
import RpcMessageHandler from './remote-debugger-message-handler';
import { isTargetBased, getElapsedTime } from './helpers';
import { util } from 'appium-support';


const DATA_LOG_LENGTH = {length: 200};

const WAIT_FOR_TARGET_TIMEOUT = 10000;
const WAIT_FOR_TARGET_INTERVAL = 1000;

const ENABLE_PAGE_TIMEOUT = 2000;

const GENERIC_TARGET_ID = 6;
const TARGET_PAGE_PREFIX = 'page-';

export default class RpcClient {
  constructor (opts = {}) {
    this._targets = [];
    this._shouldCheckForTarget = !!opts.shouldCheckForTarget;

    const {
      bundleId,
      platformVersion = {},
      isSafari = true,
      specialMessageHandlers = {},
      logFullResponse = false,
      connectionHandshakeTimeout = ENABLE_PAGE_TIMEOUT,
    } = opts;

    this.isSafari = isSafari;

    this.connected = false;
    this.connId = UUID.create().toString();
    this.senderId = UUID.create().toString();
    this.msgId = 0;
    this.logFullResponse = logFullResponse;

    this.connectionHandshakeTimeout = connectionHandshakeTimeout;

    this.bundleId = bundleId;
    this.platformVersion = platformVersion;

    // message handlers
    this.specialMessageHandlers = specialMessageHandlers;

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

    // iOS less than 13 have targets that can be computed easily
    // and sometimes is not reported by the Web Inspector
    if (util.compareVersions(this.platformVersion, '<', '13.0') && _.isEmpty(this.getTarget(appIdKey, pageIdKey))) {
      if (this.isSafari) {
        this.addTarget(appIdKey, {targetId: `${TARGET_PAGE_PREFIX}${pageIdKey}`});
        return;
      }
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
      await this.waitForTarget(appIdKey, pageIdKey);
      const sendPromise = this.sendToDevice(command, opts, waitForResponse);

      // dummy call to ensure that the actual command returns
      this.sendToDevice('sendJSCommand', {
        command: '1;',
        appIdKey,
        pageIdKey,
      }, true).catch(function () {});

      return await sendPromise;
    } catch (err) {
      if (err.message.includes(`'Target' domain was not found`)) {
        this.setCommunicationProtocol(false);
        return await this.sendToDevice(command, opts, waitForResponse);
      } else if (err.message.includes(`domain was not found`)) {
        this.setCommunicationProtocol(true);
        await this.waitForTarget(appIdKey, pageIdKey);
        return await this.sendToDevice(command, opts, waitForResponse);
      }
      throw err;
    } finally {
      log.debug(`Sending to Web Inspector took ${getElapsedTime(startTime)}ms`);
    }
  }

  getLoggableResponse (res) {
    return _.isString(res)
      ? res
      : this.logFullResponse
        ? JSON.stringify(res, null, 2)
        : _.truncate(JSON.stringify(res), DATA_LOG_LENGTH);
  }

  async sendToDevice (command, opts = {}, waitForResponse = true) {
    return await new B(async (resolve, reject) => {
      // promise to be resolved whenever remote debugger
      // replies to our request

      // keep track of the messages coming and going using a simple sequential id
      const msgId = this.msgId++;

      // retrieve the correct command to send
      const sendOpts = _.defaults({connId: this.connId, senderId: this.senderId}, opts);
      const cmd = this.remoteMessages.getRemoteCommand(command, sendOpts);

      if (cmd.__argument && cmd.__argument.WIRSocketDataKey) {
        // make sure the message being sent has all the information that is needed
        if (cmd.__argument.WIRSocketDataKey.params) {
          cmd.__argument.WIRSocketDataKey.params.id = msgId;
          if (!cmd.__argument.WIRSocketDataKey.params.targetId && this.needsTarget()) {
            cmd.__argument.WIRSocketDataKey.params.targetId = this.getTarget(sendOpts.appIdKey, sendOpts.pageIdKey);
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

      let messageHandled = true;
      if (!waitForResponse) {
        // the promise will be resolved as soon as the socket has been sent
        messageHandled = false;
      } else if (this.messageHandler.hasSpecialMessageHandler(cmd.__selector)) {
        // special replies will return any number of arguments
        // temporarily wrap with promise handling
        const specialMessageHandler = this.getSpecialMessageHandler(cmd.__selector);
        this.setSpecialMessageHandler(cmd.__selector, reject, (...args) => {
          log.debug(`Received response from send (id: ${msgId}): '${this.getLoggableResponse(args)}'`);

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
          log.debug(`Received data response from send (id: ${msgId}): '${this.getLoggableResponse(value)}'`);
          resolve(value);
        });
      } else {
        // nothing else is handling things, so just resolve when the socket is sent
        messageHandled = false;
      }

      const msg = `Sending '${cmd.__selector}' message` +
        (sendOpts.appIdKey ? ` to app '${sendOpts.appIdKey}'` : '') +
        (sendOpts.pageIdKey ? `, page '${sendOpts.pageIdKey}'` : '') +
        (this.needsTarget() ? `, target '${this.getTarget(sendOpts.appIdKey, sendOpts.pageIdKey)}'` : '') +
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

  getAvailableTargets (appIdKey) {
    // get the next target id for the app
    const targetIds = _.values(this.targets[appIdKey])
      .map((targetId) => targetId.replace(TARGET_PAGE_PREFIX, ''))
      .map((targetId) => parseInt(targetId, 10))
      .sort();
    const lastTargetId = (_.last(targetIds) || 0) + 1;

    // construct a range of possible targets
    // start with the generic target id, then the next for this app, then the whole range
    const possibleTargets = [GENERIC_TARGET_ID, lastTargetId, ..._.range(1, 100)];
    // get the targets already in use, and remove the prefix
    const currentTargets = _.reduce(this.targets, function (acc, app) {
      acc.push(..._.values(app));
      return acc;
    }, []).map((target) => target.replace(TARGET_PAGE_PREFIX, ''));
    // find the range that does not include already used targets
    return _.uniq(_.difference(possibleTargets, currentTargets));
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

  allowNavigationWithoutReload (allow = true) {
    this.messageHandler.allowNavigationWithoutReload(allow);
  }

  async selectPage (appIdKey, pageIdKey) {
    this.pendingTargetNotification = [appIdKey, pageIdKey];
    this.shouldCheckForTarget = false;
    await this.send('setSenderKey', {
      appIdKey,
      pageIdKey,
    });
    log.debug('Sender key set');

    this.shouldCheckForTarget = true;

    // this call will require a target, so if there isn't one an error
    // will be thrown and the process of finding a target can begin
    try {
      await this.send('enablePage', {
        appIdKey,
        pageIdKey,
      });
      return;
    } catch (err) {
      if (!err.message.includes('No targets found')) {
        throw err;
      }
    }

    log.debug(`No targets have been indicated by the Web Inspector. Trying out possibilities`);

    // try out the targets that aren't being used
    for (const i of this.getAvailableTargets(appIdKey)) {
      const targetId = `${TARGET_PAGE_PREFIX}${i}`;
      log.debug(`Trying target '${targetId}'`);
      this.pendingTargetNotification = [appIdKey, pageIdKey];
      this.addTarget(appIdKey, {targetId});
      try {
        await B.resolve(this.send('enablePage', {
          appIdKey,
          pageIdKey,
        }, true)).timeout(this.connectionHandshakeTimeout);
        log.debug('Enabled activity on page');
        return;
      } catch (err) {
        if (!(err instanceof B.TimeoutError)) {
          throw err;
        }
      }
    }

    throw new Error('Unable to find target for application');
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
