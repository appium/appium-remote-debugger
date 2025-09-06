import log from '../logger';
import _ from 'lodash';
import { util } from '@appium/support';
import EventEmitters from 'events';


export default class RpcMessageHandler extends EventEmitters {
  constructor () {
    super();
  }

  /**
   * Handle a message from the Web Inspector.
   *
   * @param {import('@appium/types').StringRecord} plist
   * @returns {Promise<void>}
   */
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

  /**
   * Parse the data key from the plist.
   *
   * @param {import('@appium/types').StringRecord} plist
   * @returns {DataMessage}
   * @throws {Error} if the data key cannot be parsed
   */
  parseDataKey (plist) {
    try {
      return JSON.parse(plist.__argument.WIRMessageDataKey.toString('utf8'));
    } catch (err) {
      log.error(`Unparseable message data: ${_.truncate(JSON.stringify(plist), {length: 100})}`);
      throw new Error(`Unable to parse message data: ${err.message}`);
    }
  }

  /**
   * Dispatch a data message.
   *
   * @param {string} msgId If not empty then the following event is going to be emitted:
   * - <msgId, error, result>
   * If empty then the following event is going to be emitted:
   * - <name, error, ..args>
   * @param {string | undefined} method
   * @param {import('@appium/types').StringRecord | undefined} params
   * @param {any} result
   * @param {Error | undefined} error
   * @returns {Promise<void>}
   */
  async dispatchDataMessage (msgId, method, params, result, error) {
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

    /** @type {any[]} */
    const eventNames = [method];
    /** @type {any[]} */
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
        // @ts-ignore This is fine for the given method
        args = [params || params.record];
        break;
      case 'Console.messageAdded':
        args = [params?.message];
        break;
      case 'Runtime.executionContextCreated':
        args = [params?.context];
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

  /**
   * Handle a data message from the Web Inspector.
   *
   * @param {import('@appium/types').StringRecord} plist
   * @returns {Promise<void>}
   */
  async handleDataMessage (plist) {
    const dataKey = this.parseDataKey(plist);
    let msgId = (dataKey.id || '').toString();
    let result = dataKey.result;

    let method = dataKey.method;
    let params = dataKey.params;

    const parseError = () => {
      const defaultMessage = 'Error occurred in handling data message';
      if (result?.wasThrown) {
        const message = (result?.result?.value || result?.result?.description)
          ? (result?.result?.value || result?.result?.description)
          : (dataKey.error ?? defaultMessage);
        return new Error(message);
      }
      if (dataKey.error) {
        if (_.isPlainObject(dataKey.error)) {
          const dataKeyError = /** @type {DataErrorMessage} */ (dataKey.error);
          let error = new Error(defaultMessage);
          for (const key of Object.keys(dataKeyError)) {
            error[key] = dataKeyError[key];
          }
          return error;
        }
        return new Error(String(dataKey.error || defaultMessage));
      }
      return undefined;
    };

    switch (method) {
      case 'Target.targetCreated':
      case 'Target.targetDestroyed':
      case 'Target.didCommitProvisionalTarget': {
        const app = plist.__argument.WIRApplicationIdentifierKey;
        const args = method === 'Target.didCommitProvisionalTarget'
          ? params
          : (params.targetInfo ?? {targetId: params.targetId});
        this.emit(method, null, app, args);
        return;
      }
      case 'Target.dispatchMessageFromTarget': {
        if (!dataKey.error) {
          try {
            const message = JSON.parse(dataKey.params.message);
            msgId = _.isUndefined(message.id) ? '' : String(message.id);
            method = message.method;
            result = message.result || message;
            params = result.params;
          } catch (err) {
            // if this happens then some aspect of the protocol is missing to us
            // so print the entire message to get visibiity into what is going on
            log.error(`Unexpected message format from Web Inspector: ${util.jsonStringify(plist, null)}`);
            throw err;
          }
        }

        await this.dispatchDataMessage(msgId, method, params, result, parseError());
        return;
      }
      default: {
        await this.dispatchDataMessage(msgId, method, params, result, parseError());
      }
    } // switch
  } // function
}

/**
 * @typedef {Object} DataMessage
 * @property {string} [id]
 * @property {string} method
 * @property {import('@appium/types').StringRecord} params
 * @property {any} result
 * @property {string | DataErrorMessage} [error]
 */

/**
 * @typedef {Object} DataErrorMessage
 * @property {string} message
 * @property {number} code
 * @property {any} data
 */
