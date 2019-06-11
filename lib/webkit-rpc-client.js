import log from './logger';
import { REMOTE_DEBUGGER_PORT, RPC_RESPONSE_TIMEOUT_MS } from './remote-debugger';
import WebSocket from 'ws';
import B from 'bluebird';
import _ from 'lodash';
import { simpleStringify, isTargetBased } from './helpers';
import ES6Error from 'es6-error';
import { util } from 'appium-support';
import RpcClient from './rpc-client';


const DATA_LOG_LENGTH = {length: 200};

export default class WebKitRpcClient extends RpcClient {
  constructor (opts = {}) {
    super({
      shouldCheckForTarget: true,
    });

    const {
      host,
      port = REMOTE_DEBUGGER_PORT,
      responseTimeout = RPC_RESPONSE_TIMEOUT_MS,
      platformVersion = {},
      isSafari = true,
    } = opts;

    this.host = host || 'localhost';
    this.port = port;

    this.responseTimeout = responseTimeout;

    this.platformVersion = platformVersion;
    this.isSafari = isSafari;

    this.curMsgId = 0;

    this.dataHandlers = {};
    this.dataMethods = {};
    this.errorHandlers = {};

    // start with a best guess for the protocol
    this.setCommunicationProtocol(isTargetBased(isSafari, platformVersion));
  }

  async connect (pageId) {
    return await new B((resolve, reject) => {
      // we will only resolve this call when the socket is open
      // WebKit url
      const url = `ws://${this.host}:${this.port}/devtools/page/${pageId}`;
      this.pageIdKey = pageId;

      // create and set up socket with appropriate event handlers
      log.debug(`Connecting to WebKit socket: '${url}'`);
      this.socket = new WebSocket(url);
      this.socket.on('open', () => {
        log.debug(`WebKit debugger web socket connected to url: ${url}`);
        this.connected = true;
        resolve();
      });
      this.socket.on('close', () => {
        log.debug('WebKit remote debugger socket disconnected');
        this.connected = false;
      });
      this.socket.on('error', (exception) => {
        if (this.connected) {
          log.debug(`WebKit debugger web socket error: ${exception.message}`);
          this.connected = false;
        }

        reject(exception);
      });
      this.socket.on('message', this.receive.bind(this));
    });
  }

  disconnect () {
    log.debug('Disconnecting from WebKit remote debugger');
    if (this.isConnected()) {
      this.socket.close(1001);
    }
    this.connected = false;
  }

  isConnected () {
    return (this.socket !== null && this.connected);
  }

  async sendMessage (command, opts) {
    let data = this.remoteMessages.getRemoteCommand(command, _.defaults({connId: this.connId, senderId: this.senderId}, opts));

    log.debug(`Sending WebKit data: ${_.truncate(JSON.stringify(data), DATA_LOG_LENGTH)}`);
    log.debug(`Webkit response timeout: ${this.responseTimeout}`);

    const msgId = this.curMsgId++;
    data.id = msgId;

    let method = data.method;
    if (this.isTargetBased) {
      method = data.params.message.method;

      data.params.id = msgId;
      data.params.message.id = msgId;
      data.params.message = JSON.stringify(data.params.message);
      data.params.targetId = this.target;
    }

    const id = msgId.toString();
    return await new B((resolve, reject) => {
      // only resolve the send command when WebKit returns a response
      // store the handler and the data sent
      this.dataHandlers[id] = resolve;
      this.dataMethods[id] = method;
      this.errorHandlers[id] = reject;

      // send the data
      this.socket.send(JSON.stringify(data), function socketReceipt (error) {
        if (util.hasValue(error)) {
          log.debug(`WebKit socket error occurred: ${error}`);
          reject(new Error(error));
        }
      });
    }).catch((e) => {
      if (e.constructor.name !== WebKitRPCWarning.name) {
        throw e;
      }
      log.warn(e.message);
      return B.resolve();
    }).finally((res) => {
      // no need to hold onto anything
      delete this.dataHandlers[id];
      delete this.dataMethods[id];
      delete this.errorHandlers[id];

      // and pass along the result
      return res;
    }).timeout(this.responseTimeout);
  }

  receive (data) {
    const response = this.logFullResponse
      ? JSON.stringify(data, null, 2)
      : _.truncate(data, DATA_LOG_LENGTH);
    log.debug(`Received WebKit data: '${response}'`);
    data = util.safeJsonParse(data);

    const rejectCall = (error) => {
      if (data && this.errorHandlers[data.id]) {
        return this.errorHandlers[data.id](error);
      }

      if (error.constructor.name === WebKitRPCWarning.name) {
        log.warn(error.message);
      } else {
        log.errorAndThrow(error);
      }
    };

    if (!_.isPlainObject(data)) {
      return rejectCall(new WebKitRPCWarning(`No parseable data found`));
    }

    // we can get an error, or we can get a response that is an error
    if (data.wasThrown || (data.result && data.result.wasThrown)) {
      const message = data.wasThrown
        ? data.result.value || data.result.description
        : data.result.result.value || data.result.result.description;
      return rejectCall(new Error(message));
    }

    let {
      id: msgId,
      result,
      params,
      error,
    } = data;

    let method = this.dataMethods[msgId] || data.method;
    if (this.isTargetBased) {
      if (!_.startsWith(data.method, 'Target')) {
        log.debug(`Received receipt for message '${msgId}'`);
        return;
      }
      if (data.params.message) {
        let message;
        try {
          message = JSON.parse(data.params.message);
        } catch (err) {
          // this should never happen, so log as much information as possible
          // since we need to accomodate something we have not seen
          log.error(`Unable to parse message: ${err.message}`);
          log.error(`Data:`);
          log.error(`${JSON.stringify(data, null, 2)}`);
          // continue. maybe something can be salvaged?
        }

        // get nested params if necessary
        params = message.params || params;

        // the message is aggravatingly nested
        if (message.result) {
          result = message.result;
          if (message.result.result) {
            result = message.result.result;
            if (message.result.result.value) {
              result = message.result.result.value;
              // only at this level is parsing the result necessary
              if (_.isString(result)) {
                try {
                  result = JSON.parse(result);
                } catch (ign) {}
              }
            }
          }
        }

        msgId = message.id;
        method = message.method || method;
      }
    }

    // when sending we set a data method and associated callback.
    // get that, or the generic (automatically sent, not associated
    // with a particular request) method
    if (!method) {
      return rejectCall(
        new WebKitRPCWarning(`Did not find any handlers for ${msgId ? `'${msgId}'` : 'recent'} message`));
    }
    log.debug(`Found method '${method}' ${msgId ? `for message '${msgId}'` : ''}`);
    let isEventHandled = false;
    switch (method) {
      case 'Profiler.resetProfiles':
        log.debug('Device is telling us to reset profiles. Should probably ' +
                  'do some kind of callback here');
        isEventHandled = true;
        break;
      case 'Timeline.eventRecorded':
        if (this.timelineEventHandler) {
          this.timelineEventHandler(result);
          isEventHandled = true;
        }
        break;
      case 'Console.messagesCleared':
        // pass
        isEventHandled = true;
        break;
      case 'Console.messageAdded':
        if (this.consoleEventHandler) {
          this.consoleEventHandler(params.message);
          isEventHandled = true;
        }
        break;
      case 'Page.navigate':
        log.debug(`Received page navigated message: ${simpleStringify(data)}`);
        isEventHandled = true;
        break;
      case 'Network.dataReceived':
      case 'Network.requestWillBeSent':
      case 'Network.responseReceived':
      case 'Network.loadingFinished':
      case 'Network.loadingFailed':
        if (_.isFunction(this.networkEventHandler)) {
          this.networkEventHandler(method, params);
          return;
        }
        break;
      case 'Target.targetCreated':
        this.addTarget(params.targetInfo);
        isEventHandled = true;
        break;
      case 'Target.targetDestroyed':
        this.removeTarget(params);
        isEventHandled = true;
        break;
    }
    if (!data.error && _.has(this.dataHandlers, msgId)) {
      return this.dataHandlers[msgId](result);
    }
    if (data.error && _.has(this.errorHandlers, msgId)) {
      return this.errorHandlers[msgId](error);
    }
    if (!isEventHandled) {
      log.debug(`There is no handler scheduled for method '${method}' in ${msgId ? `message '${msgId}'` : 'recent messages'}`);
    }
  }

  setTimelineEventHandler (timelineEventHandler) {
    this.timelineEventHandler = timelineEventHandler;
  }

  setConsoleLogEventHandler (consoleEventHandler) {
    this.consoleEventHandler = consoleEventHandler;
  }

  setNetworkLogEventHandler (networkEventHandler) {
    this.networkEventHandler = networkEventHandler;
  }
}


class WebKitRPCWarning extends ES6Error {}
