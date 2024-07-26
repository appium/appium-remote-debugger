import log from '../logger';
import RpcClient from './rpc-client';
import { services } from 'appium-ios-device';


export class RpcClientRealDevice extends RpcClient {
  /**
   * @param {import('./rpc-client').RpcClientOptions} [opts={}]
   */
  constructor (opts = {}) {
    super(Object.assign({
      shouldCheckForTarget: false,
    }, opts));
  }

  /**
   * @override
   */
  async connect () {
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
  async sendMessage (cmd) { // eslint-disable-line require-await
    this.service.sendMessage(cmd);
  }

  /**
   * @override
   */
  async receive (data) {
    if (!this.isConnected) {
      return;
    }
    // @ts-ignore messageHandler must be defined here
    await this.messageHandler.handleMessage(data);
  }
}

export default RpcClientRealDevice;
