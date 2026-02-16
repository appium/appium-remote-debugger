import {log} from '../logger';
import {RpcClient} from './rpc-client';
import {services} from 'appium-ios-device';
import type {RemoteCommand} from '../types';

/**
 * RPC client implementation for real iOS devices.
 * Extends RpcClient to provide device-specific connection handling.
 */
export class RpcClientRealDevice extends RpcClient {
  protected service?: any;

  /**
   * Connects to the Web Inspector service on a real iOS device.
   * Starts the Web Inspector service and sets up message listening.
   */
  override async connect(): Promise<void> {
    this.service = await services.startWebInspectorService(this.udid, {
      osVersion: this.platformVersion,
      isSimulator: false,
      verbose: this.logAllCommunication,
      verboseHexDump: this.logAllCommunicationHexDump,
      socketChunkSize: this.socketChunkSize,
      maxFrameLength: this.webInspectorMaxFrameLength,
    });

    this.service.listenMessage(this.receive.bind(this));
    this.isConnected = true;
  }

  /**
   * Disconnects from the Web Inspector service on the real device.
   * Closes the service connection and cleans up resources.
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
   * Sends a command message to the Web Inspector service.
   *
   * @param cmd - The command to send to the device.
   */
  override async sendMessage(cmd: RemoteCommand): Promise<void> {
    if (!this.service) {
      throw new Error('RPC service is not initialized. Is the client connected?');
    }
    this.service.sendMessage(cmd);
  }

  /**
   * Receives data from the Web Inspector service and handles it.
   *
   * @param data - The data received from the service.
   */
  override async receive(data: any): Promise<void> {
    if (this.isConnected) {
      await this.messageHandler.handleMessage(data);
    }
  }
}
