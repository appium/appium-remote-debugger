import { EventEmitter } from 'node:events';
import { log } from '../logger';
import _ from 'lodash';
import { util } from '@appium/support';
import type { StringRecord } from '@appium/types';

/**
 * Represents a data message from the Web Inspector.
 */
interface DataMessage {
  id?: string;
  method: string;
  params: StringRecord;
  result: any;
  error?: string | DataErrorMessage;
}

/**
 * Represents an error message structure in a data message.
 */
interface DataErrorMessage {
  message: string;
  code: number;
  data: any;
}

/**
 * Handles messages from the Web Inspector and dispatches them as events.
 * Extends EventEmitter to provide event-based message handling.
 */
export default class RpcMessageHandler extends EventEmitter {
  /**
   * Handles a message from the Web Inspector by parsing the selector
   * and emitting appropriate events.
   *
   * @param plist - The plist message from the Web Inspector containing
   *                __selector and __argument properties.
   */
  async handleMessage(plist: StringRecord): Promise<void> {
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
   * Parses the data key from a plist message.
   * The data key is a JSON string that needs to be parsed.
   *
   * @param plist - The plist message containing the data key.
   * @returns The parsed DataMessage object.
   * @throws Error if the data key cannot be parsed.
   */
  private parseDataKey(plist: StringRecord): DataMessage {
    try {
      return JSON.parse(plist.__argument.WIRMessageDataKey.toString('utf8'));
    } catch (err: any) {
      log.error(`Unparseable message data: ${_.truncate(JSON.stringify(plist), {length: 100})}`);
      throw new Error(`Unable to parse message data: ${err.message}`);
    }
  }

  /**
   * Dispatches a data message by emitting events.
   * If msgId is provided, emits a message-specific event.
   * Otherwise, emits method-based events with appropriate argument mapping.
   *
   * @param msgId - If not empty, emits an event with this ID: <msgId, error, result>.
   *                If empty, emits method-based events: <name, error, ...args>.
   * @param method - The method name from the data message.
   * @param params - The parameters from the data message.
   * @param result - The result from the data message.
   * @param error - Any error that occurred during message processing.
   */
  private async dispatchDataMessage(
    msgId: string,
    method: string | undefined,
    params: StringRecord | undefined,
    result: any,
    error: Error | undefined
  ): Promise<void> {
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

    const eventNames: string[] = method ? [method] : [];
    let args: any[] = [params];

    // some events have different names, or the arguments are mapped from the
    // parameters received
    switch (method) {
      case 'Page.frameStoppedLoading':
        eventNames.push('Page.frameNavigated');
      // eslint-disable-next-line no-fallthrough
      case 'Page.frameNavigated':
        args = [`'${method}' event`];
        break;
      case 'Timeline.eventRecorded':
        args = [params || (params as any)?.record];
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

    if (method && _.startsWith(method, 'Network.')) {
      // aggregate Network events, and add original method name to the arguments
      eventNames.push('NetworkEvent');
      args.push(method);
    }
    if (method && _.startsWith(method, 'Console.')) {
      // aggregate Console events, and add original method name to the arguments
      eventNames.push('ConsoleEvent');
      args.push(method);
    }

    for (const name of eventNames) {
      this.emit(name, error, ...args);
    }
  }

  /**
   * Handles a data message from the Web Inspector by parsing it and
   * dispatching appropriate events based on the message type.
   *
   * @param plist - The plist message from the Web Inspector.
   */
  private async handleDataMessage(plist: StringRecord): Promise<void> {
    const dataKey = this.parseDataKey(plist);
    let msgId = (dataKey.id || '').toString();
    let result = dataKey.result;

    let method = dataKey.method;
    let params = dataKey.params;

    const parseError = (): Error | undefined => {
      const defaultMessage = 'Error occurred in handling data message';
      if (result?.wasThrown) {
        const message = (result?.result?.value || result?.result?.description)
          ? (result?.result?.value || result?.result?.description)
          : (dataKey.error ?? defaultMessage);
        return new Error(message);
      }
      if (dataKey.error) {
        if (_.isPlainObject(dataKey.error)) {
          const dataKeyError = dataKey.error as DataErrorMessage;
          const error = new Error(defaultMessage);
          for (const key of Object.keys(dataKeyError)) {
            (error as any)[key] = dataKeyError[key as keyof DataErrorMessage];
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
          } catch (err: any) {
            // if this happens then some aspect of the protocol is missing to us
            // so print the entire message to get visibility into what is going on
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
    }
  }
}
