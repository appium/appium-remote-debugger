import { log } from '../logger';
import _ from 'lodash';
import B from 'bluebird';
import net from 'node:net';
import { RpcClient } from './rpc-client';
import { services } from 'appium-ios-device';
import type { RpcClientOptions, RpcClientSimulatorOptions, RemoteCommand } from '../types';

/**
 * RPC client implementation for iOS simulators.
 * Extends RpcClient to provide simulator-specific connection handling
 * via TCP sockets or Unix domain sockets.
 */
export class RpcClientSimulator extends RpcClient {
  protected readonly host?: string;
  protected port?: number;
  protected readonly messageProxy?: any;
  protected socket: net.Socket | null;
  protected readonly socketPath?: string;
  protected service?: any;

  /**
   * @param opts - Options for configuring the RPC client, including
   *                simulator-specific options like socketPath, host, and port.
   */
  constructor(opts: RpcClientOptions & RpcClientSimulatorOptions = {}) {
    super(opts);

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
   * Connects to the Web Inspector service on an iOS simulator.
   * Supports both Unix domain sockets and TCP connections, with optional proxy support.
   */
  override async connect(): Promise<void> {
    // create socket and handle its messages
    if (this.socketPath) {
      if (this.messageProxy) {
        // unix domain socket via proxy
        log.debug(`Connecting to remote debugger via proxy through unix domain socket: '${this.messageProxy}'`);
        this.socket = net.connect(this.messageProxy);

        // Forward the actual socketPath to the proxy
        this.socket.once('connect', () => {
          log.debug(`Forwarding the actual web inspector socket to the proxy: '${this.socketPath}'`);
          if (this.socket) {
            this.socket.write(JSON.stringify({
              socketPath: this.socketPath
            }));
          }
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
      if (this.port && this.host) {
        this.socket.connect(this.port, this.host);
      } else {
        throw new Error('Both port and host must be defined for TCP connection');
      }
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
    return await new B<void>((resolve, reject) => {
      // only resolve this function when we are actually connected
      if (!this.socket) {
        return reject(new Error('RPC socket is not connected. Please contact developers'));
      }
      this.socket.on('connect', () => {
        log.debug(`Debugger socket connected`);
        this.isConnected = true;

        resolve();
      });
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
   * Disconnects from the Web Inspector service on the simulator.
   * Closes the socket and service connection, and cleans up resources.
   */
  override async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    log.debug('Disconnecting from remote debugger');
    await super.disconnect();
    this.service?.close();
    this.isConnected = false;
  }

  /**
   * Sends a command message to the Web Inspector service via the socket.
   * Handles socket errors and ensures the socket is available before sending.
   *
   * @param cmd - The command to send to the simulator.
   */
  override async sendMessage(cmd: RemoteCommand): Promise<void> {
    let onSocketError: ((err: Error) => void) | undefined;

    return await new B<void>((resolve, reject) => {
      // handle socket problems
      onSocketError = (err: Error) => {
        log.error(`Socket error: ${err.message}`);

        // the connection was refused, so reject the connect promise
        reject(err);
      };

      if (!this.socket || !this.service) {
        return reject(
          new Error('The RPC client is not connected. Have you called `connect()` before sending a message?')
        );
      }
      this.socket.on('error', onSocketError);
      this.service.sendMessage(cmd);
      resolve();
    })
    .finally(() => {
      // remove this listener, so we don't exhaust the system
      if (this.socket && onSocketError) {
        this.socket.removeListener('error', onSocketError);
      }
    });
  }

  /**
   * Receives data from the Web Inspector service and handles it.
   * Converts Buffer data to strings for certain message keys.
   *
   * @param data - The data received from the service.
   */
  override async receive(data: any): Promise<void> {
    if (!this.isConnected || !data) {
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
