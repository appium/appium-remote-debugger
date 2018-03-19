"use strict";

import { DEBUGGER_TYPES } from './remote-debugger';
import _ from 'lodash';

/*
 * Connection functions
 */

function setConnectionKey (connId) {
  return {
    __argument: {
      WIRConnectionIdentifierKey: connId
    },
    __selector : '_rpc_reportIdentifier:'
  };
}

function connectToApp (connId, appIdKey) {
  return {
    __argument: {
      WIRConnectionIdentifierKey: connId,
      WIRApplicationIdentifierKey: appIdKey
    },
    __selector : '_rpc_forwardGetListing:'
  };
}

function setSenderKey (connId, senderId, appIdKey, pageIdKey) {
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

/*
 * Action functions
 */

function indicateWebView (connId, appIdKey, pageIdKey, enabled) {
  return {
    __argument: {
      WIRApplicationIdentifierKey: appIdKey,
      WIRIndicateEnabledKey: _.isUndefined(enabled) ? true : enabled,
      WIRConnectionIdentifierKey: connId,
      WIRPageIdentifierKey: pageIdKey
    },
    __selector: '_rpc_forwardIndicateWebView:'
  };
}

function sendJSCommand (connId, senderId, appIdKey, pageIdKey, debuggerType, js) {
  return command('Runtime.evaluate',
      {expression: js, returnByValue: true}, appIdKey, connId, senderId, pageIdKey, debuggerType);
}

function callJSFunction (connId, senderId, appIdKey, pageIdKey, debuggerType, objId, fn, args) {
  return command('Runtime.callFunctionOn',
      {objectId: objId, functionDeclaration: fn, arguments: args, returnByValue: true},
      appIdKey, connId, senderId, pageIdKey, debuggerType);
}

function setUrl (connId, senderId, appIdKey, pageIdKey, debuggerType, url) {
  return command('Page.navigate', {url}, appIdKey, connId,
      senderId, pageIdKey, debuggerType);
}

function enablePage (connId, senderId, appIdKey, pageIdKey, debuggerType) {
  return command('Page.enable', {}, appIdKey, connId, senderId,
                         pageIdKey, debuggerType);
}

function startTimeline (connId, senderId, appIdKey, pageIdKey, debuggerType) {
  return command('Timeline.start', {}, appIdKey, connId, senderId,
                         pageIdKey, debuggerType);
}

function stopTimeline (connId, senderId, appIdKey, pageIdKey, debuggerType) {
  return command('Timeline.stop', {}, appIdKey, connId, senderId,
                         pageIdKey, debuggerType);
}

function startConsole (connId, senderId, appIdKey, pageIdKey, debuggerType) {
  return command('Console.enable', {}, appIdKey, connId, senderId,
                         pageIdKey, debuggerType);
}

function stopConsole (connId, senderId, appIdKey, pageIdKey, debuggerType) {
  return command('Console.disable', {}, appIdKey, connId, senderId,
                         pageIdKey, debuggerType);
}

function startNetwork (connId, senderId, appIdKey, pageIdKey, debuggerType) {
  return command('Network.enable', {}, appIdKey, connId, senderId,
                         pageIdKey, debuggerType);
}

function stopNetwork (connId, senderId, appIdKey, pageIdKey, debuggerType) {
  return command('Network.disable', {}, appIdKey, connId, senderId,
                         pageIdKey, debuggerType);
}


/*
 * Internal functions
 */

function command (method, params, appIdKey, connId, senderId, pageIdKey, debuggerType) {
  if (debuggerType !== null && debuggerType === DEBUGGER_TYPES.webkit) {
    return commandWebKit(method, params);
  } else {
    return commandWebInspector(method, params, appIdKey, connId, senderId, pageIdKey);
  }
}

function commandWebInspector (method, params, appIdKey, connId, senderId, pageIdKey) {
  let plist = {
    __argument: {
      WIRApplicationIdentifierKey: appIdKey,
      WIRSocketDataKey: {
        method,
        params: {
          objectGroup: 'console',
          includeCommandLineAPI: true,
          doNotPauseOnExceptionsAndMuteConsole: true,
        }
      },
      WIRConnectionIdentifierKey: connId,
      WIRSenderKey: senderId,
      WIRPageIdentifierKey: pageIdKey
    },
    __selector: '_rpc_forwardSocketData:'
  };
  if (params) {
    plist.__argument.WIRSocketDataKey.params =
      _.extend(plist.__argument.WIRSocketDataKey.params, params);
  }
  return plist;
}

//generate a json request using the webkit protocol
function commandWebKit (method, params) {
  let jsonRequest = {
    method,
    params: {
      objectGroup: 'console',
      includeCommandLineAPI: true,
      doNotPauseOnExceptionsAndMuteConsole: true
    }
  };
  if (params) {
    //if there any parameters add them
    jsonRequest.params = _.extend(jsonRequest.params, params);
  }
  return jsonRequest;
}

export default function getRemoteCommand (command, opts) {
  let cmd;

  switch (command) {
    case 'setConnectionKey':
      cmd = setConnectionKey(opts.connId);
      break;
    case 'connectToApp':
      cmd = connectToApp(opts.connId, opts.appIdKey);
      break;
    case 'setSenderKey':
      cmd = setSenderKey(opts.connId, opts.senderId, opts.appIdKey,
              opts.pageIdKey);
      break;
    case 'indicateWebView':
      cmd = indicateWebView(opts.connId, opts.appIdKey, opts.pageIdKey,
              opts.enabled);
      break;
    case 'sendJSCommand':
      cmd = sendJSCommand(opts.connId, opts.senderId, opts.appIdKey,
              opts.pageIdKey, opts.debuggerType, opts.command);
      break;
    case 'callJSFunction':
      cmd = callJSFunction(opts.connId, opts.senderId, opts.appIdKey,
              opts.pageIdKey, opts.debuggerType, opts.objId, opts.fn,
              opts.args);
      break;
    case 'setUrl':
      cmd = setUrl(opts.connId, opts.senderId, opts.appIdKey, opts.pageIdKey,
              opts.debuggerType, opts.url);
      break;
    case 'enablePage':
      cmd = enablePage(opts.connId, opts.senderId, opts.appIdKey,
              opts.pageIdKey, opts.debuggerType);
      break;
    case 'startTimeline':
      cmd = startTimeline(opts.connId, opts.senderId, opts.appIdKey,
              opts.pageIdKey, opts.debuggerType);
      break;
    case 'stopTimeline':
      cmd = stopTimeline(opts.connId, opts.senderId, opts.appIdKey,
              opts.pageIdKey, opts.debuggerType);
      break;
    case 'startConsole':
      cmd = startConsole(opts.connId, opts.senderId, opts.appIdKey,
              opts.pageIdKey, opts.debuggerType);
      break;
    case 'stopConsole':
      cmd = stopConsole(opts.connId, opts.senderId, opts.appIdKey,
              opts.pageIdKey, opts.debuggerType);
      break;
    case 'startNetwork':
      cmd = startNetwork(opts.connId, opts.senderId, opts.appIdKey,
              opts.pageIdKey, opts.debuggerType);
      break;
    case 'stopNetwork':
      cmd = stopNetwork(opts.connId, opts.senderId, opts.appIdKey,
              opts.pageIdKey, opts.debuggerType);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }

  return cmd;
}
