import {log} from '../logger';
import {RpcClient} from './rpc-client';
import type {RemoteCommand, RpcClientOptions} from '../types';
import type {StringRecord} from '@appium/types';
import type {WebInspectorService, RemoteXpcConnection} from 'appium-ios-remotexpc';
import _ from 'lodash';

/**
 * Options specific to RpcClientRealDeviceShim.
 */
export interface RpcClientRealDeviceShimOptions extends RpcClientOptions {
  /** The device UDID (required for shim connection) */
  udid: string;
}

/**
 * Interface for WebInspector message structure from the shim service.
 */
interface WebInspectorMessage {
  __selector: string;
  __argument: StringRecord;
}

/**
 * RPC client implementation for iOS 18+ real devices using the WebInspector shim.
 * This client uses the `com.apple.webinspector.shim.remote` service via RemoteXPC
 * tunneling, which is required for iOS 18 and later where the traditional
 * Web Inspector service is no longer available.
 *
 * Extends RpcClient to provide device-specific connection handling using
 * the appium-ios-remotexpc library.
 */
export class RpcClientRealDeviceShim extends RpcClient {
  protected webInspectorService?: WebInspectorService;
  protected remoteXPC?: RemoteXpcConnection;
  protected messageListenerTask?: Promise<void>;
  protected isListening: boolean = false;

  /**
   * Creates a new RpcClientRealDeviceShim instance.
   *
   * @param opts - Options for configuring the shim RPC client.
   */
  constructor(opts: RpcClientRealDeviceShimOptions) {
    super(opts);
  }

  /**
   * Connects to the WebInspector shim service on an iOS 18+ real device.
   * Uses the RemoteXPC tunnel to establish a connection to the
   * `com.apple.webinspector.shim.remote` service.
   */
  override async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    log.debug(`Connecting to WebInspector shim service for device ${this.udid}`);

    const {Services} = await import('appium-ios-remotexpc');
    const result = await Services.startWebInspectorService(this.udid);
    this.webInspectorService = result.webInspectorService;
    this.remoteXPC = result.remoteXPC;

    this.startMessageListener();
    this.isConnected = true;
    log.debug('Successfully connected to WebInspector shim service');
  }

  /**
   * Disconnects from the WebInspector shim service.
   * Closes the service connection and cleans up resources.
   */
  override async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    log.debug('Disconnecting from WebInspector shim service');
    await super.disconnect();

    // Stop the message listener
    this.isListening = false;
    if (this.webInspectorService) {
      try {
        await this.webInspectorService.stopListeningAsync();
      } catch (err: any) {
        log.warn('Error while stopping shim message listener', err);
        await this.webInspectorService.close();
        this.webInspectorService = undefined;
      }
    }

    // Wait for the listener task to complete
    if (this.messageListenerTask) {
      try {
        await this.messageListenerTask;
      } catch {
        // Ignore errors during shutdown
      }
    }

    // Close the connections
    if (this.webInspectorService) {
      await this.webInspectorService.close();
      this.webInspectorService = undefined;
    }

    if (this.remoteXPC) {
      await this.remoteXPC.close();
      this.remoteXPC = undefined;
    }

    this.isConnected = false;
    log.debug('Disconnected from WebInspector shim service');
  }

  /**
   * Sends a command message to the WebInspector shim service.
   * Translates the RemoteCommand format to the shim service format.
   *
   * @param cmd - The command to send to the device.
   */
  override async sendMessage(cmd: RemoteCommand): Promise<void> {
    if (!this.webInspectorService) {
      throw new Error('WebInspector shim service is not initialized. Is the client connected?');
    }

    const selector = cmd.__selector;
    const args = this.translateArguments(cmd.__argument);

    log.debug(`Sending message via shim: ${selector}`);
    await this.webInspectorService.sendMessage(selector, args);
  }

  /**
   * Receives data from the WebInspector shim service and handles it.
   * This method is called by the message listener when a message is received.
   *
   * @param data - The data received from the service.
   */
  override async receive(data: any): Promise<void> {
    if (this.isConnected && data) {
      await this.messageHandler.handleMessage(data);
    }
  }

  /**
   * Starts the background message listener that receives messages from
   * the WebInspector shim service and forwards them to the message handler.
   */
  private startMessageListener(): void {
    if (this.isListening || !this.webInspectorService) {
      return;
    }

    this.isListening = true;
    const service = this.webInspectorService;

    this.messageListenerTask = (async () => {
      try {
        for await (const message of service.listenMessage()) {
          if (!this.isListening) {
            break;
          }

          // Convert the message to the expected format
          const convertedMessage = this.convertMessage(message as unknown as WebInspectorMessage);
          await this.receive(convertedMessage);
        }
      } catch (err: any) {
        if (this.isListening) {
          log.error('Error in shim message listener', err);
        }
      } finally {
        this.isListening = false;
      }
    })();
  }

  /**
   * Converts a message from the WebInspector shim format to the format
   * expected by the message handler.
   *
   * @param message - The message from the shim service.
   * @returns The converted message in the expected format.
   */
  private convertMessage(message: WebInspectorMessage): StringRecord {
    const converted: StringRecord = {
      __selector: message.__selector,
    };

    // Convert buffer data to strings where necessary
    if (_.isPlainObject(message.__argument)) {
      const args = {...message.__argument};

      // Handle WIRMessageDataKey and WIRSocketDataKey which may be buffers
      for (const key of ['WIRMessageDataKey', 'WIRSocketDataKey', 'WIRDestinationKey']) {
        if (args[key] !== undefined && Buffer.isBuffer(args[key])) {
          args[key] = (args[key] as Buffer).toString('utf8');
        }
      }
      converted.__argument = args;
    }

    return converted;
  }

  /**
   * Translates command arguments from the RemoteCommand format to the
   * format expected by the WebInspector shim service.
   *
   * @param args - The arguments from the RemoteCommand.
   * @returns The translated arguments for the shim service.
   */
  private translateArguments(args: any): StringRecord {
    if (!_.isPlainObject(args)) {
      return {};
    }

    const translated: StringRecord = {...args};

    // Remove the connection identifier key as it will be added by the shim service
    delete translated.WIRConnectionIdentifierKey;

    return translated;
  }
}

export default RpcClientRealDeviceShim;
