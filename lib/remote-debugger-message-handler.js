import log from './logger';
import _ from 'lodash';


// we will receive events that we do not listen to.
// if we start to listen to one of these, remove it from the list
const IGNORED_EVENTS = [
  'Page.domContentEventFired',
  'Page.frameStartedLoading',
  'Page.frameStoppedLoading',
  'Page.frameScheduledNavigation',
  'Page.frameClearedScheduledNavigation',
  'Console.messagesCleared',
];

export default class RpcMessageHandler {
  constructor (specialHandlers, isTargetBased = false) {
    this.setHandlers();
    this.errorHandlers = {};
    this.specialHandlers = _.clone(specialHandlers);
    this.dataHandlers = {};
    this.willNavigateWithoutReload = false;

    this.isTargetBased = isTargetBased;
  }

  setCommunicationProtocol (isTargetBased) {
    this.isTargetBased = isTargetBased;
  }

  setDataMessageHandler (key, errorHandler, handler) {
    this.errorHandlers[key] = errorHandler;
    this.dataHandlers[key] = handler;
  }

  setSpecialMessageHandler (key, errorHandler, handler) {
    this.errorHandlers[key] = errorHandler;
    this.specialHandlers[key] = handler;
  }

  getSpecialMessageHandler (key) {
    return this.specialHandlers[key];
  }

  setTimelineEventHandler (timelineEventHandler) {
    this.timelineEventHandler = timelineEventHandler;
  }

  setConsoleLogEventHandler (consoleLogEventHandler) {
    this.consoleLogEventHandler = consoleLogEventHandler;
  }

  setNetworkEventHandler (networkLogEventHandler) {
    this.networkLogEventHandler = networkLogEventHandler;
  }

  hasErrorHandler (key) {
    return _.has(this.errorHandlers, key);
  }

  hasSpecialMessageHandler (key) {
    return _.has(this.specialHandlers, key);
  }

  allowNavigationWithoutReload (allow = true) {
    this.willNavigateWithoutReload = allow;
  }

  async handleMessage (plist) {
    const selector = plist.__selector;
    if (!selector) {
      log.debug('Got an invalid plist');
      return;
    }

    if (_.has(this.handlers, selector)) {
      await this.handlers[selector](plist);
    } else {
      log.debug(`Debugger got a message for '${selector}' and have no ` +
                `handler, doing nothing.`);
    }
  }

  async handleSpecialMessage (handler, ...args) {
    const fn = this.specialHandlers[handler];

    if (fn) {
      // most responses are only to be called once, then
      // removed. But not the ones below, which handle
      // page change and app connect/disconnect
      if (handler !== '_rpc_forwardGetListing:' &&
          handler !== '_rpc_applicationDisconnected:' &&
          handler !== '_rpc_applicationConnected:' &&
          handler !== '_rpc_applicationUpdated:' &&
          handler !== '_rpc_reportConnectedDriverList:') {
        this.specialHandlers[handler] = null;
      }
      await fn(...args);
    } else {
      log.warn(`Tried to access special message handler '${handler}' ` +
               `but none was found`);
    }
  }

  parseDataKey (plist) {
    try {
      return JSON.parse(plist.__argument.WIRMessageDataKey.toString('utf8'));
    } catch (err) {
      log.error(`Unparseable message data: ${_.truncate(JSON.stringify(plist), {length: 100})}`);
      throw new Error(`Unable to parse message data: ${err.message}`);
    }
  }

  async dispatchDataMessage (msgId, method, params, result, error) {
    if (method === 'Profiler.resetProfiles') {
      log.debug('Device is telling us to reset profiles. Should probably ' +
                'do some kind of callback here');
    } else if (method === 'Page.frameNavigated') {
      if (!this.willNavigateWithoutReload && !this.pageLoading) {
        log.debug('Frame navigated, unloading page');
        if (_.isFunction(this.specialHandlers['Page.frameNavigated'])) {
          await this.specialHandlers['Page.frameNavigated']('remote-debugger');
          this.specialHandlers['Page.frameNavigated'] = null;
        }
      } else {
        log.debug('Frame navigated but we were warned about it, not ' +
                  'considering page state unloaded');
        this.willNavigateWithoutReload = false;
      }
    } else if (IGNORED_EVENTS.includes(method)) {
      // pass
    } else if (method === 'Page.loadEventFired' && _.isFunction(this.specialHandlers.pageLoad)) {
      await this.specialHandlers.pageLoad();
    } else if (method === 'Page.frameDetached' && _.isFunction(this.specialHandlers.frameDetached)) {
      await this.specialHandlers.frameDetached();
    } else if (method === 'Timeline.eventRecorded' && _.isFunction(this.timelineEventHandler)) {
      this.timelineEventHandler(params || params.record);
    } else if (method === 'Console.messageAdded' && _.isFunction(this.consoleLogEventHandler)) {
      this.consoleLogEventHandler(params.message);
    } else if (method && method.startsWith('Network.') && _.isFunction(this.networkLogEventHandler)) {
      this.networkLogEventHandler(method, params);
    } else if (_.isFunction(this.dataHandlers[msgId])) {
      log.debug('Found data handler for response');

      // we will either get back a result object that has a result.value
      // in which case that is what we want,
      // or else we return the whole thing
      if (result.result && result.result.value) {
        result = result.result.value;
      }
      this.dataHandlers[msgId](result);
      this.dataHandlers[msgId] = null;
    } else if (this.dataHandlers[msgId] === null) {
      log.error(`Debugger returned data for message ${msgId} ` +
                `but we already ran that callback! WTF??`);
    } else {
      if (msgId || result || error) {
        log.error(`Debugger returned data for message '${msgId}' ` +
                  `but we were not waiting for that message! ` +
                  `result: '${JSON.stringify(result)}'; ` +
                  `error: '${error}'`);
      }
    }
  }

  logFullMessage (plist) {
    // Buffers cannot be serialized in a readable way
    const bufferToJSON = Buffer.prototype.toJSON;
    delete Buffer.prototype.toJSON;
    try {
      log(JSON.stringify(plist, (k, v) => Buffer.isBuffer(v) ? v.toString('utf8') : v, 2));
    } finally {
      // restore the function, so as to not break further serialization
      Buffer.prototype.toJSON = bufferToJSON;
    }
  }

  async handleDataMessage (plist) {
    const dataKey = this.parseDataKey(plist);
    let msgId = (dataKey.id || '').toString();
    let result = dataKey.result;

    // we can get an error, or we can get a response that is an error
    let error = dataKey.error || null;
    if (result && result.wasThrown) {
      let message = (result.result && (result.result.value || result.result.description))
        ? (result.result.value || result.result.description)
        : 'Error occurred in handling data message';
      error = new Error(message);
    }

    if (error) {
      if (this.hasErrorHandler(msgId)) {
        this.errorHandlers[msgId](error);
      } else {
        log.error(`Error occurred in handling data message: ${error}`);
        log.error('No error handler present, ignoring');
      }

      // short circuit
      return;
    }

    let method = dataKey.method;
    let params;
    if (this.isTargetBased) {
      if (method === 'Target.targetCreated') {
        // this is in response to a `_rpc_forwardSocketSetup:` call
        // targetInfo: { targetId: 'page-1', type: 'page' }
        const app = plist.__argument.WIRApplicationIdentifierKey;
        const targetInfo = dataKey.params.targetInfo;
        await this.specialHandlers.targetCreated(app, targetInfo);
        return;
      } if (method === 'Target.targetDestroyed') {
        const app = plist.__argument.WIRApplicationIdentifierKey;
        const targetInfo = dataKey.params.targetInfo;
        await this.specialHandlers.targetDestroyed(app, targetInfo);
        return;
      } else if (dataKey.method !== 'Target.dispatchMessageFromTarget') {
        // this sort of message, at this point, is just an acknowledgement
        // that the original message was received
        if (!_.isEmpty(msgId)) {
          log.debug(`Received receipt for message '${msgId}'`);
        }
        return;
      }

      // at this point, we have a Target-based message wrapping a protocol message
      let message;
      try {
        message = JSON.parse(dataKey.params.message);
        msgId = message.id;
        method = message.method;
        result = message.result || message;
        params = result.params;
      } catch (err) {
        // if this happens then some aspect of the protocol is missing to us
        // so print the entire message to get visibiity into what is going on
        log.error(`Unexpected message format from Web Inspector:`);
        this.logFullMessage(plist);
        throw err;
      }
    } else {
      params = dataKey.params;
    }

    if (!_.isEmpty(msgId)) {
      log.debug(`Received response for message '${msgId}'`);
    }

    await this.dispatchDataMessage(msgId, method, params, result, error);
  }

  setHandlers () {
    this.handlers = {
      '_rpc_reportSetup:': async (plist) => {
        await this.handleSpecialMessage('_rpc_reportIdentifier:',
          plist.__argument.WIRSimulatorNameKey,
          plist.__argument.WIRSimulatorBuildKey,
          plist.__argument.WIRSimulatorProductVersionKey);
      },
      '_rpc_reportConnectedApplicationList:': async (plist) => {
        await this.handleSpecialMessage('_rpc_reportConnectedApplicationList:',
          plist.__argument.WIRApplicationDictionaryKey);
      },
      '_rpc_applicationSentListing:': async (plist) => {
        await this.handleSpecialMessage('_rpc_forwardGetListing:',
          plist.__argument.WIRApplicationIdentifierKey,
          plist.__argument.WIRListingKey);
      },
      '_rpc_applicationConnected:': async (plist) => {
        await this.handleSpecialMessage('_rpc_applicationConnected:',
          plist.__argument);
      },
      '_rpc_applicationDisconnected:': async (plist) => {
        await this.handleSpecialMessage('_rpc_applicationDisconnected:',
          plist.__argument);
      },
      '_rpc_applicationUpdated:': async (plist) => {
        await this.handleSpecialMessage('_rpc_applicationUpdated:',
          plist.__argument);
      },
      '_rpc_reportConnectedDriverList:': async (plist) => {
        await this.handleSpecialMessage('_rpc_reportConnectedDriverList:',
          plist.__argument);
      },
      '_rpc_applicationSentData:': this.handleDataMessage.bind(this),
    };
  }
}
