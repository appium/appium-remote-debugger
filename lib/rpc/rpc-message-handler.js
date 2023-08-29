import log from '../logger';
import _ from 'lodash';
import { util } from '@appium/support';
import EventEmitters from 'events';


export default class RpcMessageHandler extends EventEmitters {
  constructor (isTargetBased = false) {
    super();

    this.isTargetBased = isTargetBased;
  }

  get isTargetBased () {
    return this._isTargetBased;
  }

  set isTargetBased (isTargetBased) {
    this._isTargetBased = !!isTargetBased;
  }

  async handleMessage (plist) {
    const selector = plist.__selector;
    if (!selector) {
      log.debug('Got an invalid plist');
      return;
    }

    const argument = plist.__argument;
    switch (selector) {
      case '_rpc_reportSetup:':
        this.emit('_rpc_reportSetup:',
          null,
          argument.WIRSimulatorNameKey,
          argument.WIRSimulatorBuildKey,
          argument.WIRSimulatorProductVersionKey
        );
        break;
      case '_rpc_reportConnectedApplicationList:':
        this.emit('_rpc_reportConnectedApplicationList:',
          null,
          argument.WIRApplicationDictionaryKey
        );
        break;
      case '_rpc_applicationSentListing:':
        this.emit('_rpc_forwardGetListing:',
          null,
          argument.WIRApplicationIdentifierKey,
          argument.WIRListingKey
        );
        break;
      case '_rpc_applicationConnected:':
        this.emit('_rpc_applicationConnected:', null, argument);
        break;
      case '_rpc_applicationDisconnected:':
        this.emit('_rpc_applicationDisconnected:', null, argument);
        break;
      case '_rpc_applicationUpdated:':
        this.emit('_rpc_applicationUpdated:', null, argument);
        break;
      case '_rpc_reportConnectedDriverList:':
        this.emit('_rpc_reportConnectedDriverList:', null, argument);
        break;
      case '_rpc_reportCurrentState:':
        this.emit('_rpc_reportCurrentState:', null, argument);
        break;
      case '_rpc_applicationSentData:':
        await this.handleDataMessage(plist);
        break;
      default:
        log.debug(`Debugger got a message for '${selector}' and have no ` +
          `handler, doing nothing.`);
    }
  }

  parseDataKey (plist) {
    try {
      return JSON.parse(plist.__argument.WIRMessageDataKey.toString('utf8'));
    } catch (err) {
      log.error(`Unparseable message data: ${_.truncate(JSON.stringify(plist), {length: 100})}`);
      throw new Error(`Unable to parse message data: ${err.message}`);
    }
  }

  async dispatchDataMessage (msgId, method, params, result, error) { // eslint-disable-line require-await
    if (!_.isEmpty(msgId)) {
      log.debug(`Handling message (id: '${msgId}')`);
    }

    if (msgId) {
      if (this.listenerCount(msgId)) {
        if (_.has(result?.result, 'value')) {
          result = result.result.value;
        }
        this.emit(msgId, error, result);
      } else {
        log.error(`Web Inspector returned data for message '${msgId}' ` +
          `but we were not waiting for that message! ` +
          `result: '${JSON.stringify(result)}'; ` +
          `error: '${JSON.stringify(error)}'`);
      }
      return;
    }

    let eventNames = [method];
    let args = [params];

    // some events have different names, or the arguments are mapped from the
    // parameters received
    switch (method) {
      case 'Page.frameStoppedLoading':
        eventNames.push('Page.frameNavigated');
      case 'Page.frameNavigated': // eslint-disable-line no-fallthrough
        args = [`'${method}' event`];
        break;
      case 'Timeline.eventRecorded':
        args = [params || params.record];
        break;
      case 'Console.messageAdded':
        args = [params.message];
        break;
      case 'Runtime.executionContextCreated':
        args = [params.context];
        break;
      default:
        // pass
        break;
    }

    if (_.startsWith(method, 'Network.')) {
      // aggregate Network events, and add original method name to the arguments
      eventNames.push('NetworkEvent');
      args.push(method);
    }
    if (_.startsWith(method, 'Console.')) {
      // aggregate Network events, and add original method name to the arguments
      eventNames.push('ConsoleEvent');
      args.push(method);
    }

    for (const name of eventNames) {
      this.emit(name, error, ...args);
    }
  }

  async handleDataMessage (plist) {
    const dataKey = this.parseDataKey(plist);
    let msgId = (dataKey.id || '').toString();
    let result = dataKey.result;

    let method = dataKey.method;
    let params;

    if (method === 'Target.targetCreated') {
      // this is in response to a `_rpc_forwardSocketSetup:` call
      // targetInfo: { targetId: 'page-1', type: 'page' }
      const app = plist.__argument.WIRApplicationIdentifierKey;
      const targetInfo = dataKey.params.targetInfo;
      this.emit('Target.targetCreated', null, app, targetInfo);
      return;
    } else if (method === 'Target.didCommitProvisionalTarget') {
      const app = plist.__argument.WIRApplicationIdentifierKey;
      const oldTargetId = dataKey.params.oldTargetId;
      const newTargetId = dataKey.params.newTargetId;
      this.emit('Target.didCommitProvisionalTarget', null, app, oldTargetId, newTargetId);
      return;
    } else if (method === 'Target.targetDestroyed') {
      const app = plist.__argument.WIRApplicationIdentifierKey;
      const targetInfo = dataKey.params.targetInfo || {targetId: dataKey.params.targetId};
      this.emit('Target.targetDestroyed', null, app, targetInfo);
      return;
    }

    if (!dataKey.error && this.isTargetBased) {
      if (dataKey.method !== 'Target.dispatchMessageFromTarget') {
        // this sort of message, at this point, is just an acknowledgement
        // that the original message was received
        return;
      }

      // at this point, we have a Target-based message wrapping a protocol message
      let message;
      try {
        message = JSON.parse(dataKey.params.message);
        msgId = message.id;
        method = message.method;
        result = message.result || message;
        params = result.params;
      } catch (err) {
        // if this happens then some aspect of the protocol is missing to us
        // so print the entire message to get visibiity into what is going on
        log.error(`Unexpected message format from Web Inspector:`);
        log.warn(util.jsonStringify(plist, null));
        throw err;
      }
    } else {
      params = dataKey.params;
    }

    // we can get an error, or we can get a response that is an error
    let error = dataKey.error || null;
    if (result?.wasThrown) {
      const message = (result?.result?.value || result?.result?.description)
        ? (result?.result?.value || result?.result?.description)
        : 'Error occurred in handling data message';
      error = new Error(message);
    }

    await this.dispatchDataMessage(msgId, method, params, result, error);
  }
}
