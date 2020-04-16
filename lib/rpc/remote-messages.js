import _ from 'lodash';
import getProtocolCommand from '../protocol';


const OBJECT_GROUP = 'console';

const MINIMAL_COMMAND = 'getMinimalCommand';
const FULL_COMMAND = 'getFullCommand';
const DIRECT_COMMAND = 'getDirectCommand';

// mapping of commands to the function for getting the command
// defaults to `getMinimalCommand`, so no need to have those listed here
const COMMANDS = {
  'Page.getCookies': FULL_COMMAND,
  'Page.navigate': FULL_COMMAND,

  'Runtime.awaitPromise': FULL_COMMAND,
  'Runtime.callFunctionOn': FULL_COMMAND,
  'Runtime.evaluate': FULL_COMMAND,

  'Target.exists': DIRECT_COMMAND,

  'Timeline.start': FULL_COMMAND,
  'Timeline.stop': FULL_COMMAND,
};

class RemoteMessages {
  constructor (isTargetBased = false) {
    this.isTargetBased = isTargetBased;
  }

  set isTargetBased (isTargetBased) {
    this._isTargetBased = isTargetBased;
  }

  get isTargetBased () {
    return this._isTargetBased;
  }

  /*
   * Connection functions
   */

  setConnectionKey (connId) {
    return {
      __argument: {
        WIRConnectionIdentifierKey: connId
      },
      __selector: '_rpc_reportIdentifier:'
    };
  }

  connectToApp (connId, appIdKey) {
    return {
      __argument: {
        WIRConnectionIdentifierKey: connId,
        WIRApplicationIdentifierKey: appIdKey
      },
      __selector: '_rpc_forwardGetListing:'
    };
  }

  setSenderKey (connId, senderId, appIdKey, pageIdKey) {
    return {
      __argument: {
        WIRApplicationIdentifierKey: appIdKey,
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRPageIdentifierKey: pageIdKey,
        WIRAutomaticallyPause: false
      },
      __selector: '_rpc_forwardSocketSetup:'
    };
  }

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

  launchApplication (bundleId) {
    return {
      __argument: {
        WIRApplicationBundleIdentifierKey: bundleId
      },
      __selector: '_rpc_requestApplicationLaunch:'
    };
  }

  getFullCommand (opts = {}) {
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

    let realMethod;
    let realParams;
    if (this.isTargetBased) {
      realMethod = 'Target.sendMessageToTarget';
      realParams = {
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
    } else {
      realMethod = method;
      realParams = Object.assign({
        objectGroup: OBJECT_GROUP,
        includeCommandLineAPI: true,
        doNotPauseOnExceptionsAndMuteConsole: false,
        emulateUserGesture: false,
      }, params);
    }

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
    return _.omitBy(plist, _.isNil);
  }

  getMinimalCommand (opts = {}) {
    const {method, params, connId, senderId, appIdKey, pageIdKey, targetId, id} = opts;

    let realMethod = method;
    let realParams = params;
    if (this.isTargetBased) {
      realMethod = 'Target.sendMessageToTarget';
      realParams = {
        targetId,
        message: JSON.stringify({
          id,
          method,
          params,
        }),
      };
    }

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
    return _.omitBy(plist, _.isNil);
  }

  getDirectCommand (opts = {}) {
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
    return _.omitBy(plist, _.isNil);
  }

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
        return this.setConnectionKey(connId);
      case 'indicateWebView':
        return this.indicateWebView(connId, appIdKey, pageIdKey, opts.enabled);
      case 'connectToApp':
        return this.connectToApp(connId, appIdKey);
      case 'setSenderKey':
        return this.setSenderKey(connId, senderId, appIdKey, pageIdKey);
      case 'launchApplication':
        return this.launchApplication(opts.bundleId);
    }

    // deal with WebKit commands
    const builderFunction = COMMANDS[command] || MINIMAL_COMMAND;
    return this[builderFunction]({
      ...getProtocolCommand(id, command, opts),
      connId,
      appIdKey,
      senderId,
      pageIdKey,
      targetId,
    });
  }
}

export { RemoteMessages };
export default RemoteMessages;
