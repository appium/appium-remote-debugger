import log from './logger';
import { REMOTE_DEBUGGER_PORT, RPC_RESPONSE_TIMEOUT_MS } from './remote-debugger';
import getRemoteCommand from './remote-messages';
import WebSocket from 'ws';
import Promise from 'bluebird';
import _ from 'lodash';
import events from 'events';
import { simpleStringify } from './helpers';
import ES6Error from 'es6-error';
import { util } from 'appium-support';


const DATA_LOG_LENGTH = {length: 200};

export default class WebKitRpcClient extends events.EventEmitter {
  constructor (host, port = REMOTE_DEBUGGER_PORT, responseTimeout = RPC_RESPONSE_TIMEOUT_MS) {
    super();

    this.host = host || 'localhost';
    this.port = port;

    this.responseTimeout = responseTimeout;

    this.curMsgId = 0;

    this.dataHandlers = {};
    this.dataMethods = {};
    this.errorHandlers = {};
  }

  async connect (pageId) {
    return await new Promise((resolve, reject) => {
      // we will only resolve this call when the socket is open
      // WebKit url
      let url = `ws://${this.host}:${this.port}/devtools/page/${pageId}`;
      this.pageIdKey = pageId;

      // create and set up socket with appropriate event handlers
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

  async send (command, opts = {}) {
    let data = getRemoteCommand(command, _.defaults({connId: this.connId, senderId: this.senderId}, opts));

    log.debug(`Sending WebKit data: ${_.truncate(JSON.stringify(data), DATA_LOG_LENGTH)}`);
    log.debug(`Webkit response timeout: ${this.responseTimeout}`);

    this.curMsgId++;
    data.id = this.curMsgId;

    const id = this.curMsgId.toString();
    return await new Promise((resolve, reject) => {
      // only resolve the send command when WebKit returns a response
      // store the handler and the data sent
      this.dataHandlers[id] = resolve;
      this.dataMethods[id] = data.method;
      this.errorHandlers[id] = reject;

      // send the data
      this.socket.send(JSON.stringify(data), function (error) {
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
      return Promise.resolve(null);
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
    log.debug(`Received WebKit data: '${_.truncate(data, DATA_LOG_LENGTH)}'`);
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

    const msgId = data.id;
    // when sending we set a data method and associated callback.
    // get that, or the generic (automatically sent, not associated
    // with a particular request) method
    const method = this.dataMethods[msgId] || data.method;
    if (!method) {
      return rejectCall(
        new WebKitRPCWarning(`Did not find any handlers for ${msgId ? `'${msgId}'` : 'the recent'} message`));
    }
    log.debug(`Found method '${method}'${msgId ? ` for '${msgId}' message` : ''}`);
    let isEventHandled = false;
    switch (method) {
      case 'Profiler.resetProfiles':
        log.debug('Device is telling us to reset profiles. Should probably ' +
                  'do some kind of callback here');
        isEventHandled = true;
        break;
      case 'Timeline.eventRecorded':
        if (this.timelineEventHandler) {
          this.timelineEventHandler(data.result);
          isEventHandled = true;
        }
        break;
      case 'Console.messageAdded':
        if (this.consoleEventHandler) {
          this.consoleEventHandler(data.params.message);
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
          this.networkEventHandler(method, data.params);
          return;
        }
        break;
    }
    if (!data.error && _.has(this.dataHandlers, msgId)) {
      return this.dataHandlers[msgId](data.result);
    }
    if (data.error && _.has(this.errorHandlers, msgId)) {
      return this.errorHandlers[msgId](data.error);
    }
    if (!isEventHandled) {
      log.debug(`There is no handler scheduled for method '${method}' in ${msgId ? `'${msgId}'` : 'the recent'} message`);
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
