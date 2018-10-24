import log from './logger';
import _ from 'lodash';
import bplistCreate from 'bplist-creator';
import bplistParser from 'bplist-parser';
import bufferpack from 'bufferpack';
import Promise from 'bluebird';
import { REMOTE_DEBUGGER_PORT } from './remote-debugger';
import UUID from 'uuid-js';
import net from 'net';
import RpcMessageHandler from './remote-debugger-message-handler';
import getRemoteCommand from './remote-messages';


export default class RemoteDebuggerRpcClient {
  constructor (opts = {}) {
    const {
      host = '::1',
      port = REMOTE_DEBUGGER_PORT,
      socketPath,
      specialMessageHandlers = {},
      messageProxy,
    } = opts;

    // host/port config for TCP communication, socketPath for unix domain sockets
    this.host = host;
    this.port = port;
    this.socketPath = socketPath;
    this.messageProxy = messageProxy;

    this.socket = null;
    this.connected = false;
    this.connId = UUID.create().toString();
    this.senderId = UUID.create().toString();
    this.curMsgId = 0;
    this.received = Buffer.alloc(0);
    this.readPos = 0;

    // message handlers
    this.specialMessageHandlers = specialMessageHandlers;
    this.messageHandler = null;
  }

  async connect () {
    this.messageHandler = new RpcMessageHandler(this.specialMessageHandlers);

    // create socket and handle its messages
    if (this.socketPath) {
      if (this.messageProxy) {
        // unix domain socket via proxy
        log.debug(`Connecting to remote debugger via proxy through unix domain socket: '${this.messageProxy}'`);
        this.socket = net.connect(this.messageProxy);

        // Forward the actual socketPath to the proxy
        this.socket.once('connect', () => {
          log.debug(`Forwarding the actual web inspector socket to the proxy: '${this.socketPath}'`);
          this.socket.write(JSON.stringify({socketPath: this.socketPath}));
        });

      } else {
        // unix domain socket
        log.debug(`Connecting to remote debugger through unix domain socket: '${this.socketPath}'`);
        this.socket = net.connect(this.socketPath);
      }
    } else {
      if (this.messageProxy) {
        // connect to the proxy instead of the remote debugger directly
        this.port = this.messageProxy;
      }

      // tcp socket
      log.debug(`Connecting to remote debugger ${this.messageProxy ? 'via proxy ' : ''}through TCP: ${this.host}:${this.port}`);
      this.socket = new net.Socket({type: 'tcp6'});
      this.socket.connect(this.port, this.host);
    }

    this.socket.setNoDelay(true);
    this.socket.on('close', () => {
      if (this.connected) {
        log.debug('Debugger socket disconnected');
      }
      this.connected = false;
      this.socket = null;
    });
    this.socket.on('end', () => {
      this.connected = false;
    });
    this.socket.on('data', this.receive.bind(this));

    // connect the socket
    return await new Promise((resolve, reject) => {
      // only resolve this function when we are actually connected
      this.socket.on('connect', () => {
        log.debug(`Debugger socket connected`);
        this.connected = true;

        resolve();
      });
      this.socket.on('error', (err) => {
        if (this.connected) {
          log.error(`Socket error: ${err.message}`);
          this.connected = false;
        }

        // the connection was refused, so reject the connect promise
        reject(err);
      });
    });
  }

  async disconnect () { // eslint-disable-line require-await
    if (this.isConnected()) {
      log.debug('Disconnecting from remote debugger');
      this.socket.destroy();
    }
    this.connected = false;
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
    return await new Promise((resolve, reject) => {
      // local callback, temporarily added as callback to
      // `_rpc_applicationConnected:` remote debugger response
      // to handle the initial connection
      let onAppChange = (dict) => {
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
        let [connectedAppIdKey, pageDict] = await this.send('connectToApp', {
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

  async send (command, opts = {}) { // eslint-disable-line require-await
    // error listener, which needs to be removed after the promise is resolved
    let onSocketError;

    return new Promise((resolve, reject) => {
      // promise to be resolved whenever remote debugger
      // replies to our request

      // retrieve the correct command to send
      opts = _.defaults({connId: this.connId, senderId: this.senderId}, opts);
      let data = getRemoteCommand(command, opts);

      // most of the time we don't care when socket.write does
      // so give it an empty function
      let socketCb = _.noop;

      // handle socket problems
      onSocketError = (exception) => {
        if (this.connected) {
          log.error(`Socket error: ${exception.message}`);
        }

        // the connection was refused, so reject the connect promise
        reject(exception);
      };
      this.socket.on('error', onSocketError);
      if (this.messageHandler.hasSpecialMessageHandler(data.__selector)) {
        // special replies will return any number of arguments
        // temporarily wrap with promise handling
        let specialMessageHandler = this.getSpecialMessageHandler(data.__selector);
        this.setSpecialMessageHandler(data.__selector, reject, function (...args) {
          log.debug(`Received response from socket send: '${_.truncate(JSON.stringify(args), {length: 50})}'`);

          // call the original listener, and put it back, if necessary
          specialMessageHandler(...args);
          if (this.messageHandler.hasSpecialMessageHandler(data.__selector)) {
            // this means that the system has not removed this listener
            this.setSpecialMessageHandler(data.__selector, null, specialMessageHandler);
          }

          resolve(args);
        }.bind(this));
      } else if (data.__argument && data.__argument.WIRSocketDataKey) {
        // keep track of the messages coming and going using
        // a simple sequential id
        this.curMsgId++;

        const errorHandler = function (err) {
          const msg = `Remote debugger error with code '${err.code}': ${err.message}`;
          reject(new Error(msg));
        };

        this.setDataMessageHandler(this.curMsgId.toString(), errorHandler, (value) => {
          const msg = _.truncate(_.isString(value) ? value : JSON.stringify(value), {length: 50});
          log.debug(`Received data response from socket send: '${msg}'`);
          log.debug(`Original command: ${command}`);
          resolve(value);
        });
        data.__argument.WIRSocketDataKey.id = this.curMsgId;
        data.__argument.WIRSocketDataKey =
            Buffer.from(JSON.stringify(data.__argument.WIRSocketDataKey));
      } else {
        // we want to immediately resolve this socket.write
        // any long term callbacks will do their business in the background
        socketCb = resolve;
      }

      log.debug(`Sending '${data.__selector}' message to remote debugger`);

      // remote debugger expects a binary plist as data
      let plist;
      try {
        plist = bplistCreate(data);
      } catch (e) {
        let msg = `Could not create binary plist from data: ${e.message}`;
        log.error(msg);
        return reject(new Error(msg));
      }

      if (this.socket && this.connected) {
        // cork and uncork in order to not buffer the write
        // on some systems this is necessary or the server
        // gets confused.
        this.socket.cork();
        try {
          this.socket.write(bufferpack.pack('L', [plist.length]));
          this.socket.write(plist, socketCb);
        } finally {
          this.socket.uncork();
        }
      } else {
        let msg = 'Attempted to write data to socket after it was closed!';
        log.error(msg);
        reject(new Error(msg));
      }
    })
    .finally(() => {
      // remove this listener, so we don't exhaust the system
      this.socket.removeListener('error', onSocketError);
    });
  }

  receive (data) {
    // Append this new data to the existing Buffer
    this.received = Buffer.concat([this.received, data]);
    let dataLeftOver = true;

    // Parse multiple messages in the same packet
    while (dataLeftOver) {
      // Store a reference to where we were
      let oldReadPos = this.readPos;

      // Read the prefix (plist length) to see how far to read next
      // It's always 4 bytes long
      let prefix = this.received.slice(this.readPos, this.readPos + 4);

      let msgLength;
      try {
        msgLength = bufferpack.unpack('L', prefix)[0];
      } catch (e) {
        log.error(`Buffer could not unpack: ${e}`);
        return;
      }

      // Jump forward 4 bytes
      this.readPos += 4;

      // Is there enough data here?
      // If not, jump back to our original position and gtfo
      if (this.received.length < msgLength + this.readPos) {
        this.readPos = oldReadPos;
        break;
      }

      // Extract the main body of the message (where the plist should be)
      let body = this.received.slice(this.readPos, msgLength + this.readPos);

      // Extract the plist
      let plist;
      try {
        plist = bplistParser.parseBuffer(body);
      } catch (e) {
        log.error(`Error parsing binary plist: ${e}`);
        return;
      }

      // bplistParser.parseBuffer returns an array
      if (plist.length === 1) {
        plist = plist[0];
      }

      for (let key of ['WIRMessageDataKey', 'WIRDestinationKey', 'WIRSocketDataKey']) {
        if (!_.isUndefined(plist[key])) {
          plist[key] = plist[key].toString("utf8");
        }
      }

      // Jump forward the length of the plist
      this.readPos += msgLength;

      // Calculate how much buffer is left
      let leftOver = this.received.length - this.readPos;

      // Is there some left over?
      if (leftOver !== 0) {
        // Copy what's left over into a new buffer, and save it for next time
        let chunk = Buffer.alloc(leftOver);
        this.received.copy(chunk, 0, this.readPos);
        this.received = chunk;
      } else {
        // Otherwise, empty the buffer and get out of the loop
        this.received = Buffer.alloc(0);
        dataLeftOver = false;
      }

      // Reset the read position
      this.readPos = 0;

      // Now do something with the plist
      if (plist) {
        this.messageHandler.handleMessage(plist);
      }
    }
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
