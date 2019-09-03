import log from './logger';
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
    });
    this.service.listenMessage(this.receive.bind(this));
    this.connected = true;
  }

  async disconnect () { // eslint-disable-line require-await
    if (this.isConnected()) {
      log.debug('Disconnecting from remote debugger');
      this.service.close();
    }
    this.connected = false;
  }

  async sendMessage (cmd) { // eslint-disable-line require-await
    this.service.sendMessage(cmd);
  }

  async receive (data) { // eslint-disable-line require-await
    if (!this.isConnected()) {
      return;
    }
    this.messageHandler.handleMessage(data);
  }
}
