import log from '../logger';
import RpcClient from './rpc-client';
import { services } from 'appium-ios-device';


export default class RpcClientRealDevice extends RpcClient {
  constructor (opts = {}) {
    super(Object.assign({
      shouldCheckForTarget: false,
    }, opts));

    const {
      udid,
    } = opts;

    this.udid = udid;
  }

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

  async disconnect () {
    if (!this.isConnected) {
      return;
    }

    log.debug('Disconnecting from remote debugger');
    await super.disconnect();
    this.service.close();
    this.isConnected = false;
  }

  async sendMessage (cmd) { // eslint-disable-line require-await
    this.service.sendMessage(cmd);
  }

  async receive (data) {
    if (!this.isConnected) {
      return;
    }
    await this.messageHandler.handleMessage(data);
  }
}
