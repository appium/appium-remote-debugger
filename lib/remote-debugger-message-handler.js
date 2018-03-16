import log from './logger';
import _ from 'lodash';


export default class RpcMessageHandler {
  constructor (specialHandlers) {
    this.setHandlers();
    this.errorHandlers = {};
    this.specialHandlers = _.clone(specialHandlers);
    this.dataHandlers = {};
    this.willNavigateWithoutReload = false;
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

  handleMessage (plist) {
    let handlerFor = plist.__selector;
    if (!handlerFor) {
      log.debug('Got an invalid plist');
      return;
    }

    if (_.has(this.handlers, handlerFor)) {
      this.handlers[handlerFor](plist);
    } else {
      log.debug(`Debugger got a message for '${handlerFor}' and have no ` +
                `handler, doing nothing.`);
    }
  }

  handleSpecialMessage (handler, ...args) {
    let fn = this.specialHandlers[handler];
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
      fn(...args);
    } else {
      log.warn(`Tried to access special message handler '${handler}' ` +
               `but none was found`);
    }
  }

  async handleDataMessage (plist) {
    let dataKey = JSON.parse(plist.__argument.WIRMessageDataKey.toString('utf8'));
    let msgId = dataKey.id;
    let result = dataKey.result;
    let error = dataKey.error || null;

    // we can get an error, or we can get a response that is an error
    if (result && result.wasThrown) {
      let message = (result.result && (result.result.value || result.result.description)) ?
                    (result.result.value || result.result.description) :
                    'Error occurred in handling data message';
      error = new Error(message);
    }

    if (!_.isNull(msgId) && !_.isUndefined(msgId)) {
      msgId = msgId.toString();
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

    if (dataKey.method === 'Profiler.resetProfiles') {
      log.debug('Device is telling us to reset profiles. Should probably ' +
                'do some kind of callback here');
    } else if (dataKey.method === 'Page.frameNavigated') {
      if (!this.willNavigateWithoutReload && !this.pageLoading) {
        log.debug('Frame navigated, unloading page');
        if (_.isFunction(this.specialHandlers['Page.frameNavigated'])) {
          this.specialHandlers['Page.frameNavigated']('remote-debugger');
          this.specialHandlers['Page.frameNavigated'] = null;
        } else {
          log.debug('No frame navigation callback set.');
        }
      } else {
        log.debug('Frame navigated but we were warned about it, not ' +
                  'considering page state unloaded');
        this.willNavigateWithoutReload = false;
      }
    } else if (dataKey.method === 'Page.loadEventFired') {
      await this.specialHandlers.pageLoad();
    } else if (dataKey.method === 'Timeline.eventRecorded' && _.isFunction(this.timelineEventHandler)) {
      this.timelineEventHandler(dataKey.params.record);
    } else if (dataKey.method === 'Console.messageAdded' && _.isFunction(this.consoleLogEventHandler)) {
      this.consoleLogEventHandler(dataKey.params.message);
    } else if (dataKey.method && dataKey.method.startsWith('Network.') && _.isFunction(this.networkLogEventHandler)) {
      this.networkLogEventHandler(dataKey.params);
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

  setHandlers () {
    this.handlers = {
      '_rpc_reportSetup:': (plist) => {
        this.handleSpecialMessage('_rpc_reportIdentifier:',
            plist.__argument.WIRSimulatorNameKey,
            plist.__argument.WIRSimulatorBuildKey,
            plist.__argument.WIRSimulatorProductVersionKey);
      },
      '_rpc_reportConnectedApplicationList:': (plist) => {
        this.handleSpecialMessage('_rpc_reportConnectedApplicationList:',
            plist.__argument.WIRApplicationDictionaryKey);
      },
      '_rpc_applicationSentListing:': (plist) => {
        this.handleSpecialMessage('_rpc_forwardGetListing:',
            plist.__argument.WIRApplicationIdentifierKey,
            plist.__argument.WIRListingKey);
      },
      '_rpc_applicationConnected:': (plist) => {
        this.handleSpecialMessage('_rpc_applicationConnected:',
            plist.__argument);
      },
      '_rpc_applicationDisconnected:': (plist) => {
        this.handleSpecialMessage('_rpc_applicationDisconnected:',
            plist.__argument);
      },
      '_rpc_applicationUpdated:': (plist) => {
        this.handleSpecialMessage('_rpc_applicationUpdated:',
            plist.__argument);
      },
      '_rpc_reportConnectedDriverList:': (plist) => {
        this.handleSpecialMessage('_rpc_reportConnectedDriverList:',
            plist.__argument);
      },
      '_rpc_applicationSentData:': this.handleDataMessage.bind(this),
    };
  }
}
