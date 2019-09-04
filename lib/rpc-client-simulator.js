import log from './logger';
import _ from 'lodash';
import B from 'bluebird';
import net from 'net';
import RpcClient from './rpc-client';
import { services } from 'appium-ios-device';
import { REMOTE_DEBUGGER_PORT } from './remote-debugger';


export default class RpcClientSimulator extends RpcClient {
  constructor (opts = {}) {
    super(Object.assign({
      shouldCheckForTarget: false,
    }, opts));

    const {
      socketPath,
      host = '::1',
      port = REMOTE_DEBUGGER_PORT,
      messageProxy,
    } = opts;

    // host/port config for TCP communication, socketPath for unix domain sockets
    this.host = host;
    this.port = port;
    this.messageProxy = messageProxy;

    this.socket = null;
    this.socketPath = socketPath;
  }

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
    this.service = await services.startWebInspectorService(this.udid, {
      socket: this.socket,
      osVersion: this.platformVersion,
    });
    this.service.listenMessage(this.receive.bind(this));

    // connect the socket
    return await new B((resolve, reject) => {
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
    if (!this.isConnected()) {
      return;

    }
    log.debug('Disconnecting from remote debugger');
    this.service.close();
    this.connected = false;
  }

  async sendMessage (cmd) {
    let onSocketError;

    return await new B((resolve, reject) => {
      // handle socket problems
      onSocketError = (err) => {
        log.error(`Socket error: ${err.message}`);

        // the connection was refused, so reject the connect promise
        reject(err);
      };

      this.socket.on('error', onSocketError);
      this.service.sendMessage(cmd);
      resolve();
    })
    .finally(() => {
      // remove this listener, so we don't exhaust the system
      try {
        this.socket.removeListener('error', onSocketError);
      } catch (ign) {}
    });
  }

  async receive (data) {
    if (!this.isConnected()) {
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
    await this.messageHandler.handleMessage(data);
  }
}
