import log from './logger';
import RemoteMessages from './remote-messages';


export default class RpcClient {
  setCommunicationProtocol (isTargetBased = false) {
    log.warn(`Setting communication protocol: using ${isTargetBased ? 'Target-based' : 'full Web Inspector protocol'} communication`);
    this.isTargetBased = isTargetBased;

    if (!this.remoteMessages) {
      this.remoteMessages = new RemoteMessages(isTargetBased);
    } else {
      this.remoteMessages.setCommunicationProtocol(isTargetBased);
    }
  }

  async send (command, opts = {}) {
    try {
      return await this.sendMessage(command, opts);
    } catch (err) {
      if (err.message.includes(`'Target' domain was not found`)) {
        this.setCommunicationProtocol(false);
        return await this.sendMessage(command, opts);
      } else if (err.message.includes(`domain was not found`)) {
        this.setCommunicationProtocol(true);
        return await this.sendMessage(command, opts);
      }
      throw err;
    }
  }

  async sendMessage (/* command, opts = {} */) { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'sendMessage' function`);
  }
}
