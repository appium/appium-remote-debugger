import _ from 'lodash';
import { getProtocolCommand } from '../protocol';


const OBJECT_GROUP = 'console';

const MINIMAL_COMMAND = 'getMinimalCommand';
const FULL_COMMAND = 'getFullCommand';
const DIRECT_COMMAND = 'getDirectCommand';

// mapping of commands to the function for getting the command
// defaults to `getMinimalCommand`, so no need to have those listed here
const COMMANDS = /** @type {const} */ ({
  'Page.getCookies': FULL_COMMAND,
  'Page.navigate': FULL_COMMAND,

  'Runtime.awaitPromise': FULL_COMMAND,
  'Runtime.callFunctionOn': FULL_COMMAND,
  'Runtime.evaluate': FULL_COMMAND,

  'Target.exists': DIRECT_COMMAND,
  'Target.setPauseOnStart': DIRECT_COMMAND,
  'Target.resume': DIRECT_COMMAND,

  'Timeline.start': FULL_COMMAND,
  'Timeline.stop': FULL_COMMAND,
});

export class RemoteMessages {
  // #region Connection functions

  /**
   *
   * @param {string} connId
   * @returns {import('../types').RawRemoteCommand}
   */
  setConnectionKey (connId) {
    return {
      __argument: {
        WIRConnectionIdentifierKey: connId
      },
      __selector: '_rpc_reportIdentifier:'
    };
  }

  /**
   *
   * @param {string} connId
   * @param {import('../types').AppIdKey} appIdKey
   * @returns {import('../types').RawRemoteCommand}
   */
  connectToApp (connId, appIdKey) {
    return {
      __argument: {
        WIRConnectionIdentifierKey: connId,
        WIRApplicationIdentifierKey: appIdKey
      },
      __selector: '_rpc_forwardGetListing:'
    };
  }

  /**
   *
   * @param {string} connId
   * @param {string} senderId
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} [pageIdKey]
   * @returns {import('../types').RawRemoteCommand}
   */
  setSenderKey (connId, senderId, appIdKey, pageIdKey) {
    return {
      __argument: {
        WIRApplicationIdentifierKey: appIdKey,
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRPageIdentifierKey: pageIdKey,
        WIRAutomaticallyPause: false,
      },
      __selector: '_rpc_forwardSocketSetup:'
    };
  }

  /**
   *
   * @param {string} connId
   * @param {import('../types').AppIdKey} appIdKey
   * @param {import('../types').PageIdKey} [pageIdKey]
   * @param {boolean} [enabled]
   * @returns {import('../types').RawRemoteCommand}
   */
  indicateWebView (connId, appIdKey, pageIdKey, enabled) {
    return {
      __argument: {
        WIRApplicationIdentifierKey: appIdKey,
        WIRIndicateEnabledKey: _.isNil(enabled) ? true : enabled,
        WIRConnectionIdentifierKey: connId,
        WIRPageIdentifierKey: pageIdKey
      },
      __selector: '_rpc_forwardIndicateWebView:'
    };
  }

  /**
   *
   * @param {string} bundleId
   * @returns {import('../types').RawRemoteCommand}
   */
  launchApplication (bundleId) {
    return {
      __argument: {
        WIRApplicationBundleIdentifierKey: bundleId
      },
      __selector: '_rpc_requestApplicationLaunch:'
    };
  }

  /**
   *
   * @param {import('../types').RemoteCommandOpts & import('../types').ProtocolCommandOpts} opts
   * @returns {import('../types').RawRemoteCommand}
   */
  getFullCommand (opts) {
    const {
      method,
      params,
      connId,
      senderId,
      appIdKey,
      pageIdKey,
      targetId,
      id,
    } = opts;

    /* The Web Inspector has a number of parameters that can be passed in, as
     * seen when dumping what Safari is doing when communicating with it. Most
     * are kept as they are set for Safari. The exception is `emulateUserGesture`
     * which, on iOS 13+, breaks popup blocking (i.e., even with the popup
     * blocking setting on, new windows are openable both from links and from
     * JavaScript).
     */

    const realMethod = 'Target.sendMessageToTarget';
    const realParams = {
      targetId,
      message: JSON.stringify({
        id,
        method,
        params: Object.assign({
          objectGroup: OBJECT_GROUP,
          includeCommandLineAPI: true,
          doNotPauseOnExceptionsAndMuteConsole: false,
          emulateUserGesture: false,
          generatePreview: false,
          saveResult: false,
        }, params)
      }),
    };

    const plist = {
      __argument: {
        WIRSocketDataKey: {
          method: realMethod,
          params: realParams,
        },
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRApplicationIdentifierKey: appIdKey,
        WIRPageIdentifierKey: pageIdKey,
      },
      __selector: '_rpc_forwardSocketData:',
    };
    // @ts-ignore This is ok
    return _.omitBy(plist, _.isNil);
  }

  /**
   *
   * @param {import('../types').RemoteCommandOpts & import('../types').ProtocolCommandOpts} opts
   * @returns {import('../types').RawRemoteCommand}
   */
  getMinimalCommand (opts) {
    const {method, params, connId, senderId, appIdKey, pageIdKey, targetId, id} = opts;

    const realMethod = 'Target.sendMessageToTarget';
    const realParams = {
      targetId,
      message: JSON.stringify({
        id,
        method,
        params,
      }),
    };

    const plist = {
      __argument: {
        WIRSocketDataKey: {
          method: realMethod,
          params: realParams,
        },
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRApplicationIdentifierKey: appIdKey,
        WIRPageIdentifierKey: pageIdKey,
      },
      __selector: '_rpc_forwardSocketData:'
    };
    // @ts-ignore This is ok
    return _.omitBy(plist, _.isNil);
  }

  /**
   *
   * @param {import('../types').RemoteCommandOpts & import('../types').ProtocolCommandOpts} opts
   * @returns {import('../types').RawRemoteCommand}
   */
  getDirectCommand (opts) {
    const {method, params, connId, senderId, appIdKey, pageIdKey, id} = opts;

    const plist = {
      __argument: {
        WIRSocketDataKey: {
          id,
          method,
          params,
        },
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRApplicationIdentifierKey: appIdKey,
        WIRPageIdentifierKey: pageIdKey,
      },
      __selector: '_rpc_forwardSocketData:'
    };
    // @ts-ignore This is ok
    return _.omitBy(plist, _.isNil);
  }

  /**
   *
   * @param {string} command
   * @param {import('../types').RemoteCommandOpts} opts
   * @returns {import('../types').RawRemoteCommand}
   */
  getRemoteCommand (command, opts) {
    const {
      id,
      connId,
      appIdKey,
      senderId,
      pageIdKey,
      targetId,
    } = opts;

    // deal with Safari Web Inspector commands
    switch (command) {
      case 'setConnectionKey':
        if (!connId) {
          throw new Error('Cannot set connection key without a connection ID');
        }
        return this.setConnectionKey(connId);
      case 'indicateWebView':
        if (!connId || !appIdKey) {
          throw new Error('Cannot indicate web view without a connection ID and app ID');
        }
        return this.indicateWebView(connId, appIdKey, pageIdKey, !!opts.enabled);
      case 'connectToApp':
        if (!connId || !appIdKey) {
          throw new Error('Cannot connect to app without a connection ID and app ID');
        }
        return this.connectToApp(connId, appIdKey);
      case 'setSenderKey':
        if (!connId || !senderId || !appIdKey) {
          throw new Error('Cannot set sender key without a connection ID, sender ID, and app ID');
        }
        return this.setSenderKey(connId, senderId, appIdKey, pageIdKey);
      case 'launchApplication':
        if (!opts.bundleId) {
          throw new Error('Cannot launch application without a bundle ID');
        }
        return this.launchApplication(opts.bundleId);
    }

    // deal with WebKit commands
    const builderFunction = COMMANDS[command] || MINIMAL_COMMAND;
    const commonOpts = getProtocolCommand(
      /** @type {string} */ (id),
      command,
      opts,
      isDirectCommand(command),
    );
    return this[builderFunction]({
      ...commonOpts,
      connId,
      appIdKey,
      senderId,
      pageIdKey,
      targetId,
    });
  }

  // #endregion
}

/**
 *
 * @param {string} command
 * @returns {boolean}
 */
export function isDirectCommand (command) {
  return COMMANDS[command] === DIRECT_COMMAND;
}

export default RemoteMessages;
