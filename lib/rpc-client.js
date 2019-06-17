import log from './logger';
import RemoteMessages from './remote-messages';
import { retryInterval } from 'asyncbox';
import _ from 'lodash';


const WAIT_FOR_TARGET_RETRIES = 10;
const WAIT_FOR_TARGET_INTERVAL = 1000;

export default class RpcClient {
  constructor (opts = {}) {
    this._targets = [];
    this._shouldCheckForTarget = !!opts.shouldCheckForTarget;
  }

  setCommunicationProtocol (isTargetBased = false) {
    log.warn(`Setting communication protocol: using ${isTargetBased ? 'Target-based' : 'full Web Inspector protocol'} communication`);
    this.isTargetBased = isTargetBased;

    if (!this.remoteMessages) {
      this.remoteMessages = new RemoteMessages(isTargetBased);
    } else {
      this.remoteMessages.setCommunicationProtocol(isTargetBased);
    }
  }

  async waitForTarget () {
    if (!this.shouldCheckForTarget || !this.isTargetBased) {
      return;
    }

    await retryInterval(WAIT_FOR_TARGET_RETRIES, WAIT_FOR_TARGET_INTERVAL, () => {
      if (_.isEmpty(this.targets)) {
        throw new Error('No targets found, unable to communicate with device');
      }
    });
  }

  async send (command, opts = {}) {
    try {
      await this.waitForTarget();
      return await this.sendMessage(command, opts);
    } catch (err) {
      if (err.message.includes(`'Target' domain was not found`)) {
        this.setCommunicationProtocol(false);
        return await this.sendMessage(command, opts);
      } else if (err.message.includes(`domain was not found`)) {
        this.setCommunicationProtocol(true);
        await this.waitForTarget();
        return await this.sendMessage(command, opts);
      }
      throw err;
    }
  }

  async sendMessage (/* command, opts = {} */) { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'sendMessage' function`);
  }

  addTarget (targetInfo) {
    if (_.isUndefined(targetInfo) || _.isUndefined(targetInfo.targetId)) {
      log.debug(`Received 'targetCreated' event with no target. Skipping`);
      return;
    }
    log.debug(`Target created: ${JSON.stringify(targetInfo)}`);
    if (!this.targets.includes(targetInfo.targetId)) {
      this.targets.push(targetInfo.targetId);
    }
  }

  removeTarget (targetInfo) {
    if (_.isUndefined(targetInfo) || _.isUndefined(targetInfo.targetId)) {
      log.debug(`Received 'taretDestroyed' event with no target. Skipping`);
      return;
    }
    log.debug(`Target destroyed: ${JSON.stringify(targetInfo)}`);
    _.pull(this.targets, targetInfo.targetId);
  }

  get targets () {
    this._targets = this._targets || [];
    return this._targets;
  }

  get target () {
    if (_.isEmpty(this.targets)) {
      throw new Error('No targets found, unable to communicate with device');
    }

    // at the moment, there is no indication of how the mapping works
    // so take the first?
    return _.first(this.targets);
  }

  get shouldCheckForTarget () {
    return this._shouldCheckForTarget;
  }

  set shouldCheckForTarget (shouldCheckForTarget) {
    this._shouldCheckForTarget = !!shouldCheckForTarget;
  }
}
