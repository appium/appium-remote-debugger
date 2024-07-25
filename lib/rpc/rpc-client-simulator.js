import log from '../logger';
import _ from 'lodash';
import B from 'bluebird';
import net from 'net';
import RpcClient from './rpc-client';
import { services } from 'appium-ios-device';

export class RpcClientSimulator extends RpcClient {
  /** @type {string|undefined} */
  host;

  /** @type {number|undefined} */
  port;

  /** @type {any} */
  messageProxy;

  /** @type {import('node:net').Socket|null} */
  socket;

  /** @type {string|undefined} */
  socketPath;

  /**
   * @param {import('./rpc-client').RpcClientOptions & RpcClientSimulatorOptions} [opts={}]
   */
  constructor (opts = {}) {
    super(Object.assign({
      shouldCheckForTarget: false,
    }, opts));

    const {
      socketPath,
      host = '::1',
      port,
      messageProxy,
    } = opts;

    // host/port config for TCP communication, socketPath for unix domain sockets
    this.host = host;
    this.port = port;
    this.messageProxy = messageProxy;

    this.socket = null;
    this.socketPath = socketPath;
  }

  /**
   * @override
   */
  async connect () {
    // create socket and handle its messages
    if (this.socketPath) {
      if (this.messageProxy) {
        // unix domain socket via proxy
        log.debug(`Connecting to remote debugger via proxy through unix domain socket: '${this.messageProxy}'`);
        this.socket = net.connect(this.messageProxy);

        // Forward the actual socketPath to the proxy
        this.socket.once('connect', () => {
          log.debug(`Forwarding the actual web inspector socket to the proxy: '${this.socketPath}'`);
          // @ts-ignore socket must be efined here
          this.socket.write(JSON.stringify({
            socketPath: this.socketPath
          }));
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
      this.socket = new net.Socket();
      this.socket.connect(/** @type {number} */ (this.port), /** @type {String} */ (this.host));
    }

    this.socket.setNoDelay(true);
    this.socket.setKeepAlive(true);
    this.socket.on('close', () => {
      if (this.isConnected) {
        log.debug('Debugger socket disconnected');
      }
      this.isConnected = false;
      this.socket = null;
    });
    this.socket.on('end', () => {
      this.isConnected = false;
    });
    this.service = await services.startWebInspectorService(this.udid, {
      socket: this.socket,
      isSimulator: true,
      osVersion: this.platformVersion,
      verbose: this.logAllCommunication,
      verboseHexDump: this.logAllCommunicationHexDump,
      maxFrameLength: this.webInspectorMaxFrameLength,
    });
    this.service.listenMessage(this.receive.bind(this));

    // connect the socket
    return await new B((resolve, reject) => {
      // only resolve this function when we are actually connected
      // @ts-ignore socket must be defined here
      this.socket.on('connect', () => {
        log.debug(`Debugger socket connected`);
        this.isConnected = true;

        resolve();
      });
      // @ts-ignore socket must be defined here
      this.socket.on('error', (err) => {
        if (this.isConnected) {
          log.error(`Socket error: ${err.message}`);
          this.isConnected = false;
        }

        // the connection was refused, so reject the connect promise
        reject(err);
      });
    });
  }

  /**
   * @override
   */
  async disconnect () {
    if (!this.isConnected) {
      return;
    }

    log.debug('Disconnecting from remote debugger');
    await super.disconnect();
    this.service.close();
    this.isConnected = false;
  }

  /**
   * @override
   */
  async sendMessage (cmd) {
    let onSocketError;

    return await new B((resolve, reject) => {
      // handle socket problems
      onSocketError = (err) => {
        log.error(`Socket error: ${err.message}`);

        // the connection was refused, so reject the connect promise
        reject(err);
      };

      if (!this.socket) {
        return reject(
          new Error('The RPC socket is not defined. Have you called `connect()` before sending a message?')
        );
      }
      this.socket.on('error', onSocketError);
      this.service.sendMessage(cmd);
      resolve();
    })
    .finally(() => {
      // remove this listener, so we don't exhaust the system
      try {
        // @ts-ignore socket must be defined
        this.socket.removeListener('error', onSocketError);
      } catch (ign) {}
    });
  }

  /**
   * @override
   */
  async receive (data) {
    if (!this.isConnected) {
      return;
    }

    if (!data) {
      return;
    }

    for (const key of ['WIRMessageDataKey', 'WIRDestinationKey', 'WIRSocketDataKey']) {
      if (!_.isUndefined(data[key])) {
        data[key] = data[key].toString('utf8');
      }
    }
    // @ts-ignore messageHandler must be defined
    await this.messageHandler.handleMessage(data);
  }
}

export default RpcClientSimulator;

/**
 * @typedef {Object} RpcClientSimulatorOptions
 * @property {string} [socketPath]
 * @property {string} [host='::1']
 * @property {number} [port]
 * @property {any} [messageProxy]
 */
