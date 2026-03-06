import _ from 'lodash';
import {getProtocolCommand} from '../protocol';
import type {
  RawRemoteCommand,
  RemoteCommandOpts,
  ProtocolCommandOpts,
  AppIdKey,
  PageIdKey,
  RemoteCommandId,
} from '../types';

const OBJECT_GROUP = 'console';

const MINIMAL_COMMAND = 'getMinimalCommand';
const FULL_COMMAND = 'getFullCommand';
const DIRECT_COMMAND = 'getDirectCommand';

// mapping of commands to the function for getting the command
// defaults to `getMinimalCommand`, so no need to have those listed here
const COMMANDS = {
  'Page.getCookies': FULL_COMMAND,

  'Runtime.awaitPromise': FULL_COMMAND,
  'Runtime.callFunctionOn': FULL_COMMAND,
  'Runtime.evaluate': FULL_COMMAND,

  'Target.exists': DIRECT_COMMAND,
  'Target.setPauseOnStart': DIRECT_COMMAND,
  'Target.resume': DIRECT_COMMAND,

  'Timeline.start': FULL_COMMAND,
  'Timeline.stop': FULL_COMMAND,
} as const;

type CommandBuilderFunction = typeof MINIMAL_COMMAND | typeof FULL_COMMAND | typeof DIRECT_COMMAND;

/**
 * Generates remote commands for communicating with the Web Inspector.
 * Provides methods for creating various types of commands including connection
 * setup, application management, and protocol commands.
 */
export class RemoteMessages {
  /**
   * Creates a command to set the connection key for the Web Inspector session.
   *
   * @param connId - The connection identifier.
   * @returns A RawRemoteCommand for setting the connection key.
   */
  setConnectionKey(connId: string): RawRemoteCommand {
    return {
      __argument: {
        WIRConnectionIdentifierKey: connId,
      },
      __selector: '_rpc_reportIdentifier:',
    };
  }

  /**
   * Creates a command to connect to a specific application.
   *
   * @param connId - The connection identifier.
   * @param appIdKey - The application identifier key.
   * @returns A RawRemoteCommand for connecting to the application.
   */
  connectToApp(connId: string, appIdKey: AppIdKey): RawRemoteCommand {
    return {
      __argument: {
        WIRConnectionIdentifierKey: connId,
        WIRApplicationIdentifierKey: appIdKey,
      },
      __selector: '_rpc_forwardGetListing:',
    };
  }

  /**
   * Creates a command to set the sender key for message routing.
   *
   * @param connId - The connection identifier.
   * @param senderId - The sender identifier.
   * @param appIdKey - The application identifier key.
   * @param pageIdKey - Optional page identifier key.
   * @returns A RawRemoteCommand for setting the sender key.
   */
  setSenderKey(
    connId: string,
    senderId: string,
    appIdKey: AppIdKey,
    pageIdKey?: PageIdKey,
  ): RawRemoteCommand {
    return {
      __argument: {
        WIRApplicationIdentifierKey: appIdKey,
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRPageIdentifierKey: pageIdKey,
        WIRAutomaticallyPause: false,
      },
      __selector: '_rpc_forwardSocketSetup:',
    };
  }

  /**
   * Creates a command to indicate web view status.
   *
   * @param connId - The connection identifier.
   * @param appIdKey - The application identifier key.
   * @param pageIdKey - Optional page identifier key.
   * @param enabled - Whether the web view indication is enabled. Defaults to true if not provided.
   * @returns A RawRemoteCommand for indicating web view status.
   */
  indicateWebView(
    connId: string,
    appIdKey: AppIdKey,
    pageIdKey?: PageIdKey,
    enabled?: boolean,
  ): RawRemoteCommand {
    return {
      __argument: {
        WIRApplicationIdentifierKey: appIdKey,
        WIRIndicateEnabledKey: _.isNil(enabled) ? true : enabled,
        WIRConnectionIdentifierKey: connId,
        WIRPageIdentifierKey: pageIdKey,
      },
      __selector: '_rpc_forwardIndicateWebView:',
    };
  }

  /**
   * Creates a command to launch an application.
   *
   * @param bundleId - The bundle identifier of the application to launch.
   * @returns A RawRemoteCommand for launching the application.
   */
  launchApplication(bundleId: string): RawRemoteCommand {
    return {
      __argument: {
        WIRApplicationBundleIdentifierKey: bundleId,
      },
      __selector: '_rpc_requestApplicationLaunch:',
    };
  }

  /**
   * Creates a full command with all default parameters included.
   * This includes objectGroup, includeCommandLineAPI, and other runtime options.
   *
   * @param opts - Options combining RemoteCommandOpts and ProtocolCommandOpts.
   * @returns A RawRemoteCommand with full parameter set.
   */
  getFullCommand(opts: RemoteCommandOpts & ProtocolCommandOpts): RawRemoteCommand {
    const {method, params, connId, senderId, appIdKey, pageIdKey, targetId, id} = opts;

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
        id: parseInt(id, 10),
        method,
        params: Object.assign(
          {
            objectGroup: OBJECT_GROUP,
            includeCommandLineAPI: true,
            doNotPauseOnExceptionsAndMuteConsole: false,
            emulateUserGesture: false,
            generatePreview: false,
            saveResult: false,
          },
          params,
        ),
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
    return _.omitBy(plist, _.isNil) as RawRemoteCommand;
  }

  /**
   * Creates a minimal command with only the essential parameters.
   * This is the default command type for most operations.
   *
   * @param opts - Options combining RemoteCommandOpts and ProtocolCommandOpts.
   * @returns A RawRemoteCommand with minimal parameter set.
   */
  getMinimalCommand(opts: RemoteCommandOpts & ProtocolCommandOpts): RawRemoteCommand {
    const {method, params, connId, senderId, appIdKey, pageIdKey, targetId, id} = opts;

    const realMethod = 'Target.sendMessageToTarget';
    const realParams = {
      targetId,
      message: JSON.stringify({
        id: parseInt(id, 10),
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
      __selector: '_rpc_forwardSocketData:',
    };
    return _.omitBy(plist, _.isNil) as RawRemoteCommand;
  }

  /**
   * Creates a direct command that bypasses the Target.sendMessageToTarget wrapper.
   * Used for certain Target domain commands.
   *
   * @param opts - Options combining RemoteCommandOpts and ProtocolCommandOpts.
   * @returns A RawRemoteCommand for direct protocol communication.
   */
  getDirectCommand(opts: RemoteCommandOpts & ProtocolCommandOpts): RawRemoteCommand {
    const {method, params, connId, senderId, appIdKey, pageIdKey, id} = opts;

    const plist = {
      __argument: {
        WIRSocketDataKey: {
          id: parseInt(id, 10),
          method,
          params,
        },
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRApplicationIdentifierKey: appIdKey,
        WIRPageIdentifierKey: pageIdKey,
      },
      __selector: '_rpc_forwardSocketData:',
    };
    return _.omitBy(plist, _.isNil) as RawRemoteCommand;
  }

  /**
   * Gets a remote command based on the command name and options.
   * Handles both Safari Web Inspector commands and WebKit protocol commands.
   *
   * @param command - The command name (e.g., 'setConnectionKey', 'Runtime.evaluate').
   * @param opts - Options for the command.
   * @returns A RawRemoteCommand appropriate for the given command.
   * @throws Error if required parameters are missing for specific commands.
   */
  getRemoteCommand(command: string, opts: RemoteCommandOpts & RemoteCommandId): RawRemoteCommand {
    const {id, connId, appIdKey, senderId, pageIdKey, targetId} = opts;

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
    const builderFunction = (COMMANDS[command as keyof typeof COMMANDS] ||
      MINIMAL_COMMAND) as CommandBuilderFunction;
    const commonOpts = getProtocolCommand(id, command, opts, isDirectCommand(command));
    return this[builderFunction]({
      ...commonOpts,
      connId,
      appIdKey,
      senderId,
      pageIdKey,
      targetId,
    });
  }
}

/**
 * Checks if a command should use the direct command format.
 * Direct commands bypass the Target.sendMessageToTarget wrapper.
 *
 * @param command - The command name to check.
 * @returns True if the command should use direct format, false otherwise.
 */
export function isDirectCommand(command: string): boolean {
  return COMMANDS[command as keyof typeof COMMANDS] === DIRECT_COMMAND;
}
