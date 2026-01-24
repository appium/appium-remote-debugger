import { RemoteMessages } from './remote-messages';
import { waitForCondition } from 'asyncbox';
import { log } from '../logger';
import _ from 'lodash';
import B from 'bluebird';
import RpcMessageHandler from './rpc-message-handler';
import { util, timing } from '@appium/support';
import { EventEmitter } from 'node:events';
import AsyncLock from 'async-lock';
import { convertJavascriptEvaluationResult } from '../utils';
import type { StringRecord } from '@appium/types';
import type {
  AppIdKey,
  PageIdKey,
  TargetId,
  TargetInfo,
  ProvisionalTargetInfo,
  RemoteCommandOpts,
  RemoteCommand,
  RawRemoteCommand,
  RpcClientOptions,
  RemoteCommandId,
} from '../types';

const DATA_LOG_LENGTH = {length: 200};
const MIN_WAIT_FOR_TARGET_TIMEOUT_MS = 30000;
const DEFAULT_TARGET_CREATION_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const WAIT_FOR_TARGET_INTERVAL_MS = 100;
const NO_TARGET_SUPPORTED_ERROR = `'target' domain was not found`;
const MISSING_TARGET_ERROR_PATTERN = /Missing target/i;
const NO_TARGET_PRESENT_YET_ERRORS = [
  `domain was not found`,
  `some arguments of method`,
  `missing target`,
];
export const NEW_APP_CONNECTED_ERROR = 'New application has connected';
export const EMPTY_PAGE_DICTIONARY_ERROR = 'Empty page dictionary received';
const ON_PAGE_INITIALIZED_EVENT = 'onPageInitialized';

/**
 * Details about a pending page target notification.
 */
interface PendingPageTargetDetails {
  appIdKey: AppIdKey;
  pageIdKey: PageIdKey;
  pageReadinessDetector?: PageReadinessDetector;
}

/**
 * Pages to targets mapping with optional provisional target info and lock.
 */
interface PagesToTargets {
  [key: string]: TargetId | ProvisionalTargetInfo | AsyncLock | undefined;
  provisional?: ProvisionalTargetInfo;
  lock: AsyncLock;
}

/**
 * Mapping of application IDs to their pages and targets.
 */
type AppToTargetsMap = Record<AppIdKey, PagesToTargets>;

/**
 * Detector for determining when a page is ready.
 */
interface PageReadinessDetector {
  timeoutMs: number;
  readinessDetector: (readyState: string) => boolean;
}

/**
 * Base class for RPC clients that communicate with the Web Inspector.
 * Provides functionality for managing targets, sending commands, and handling
 * page initialization. Subclasses must implement device-specific connection logic.
 */
export class RpcClient {
  protected readonly messageHandler: RpcMessageHandler;
  protected readonly remoteMessages: RemoteMessages;
  protected connected: boolean;
  protected readonly isSafari: boolean;
  protected readonly connId: string;
  protected readonly senderId: string;
  protected msgId: number;
  protected readonly udid?: string;
  protected readonly logAllCommunication?: boolean;
  protected readonly logAllCommunicationHexDump?: boolean;
  protected readonly socketChunkSize?: number;
  protected readonly webInspectorMaxFrameLength?: number;
  protected readonly fullPageInitialization?: boolean;
  protected readonly bundleId?: string;
  protected readonly pageLoadTimeoutMs?: number;
  protected readonly platformVersion: string;
  protected readonly _contexts: number[];
  protected readonly _targets: AppToTargetsMap;
  protected readonly _targetSubscriptions: EventEmitter;
  protected _pendingTargetNotification?: PendingPageTargetDetails;
  protected readonly _targetCreationTimeoutMs: number;
  protected readonly _provisionedPages: Set<PageIdKey>;
  protected readonly _pageSelectionLock: AsyncLock;
  protected readonly _pageSelectionMonitor: EventEmitter;

  /**
   * @param opts - Options for configuring the RPC client.
   */
  constructor(opts: RpcClientOptions = {}) {
    const {
      bundleId,
      platformVersion = '',
      isSafari = true,
      logAllCommunication = false,
      logAllCommunicationHexDump = false,
      webInspectorMaxFrameLength,
      socketChunkSize,
      fullPageInitialization = false,
      udid,
      pageLoadTimeoutMs,
      targetCreationTimeoutMs = DEFAULT_TARGET_CREATION_TIMEOUT_MS,
    } = opts;

    this.isSafari = isSafari;

    this.connected = false;
    this.connId = util.uuidV4();
    this.senderId = util.uuidV4();
    this.msgId = 0;

    this.udid = udid;

    this.logAllCommunication = logAllCommunication;
    this.logAllCommunicationHexDump = logAllCommunicationHexDump;
    this.socketChunkSize = socketChunkSize;
    this.webInspectorMaxFrameLength = webInspectorMaxFrameLength;
    this.pageLoadTimeoutMs = pageLoadTimeoutMs;

    this.fullPageInitialization = fullPageInitialization;

    this.bundleId = bundleId;
    this.platformVersion = platformVersion;

    this._contexts = [];
    this._targets = {};
    this._targetSubscriptions = new EventEmitter();
    this._provisionedPages = new Set();
    this._pageSelectionLock = new AsyncLock();
    this._pageSelectionMonitor = new EventEmitter();
    this._targetCreationTimeoutMs = targetCreationTimeoutMs;

    this.remoteMessages = new RemoteMessages();

    this.messageHandler = new RpcMessageHandler();
    // add handlers for internal events
    this.messageHandler.on('Target.targetCreated', this.addTarget.bind(this));
    this.messageHandler.on('Target.didCommitProvisionalTarget', this.updateTarget.bind(this));
    this.messageHandler.on('Target.targetDestroyed', this.removeTarget.bind(this));
    this.messageHandler.on('Runtime.executionContextCreated', this.onExecutionContextCreated.bind(this));
    this.messageHandler.on('Heap.garbageCollected', this.onGarbageCollected.bind(this));
  }

  /**
   * Gets the list of execution context IDs.
   *
   * @returns Array of execution context IDs.
   */
  get contexts(): number[] {
    return this._contexts;
  }

  /**
   * Gets the mapping of applications to their pages and targets.
   *
   * @returns The targets mapping structure.
   */
  get targets(): AppToTargetsMap {
    return this._targets;
  }

  /**
   * Gets whether the client is currently connected.
   *
   * @returns True if connected, false otherwise.
   */
  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Sets the connection status.
   *
   * @param connected - The connection status to set.
   */
  set isConnected(connected: boolean) {
    this.connected = !!connected;
  }

  /**
   * Gets the event emitter for target subscriptions.
   *
   * @returns The target subscriptions event emitter.
   */
  get targetSubscriptions(): EventEmitter {
    return this._targetSubscriptions;
  }

  /**
   * Registers an event listener on the message handler.
   *
   * Supported events include:
   *
   * **RPC-level events:**
   * - `_rpc_reportSetup:` - Emitted when the debugger setup is reported
   * - `_rpc_reportConnectedApplicationList:` - Emitted when the list of connected applications is reported
   * - `_rpc_forwardGetListing:` - Emitted when an application sends a page listing
   * - `_rpc_applicationConnected:` - Emitted when a new application connects
   * - `_rpc_applicationDisconnected:` - Emitted when an application disconnects
   * - `_rpc_applicationUpdated:` - Emitted when an application is updated
   * - `_rpc_reportConnectedDriverList:` - Emitted when the list of connected drivers is reported
   * - `_rpc_reportCurrentState:` - Emitted when the current state is reported
   *
   * **Target events:**
   * - `Target.targetCreated` - Emitted when a new target is created (args: error, appIdKey, targetInfo)
   * - `Target.targetDestroyed` - Emitted when a target is destroyed (args: error, appIdKey, targetInfo)
   * - `Target.didCommitProvisionalTarget` - Emitted when a provisional target commits (args: error, appIdKey, provisionalTargetInfo)
   *
   * **Page events:**
   * - `Page.frameStoppedLoading` - Emitted when a frame stops loading
   * - `Page.frameNavigated` - Emitted when a frame navigates
   * - `Page.frameDetached` - Emitted when a frame is detached
   * - `Page.loadEventFired` - Emitted when the page load event fires
   *
   * **Runtime events:**
   * - `Runtime.executionContextCreated` - Emitted when an execution context is created (args: error, context)
   *
   * **Console events:**
   * - `Console.messageAdded` - Emitted when a console message is added (args: error, message)
   * - `Console.messageRepeatCountUpdated` - Emitted when a console message repeat count is updated
   * - `ConsoleEvent` - Aggregate event for all Console.* events (args: error, params, methodName)
   *
   * **Network events:**
   * - `NetworkEvent` - Aggregate event for all Network.* events (args: error, params, methodName)
   *
   * **Timeline events:**
   * - `Timeline.eventRecorded` - Emitted when a timeline event is recorded (args: error, record)
   *
   * **Heap events:**
   * - `Heap.garbageCollected` - Emitted when garbage collection occurs
   *
   * **Message ID events:**
   * - Any numeric string (message ID) - Emitted for command responses (args: error, result)
   *
   * @param event - The event name to listen for.
   * @param listener - The listener function to call when the event is emitted.
   *                  The listener receives (error, ...args) where error may be null/undefined.
   * @returns This instance for method chaining.
   */
  on(event: string, listener: (...args: any[]) => void): this {
    this.messageHandler.on(event, listener);
    return this;
  }

  /**
   * Registers a one-time event listener on the message handler.
   * The listener will be automatically removed after being called once.
   *
   * See {@link RpcClient.on} for a list of supported events.
   *
   * @param event - The event name to listen for.
   * @param listener - The listener function to call when the event is emitted.
   *                  The listener receives (error, ...args) where error may be null/undefined.
   * @returns This instance for method chaining.
   */
  once(event: string, listener: (...args: any[]) => void): this {
    this.messageHandler.once(event, listener);
    return this;
  }

  /**
   * Removes an event listener from the message handler.
   *
   * See {@link RpcClient.on} for a list of supported events.
   *
   * @param event - The event name to stop listening for.
   * @param listener - The listener function to remove.
   * @returns This instance for method chaining.
   */
  off(event: string, listener: (...args: any[]) => void): this {
    this.messageHandler.off(event, listener);
    return this;
  }

  /**
   * Waits for a target to be created for the specified app and page.
   * If the target already exists, returns it immediately. Otherwise,
   * waits up to the configured timeout for the target to be created.
   *
   * @param appIdKey - The application identifier key.
   * @param pageIdKey - The page identifier key.
   * @returns A promise that resolves to the target ID if found, undefined otherwise.
   * @throws Error if no target is found after the timeout.
   */
  async waitForTarget(appIdKey: AppIdKey, pageIdKey: PageIdKey): Promise<TargetId | undefined> {
    let target = this.getTarget(appIdKey, pageIdKey);
    if (target) {
      log.debug(
        `The target '${target}' for app '${appIdKey}' and page '${pageIdKey}' already exists, no need to wait`
      );
      return target;
    }

    // otherwise waiting is necessary to see what the target is
    const waitMs = Math.max(MIN_WAIT_FOR_TARGET_TIMEOUT_MS, this.pageLoadTimeoutMs || 0);
    log.debug(
      `Waiting up to ${waitMs}ms for a target to be created for ` +
      `app '${appIdKey}' and page '${pageIdKey}'`
    );
    try {
      await waitForCondition(() => {
        target = this.getTarget(appIdKey, pageIdKey);
        return !_.isEmpty(target);
      }, {
        waitMs,
        intervalMs: WAIT_FOR_TARGET_INTERVAL_MS,
      });
      return target;
    } catch (err: any) {
      if (!err.message.includes('Condition unmet')) {
        throw err;
      }
      throw new Error(
        `No targets could be matched for the app '${appIdKey}' and page '${pageIdKey}' after ${waitMs}ms`
      );
    }
  }

  /**
   * Sends a command to the remote debugger with automatic retry logic
   * for target-related errors. Handles cases where targets are not yet
   * available or not supported.
   *
   * @param command - The command name to send.
   * @param opts - Options for the command.
   * @param waitForResponse - Whether to wait for a response. Defaults to true.
   * @returns A promise that resolves to the command result or options.
   */
  async send(command: string, opts: RemoteCommandOpts, waitForResponse: boolean = true): Promise<any> {
    const timer = new timing.Timer().start();
    try {
      return await this.sendToDevice(command, opts, waitForResponse);
    } catch (err: any) {
      const {
        appIdKey,
        pageIdKey
      } = opts;
      const messageLc = (err.message || '').toLowerCase();
      if (messageLc.includes(NO_TARGET_SUPPORTED_ERROR)) {
        return await this.sendToDevice(command, opts, waitForResponse);
      } else if (appIdKey && NO_TARGET_PRESENT_YET_ERRORS.some((error) => messageLc.includes(error))) {
        await this.waitForTarget(appIdKey, pageIdKey as PageIdKey);
        return await this.sendToDevice(command, opts, waitForResponse);
      }
      throw err;
    } finally {
      log.debug(`Sending to Web Inspector took ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
    }
  }

  /**
   * Sends a command directly to the device, handling message routing,
   * response waiting, and error handling.
   *
   * @template TWaitForResponse - Whether to wait for a response.
   * @param command - The command name to send.
   * @param opts - Options for the command.
   * @param waitForResponse - Whether to wait for a response. Defaults to true.
   * @returns A promise that resolves based on waitForResponse:
   *          - If true: resolves to the response value
   *          - If false: resolves to the full options object
   */
  async sendToDevice<TWaitForResponse extends boolean = true>(
    command: string,
    opts: RemoteCommandOpts,
    waitForResponse: TWaitForResponse = true as TWaitForResponse
  ): Promise<TWaitForResponse extends true ? any : RemoteCommandOpts> {
    return await new B<any>(async (resolve, reject) => {
      // promise to be resolved whenever remote debugger
      // replies to our request

      // keep track of the messages coming and going using a simple sequential id
      const msgId = this.msgId++;
      // for target-base communication, everything is wrapped up
      const wrapperMsgId = this.msgId++;
      // acknowledge wrapper message
      this.messageHandler.on(wrapperMsgId.toString(), function (err: Error | null) {
        if (err) {
          reject(err);
        }
      });

      const appIdKey = opts.appIdKey;
      const pageIdKey = opts.pageIdKey;
      const targetId = opts.targetId ?? this.getTarget(appIdKey, pageIdKey);

      // retrieve the correct command to send
      const fullOpts: RemoteCommandOpts & RemoteCommandId = _.defaults({
        connId: this.connId,
        senderId: this.senderId,
        targetId,
        id: msgId.toString(),
      }, opts);
      let cmd: RawRemoteCommand;
      try {
        cmd = this.remoteMessages.getRemoteCommand(command, fullOpts);
      } catch (err: any) {
        log.error(err);
        return reject(err);
      }

      const finalCommand: RemoteCommand = {
        __argument: _.omit(cmd.__argument, ['WIRSocketDataKey']) as any,
        __selector: cmd.__selector,
      };

      const hasSocketData = _.isPlainObject(cmd.__argument?.WIRSocketDataKey);
      if (hasSocketData) {
        // make sure the message being sent has all the information that is needed
        const socketData = cmd.__argument.WIRSocketDataKey as StringRecord;
        if (_.isNil(socketData.id)) {
          // ! This must be a number
          socketData.id = wrapperMsgId;
        }
        finalCommand.__argument.WIRSocketDataKey = Buffer.from(JSON.stringify(socketData));
      }

      let messageHandled = true;
      if (!waitForResponse) {
        // the promise will be resolved as soon as the socket has been sent
        messageHandled = false;
        // do not log receipts
        this.messageHandler.once(msgId.toString(), (err: Error | null) => {
          if (err) {
            // we are not waiting for this, and if it errors it is most likely
            // a protocol change. Log and check during testing
            log.error(
              `Received error from send that is not being waited for (id: ${msgId}): ` +
              _.truncate(JSON.stringify(err), DATA_LOG_LENGTH)
            );
            // reject, though it is very rare that this will be triggered, since
            // the promise is resolved directly after send. On the off chance,
            // though, it will alert of a protocol change.
            reject(err);
          }
        });
      } else if (this.messageHandler.listenerCount(cmd.__selector)) {
        this.messageHandler.prependOnceListener(cmd.__selector, (err: Error | null, ...args: any[]) => {
          if (err) {
            return reject(err);
          }
          log.debug(`Received response from send (id: ${msgId}): '${_.truncate(JSON.stringify(args), DATA_LOG_LENGTH)}'`);
          resolve(args);
        });
      } else if (hasSocketData) {
        this.messageHandler.once(msgId.toString(), (err: Error | null, value: any) => {
          if (err) {
            return reject(new Error(`Remote debugger error with code '${(err as any).code}': ${err.message}`));
          }
          log.debug(`Received data response from send (id: ${msgId}): '${_.truncate(JSON.stringify(value), DATA_LOG_LENGTH)}'`);
          resolve(value);
        });
      } else {
        // nothing else is handling things, so just resolve when the message is sent
        messageHandled = false;
      }

      const msg = `Sending '${cmd.__selector}' message` +
        (appIdKey ? ` to app '${appIdKey}'` : '') +
        (pageIdKey ? `, page '${pageIdKey}'` : '') +
        (targetId ? `, target '${targetId}'` : '') +
        ` (id: ${msgId}): '${command}'`;
      log.debug(msg);
      try {
        await this.sendMessage(finalCommand);
        if (!messageHandled) {
          // There are no handlers waiting for a response before resolving,
          // and no errors sending the message over the socket, so resolve
          resolve(fullOpts as any);
        }
      } catch (err) {
        return reject(err);
      }
    });
  }

  /**
   * Connects to the remote debugger. Must be implemented by subclasses.
   *
   * @throws Error indicating that subclasses must implement this method.
   */
  async connect(): Promise<void> {
    throw new Error(`Sub-classes need to implement a 'connect' function`);
  }

  /**
   * Disconnects from the remote debugger and cleans up event listeners.
   */
  async disconnect(): Promise<void> {
    this.messageHandler.removeAllListeners();
  }

  /**
   * Sends a message to the device. Must be implemented by subclasses.
   *
   * @param _command - The command to send.
   * @throws Error indicating that subclasses must implement this method.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendMessage(_command: RemoteCommand): Promise<void> {
    throw new Error(`Sub-classes need to implement a 'sendMessage' function`);
  }

  /**
   * Receives data from the device. Must be implemented by subclasses.
   *
   * @param _data - The data received from the device.
   * @throws Error indicating that subclasses must implement this method.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async receive(_data: any): Promise<void> {
    throw new Error(`Sub-classes need to implement a 'receive' function`);
  }

  /**
   * Handles the creation of a new target for an application and page.
   * Initializes the page and waits for readiness if configured.
   *
   * @param err - Error if one occurred, undefined otherwise.
   * @param app - The application identifier key.
   * @param targetInfo - Information about the created target.
   */
  async addTarget(err: Error | undefined, app: AppIdKey, targetInfo: TargetInfo): Promise<void> {
    if (_.isNil(targetInfo?.targetId)) {
      log.info(`Received 'Target.targetCreated' event for app '${app}' with no target. Skipping`);
      return;
    }

    const pendingPageTargetDetails = this._getPendingPageTargetDetails(app, targetInfo);
    if (!pendingPageTargetDetails) {
      return;
    }
    const {
      appIdKey,
      pageIdKey,
      pageReadinessDetector,
    } = pendingPageTargetDetails;

    if (!_.isPlainObject(this.targets[appIdKey])) {
      this.targets[appIdKey] = {
        lock: new AsyncLock({maxOccupationTime: this._targetCreationTimeoutMs}),
      } as PagesToTargets;
    }
    const timer = new timing.Timer().start();

    const adjustPageReadinessDetector = (): PageReadinessDetector | undefined => {
      if (!pageReadinessDetector) {
        return;
      }

      const elapsedMs = timer.getDuration().asMilliSeconds;
      if (elapsedMs >= pageReadinessDetector.timeoutMs) {
        log.warn(
          `Page '${pageIdKey}' took too long to initialize, skipping readiness check`
        );
        return;
      }
      return {
        timeoutMs: pageReadinessDetector.timeoutMs - elapsedMs,
        readinessDetector: pageReadinessDetector.readinessDetector,
      };
    };

    if (targetInfo.isProvisional) {
      log.debug(
        `Provisional target created for app '${appIdKey}' and page '${pageIdKey}': '${JSON.stringify(targetInfo)}'`
      );

      this._provisionedPages.add(pageIdKey);
      try {
        await this.targets[appIdKey].lock.acquire(pageIdKey, async () => {
          let wasInitialized = false;
          try {
            wasInitialized = await this._initializePage(appIdKey, pageIdKey, targetInfo.targetId);
          } finally {
            if (targetInfo.isPaused) {
              await this._resumeTarget(appIdKey, pageIdKey, targetInfo.targetId);
            } else {
              log.debug(
                `Provisional target ${targetInfo.targetId}@${appIdKey} is not paused, so not resuming`
              );
            }
          }
          if (wasInitialized) {
            await this._waitForPageReadiness(
              appIdKey, pageIdKey, targetInfo.targetId, adjustPageReadinessDetector()
            );
          }
        });
      } catch (e: any) {
        log.warn(
          `Cannot complete the initialization of the provisional target '${targetInfo.targetId}' ` +
          `after ${timer.getDuration().asMilliSeconds}ms: ${e.message}`
        );
      }
      return;
    }

    log.debug(`Target created for app '${appIdKey}' and page '${pageIdKey}': ${JSON.stringify(targetInfo)}`);
    if (_.has(this.targets[appIdKey], pageIdKey)) {
      const existingTarget = this.targets[appIdKey][pageIdKey] as TargetId;
      log.debug(
        `There is already a target for this app and page ('${existingTarget}'). ` +
        `This might cause problems`
      );
    }
    this.targets[appIdKey][pageIdKey] = targetInfo.targetId;

    try {
      await this.send('Target.setPauseOnStart', {
        pauseOnStart: true,
        appIdKey,
        pageIdKey,
      });
    } catch (e: any) {
      log.debug(
        `Cannot setup pause on start for app '${appIdKey}' and page '${pageIdKey}': ${e.message}`
      );
    }

    try {
      await this.targets[appIdKey].lock.acquire(pageIdKey, async () => {
        let wasInitialized = false;
        try {
          if (this._provisionedPages.has(pageIdKey)) {
            log.debug(`Page '${pageIdKey}' has been already provisioned`);
            this._provisionedPages.delete(pageIdKey);
          } else {
            wasInitialized = await this._initializePage(appIdKey, pageIdKey);
          }
        } finally {
          if (targetInfo.isPaused) {
            await this._resumeTarget(appIdKey, pageIdKey, targetInfo.targetId);
          }
        }
        if (wasInitialized) {
          await this._waitForPageReadiness(
            appIdKey, pageIdKey, targetInfo.targetId, adjustPageReadinessDetector()
          );
        }
      });
    } catch (e: any) {
      log.warn(e.message);
    } finally {
      // Target creation is happening after provisioning,
      // which means the above lock would be already released
      // after provisioning is completed.
      this._pageSelectionMonitor.emit(ON_PAGE_INITIALIZED_EVENT, appIdKey, pageIdKey);
    }
  }

  /**
   * Handles updates to provisional targets when they commit.
   *
   * @param err - Error if one occurred, undefined otherwise.
   * @param app - The application identifier key.
   * @param targetInfo - Information about the provisional target update.
   */
  async updateTarget(err: Error | undefined, app: AppIdKey, targetInfo: ProvisionalTargetInfo): Promise<void> {
    const {
      oldTargetId,
      newTargetId,
    } = targetInfo;
    log.debug(`Target updated for app '${app}'. Old target: '${oldTargetId}', new target: '${newTargetId}'`);

    const appTargetsMap = this.targets[app];
    if (!appTargetsMap) {
      log.warn(`No existing target for app '${app}'. Not sure what to do`);
      return;
    }

    // save this, to be used if/when the existing target is destroyed
    appTargetsMap.provisional = {
      oldTargetId,
      newTargetId,
    };
  }

  /**
   * Handles the destruction of a target, including cleanup of provisional targets.
   *
   * @param err - Error if one occurred, undefined otherwise.
   * @param app - The application identifier key.
   * @param targetInfo - Information about the destroyed target.
   */
  async removeTarget(err: Error | undefined, app: AppIdKey, targetInfo: TargetInfo): Promise<void> {
    if (_.isNil(targetInfo?.targetId)) {
      log.debug(`Received 'Target.targetDestroyed' event with no target. Skipping`);
      return;
    }

    log.debug(`Target destroyed for app '${app}': ${targetInfo.targetId}`);

    // go through the targets and find the one that has a waiting provisional target
    if (this.targets[app]?.provisional?.oldTargetId === targetInfo.targetId) {
      const {oldTargetId, newTargetId} = this.targets[app].provisional;
      delete this.targets[app].provisional;

      // we do not know the page, so go through and find the existing target
      const appTargetsMap = this.targets[app];
      for (const [page, targetId] of _.toPairs(appTargetsMap)) {
        if (targetId === oldTargetId) {
          log.debug(
            `Found provisional target for app '${app}'. ` +
            `Old target: '${oldTargetId}', new target: '${newTargetId}'. Updating`
          );
          appTargetsMap[page] = newTargetId;
          return;
        }
      }
      log.warn(
        `Provisional target for app '${app}' found, but no suitable existing target found. This may cause problems`
      );
      log.warn(
        `Old target: '${oldTargetId}', new target: '${newTargetId}'. Existing targets: ${JSON.stringify(appTargetsMap)}`
      );
    }

    // if there is no waiting provisional target, just get rid of the existing one
    const targets = this.targets[app];
    for (const [page, targetId] of _.toPairs(targets)) {
      if (targetId === targetInfo.targetId) {
        delete targets[page];
        return;
      }
    }
    log.debug(`Target '${targetInfo.targetId}' deleted for app '${app}', but no such target exists`);
  }

  /**
   * Gets the target ID for a specific app and page combination.
   *
   * @param appIdKey - The application identifier key.
   * @param pageIdKey - The page identifier key.
   * @returns The target ID if found, undefined otherwise.
   */
  getTarget(appIdKey?: AppIdKey, pageIdKey?: PageIdKey): TargetId | undefined {
    if (!appIdKey || !pageIdKey) {
      return;
    }
    const target = this.targets[appIdKey]?.[pageIdKey];
    return target && typeof target === 'string' ? target : undefined;
  }

  /**
   * Selects a page within an application, setting up the Web Inspector session
   * and waiting for the page to be initialized. Mimics the steps that Desktop
   * Safari uses to initialize a Web Inspector session.
   *
   * @param appIdKey - The application identifier key.
   * @param pageIdKey - The page identifier key.
   * @param pageReadinessDetector - Optional detector for determining when the page is ready.
   */
  async selectPage(
    appIdKey: AppIdKey,
    pageIdKey: PageIdKey,
    pageReadinessDetector?: PageReadinessDetector
  ): Promise<void> {
    await this._pageSelectionLock.acquire(toPageSelectionKey(appIdKey, pageIdKey), async () => {
      this._pendingTargetNotification = {appIdKey, pageIdKey, pageReadinessDetector};
      this._provisionedPages.clear();

      if (this.getTarget(appIdKey, pageIdKey)) {
        log.debug(`Page '${pageIdKey}' is already selected for app '${appIdKey}'`);
        return;
      }

      // go through the steps that the Desktop Safari system
      // goes through to initialize the Web Inspector session

      const sendOpts = {
        appIdKey,
        pageIdKey,
      };

      const timeoutMs = Math.trunc(this._targetCreationTimeoutMs * 1.2);
      const timer = new timing.Timer().start();

      const setupWebview = async () => {
        // highlight and then un-highlight the webview
        for (const enabled of [true, false]) {
          await this.send('indicateWebView', Object.assign({
            enabled,
          }, sendOpts), false);
        }
        await this.send('setSenderKey', sendOpts);
      };
      await B.resolve(setupWebview())
        .timeout(timeoutMs, `Cannot set up page '${pageIdKey}' for app '${appIdKey}' within ${timeoutMs}ms`);

      const msLeft = Math.max(timeoutMs - Math.trunc(timer.getDuration().asMilliSeconds), 1000);
      log.debug(
        `Waiting up to ${msLeft}ms for page '${pageIdKey}' of app '${appIdKey}' to be selected`
      );
      await new Promise<void>((resolve) => {
        const onPageInitialized = (
          notifiedAppIdKey: AppIdKey,
          notifiedPageIdKey: PageIdKey
        ) => {
          const timeoutHandler = setTimeout(() => {
            this._pageSelectionMonitor.off(ON_PAGE_INITIALIZED_EVENT, onPageInitialized);
            log.warn(
              `Page '${pageIdKey}' for app '${appIdKey}' has not been selected ` +
              `within ${timer.getDuration().asMilliSeconds}ms. Continuing anyway`
            );
            resolve();
          }, msLeft);

          if (notifiedAppIdKey === appIdKey && notifiedPageIdKey === pageIdKey) {
            clearTimeout(timeoutHandler);
            this._pageSelectionMonitor.off(ON_PAGE_INITIALIZED_EVENT, onPageInitialized);
            log.debug(
              `Selected the page ${pageIdKey}@${appIdKey} after ${timer.getDuration().asMilliSeconds}ms`
            );
            resolve();
          } else {
            log.debug(
              `Got notified that page ${notifiedPageIdKey}@${notifiedAppIdKey} is initialized, ` +
              `but we are waiting for ${pageIdKey}@${appIdKey}. Continuing to wait`
            );
          }
        };

        this._pageSelectionMonitor.on(ON_PAGE_INITIALIZED_EVENT, onPageInitialized);
      });
    });
  }

  /**
   * Initializes a page by enabling various Web Inspector domains.
   * Can perform either simple or full initialization based on configuration.
   * Mimics the steps that Desktop Safari Develop tools uses to initialize
   * a Web Inspector session.
   *
   * @param appIdKey - The application identifier key.
   * @param pageIdKey - The page identifier key.
   * @param targetId - Optional target ID. If not provided, will be retrieved from the targets map.
   * @returns A promise that resolves to true if initialization succeeded, false otherwise.
   */
  private async _initializePage(
    appIdKey: AppIdKey,
    pageIdKey: PageIdKey,
    targetId?: TargetId
  ): Promise<boolean> {
    const sendOpts: RemoteCommandOpts = {
      appIdKey,
      pageIdKey,
      targetId,
    };

    log.debug(`Initializing page '${pageIdKey}' for app '${appIdKey}'`);
    const timer = new timing.Timer().start();
    if (!this.fullPageInitialization) {
      // The sequence of domains is important
      for (const domain of [
        'Inspector.enable',
        'Page.enable',
        'Runtime.enable',

        'Network.enable',
        'Heap.enable',
        'Debugger.enable',
        'Console.enable',

        'Inspector.initialized',
      ]) {
        try {
          await this.send(domain, sendOpts);
        } catch (err: any) {
          log.info(`Cannot enable domain '${domain}' during initialization: ${err.message}`);
          if (MISSING_TARGET_ERROR_PATTERN.test(err.message)) {
            return false;
          }
        }
      }
      log.debug(
        `Simple initialization of page '${pageIdKey}' for app '${appIdKey}' completed ` +
        `in ${timer.getDuration().asMilliSeconds}ms`
      );
      return true;
    }

    // The sequence of commands here is important
    const domainsToOptsMap: Record<string, RemoteCommandOpts> = {
      'Inspector.enable': sendOpts,
      'Page.enable': sendOpts,
      'Runtime.enable': sendOpts,

      'Page.getResourceTree': sendOpts,
      'Network.enable': sendOpts,
      'Network.setResourceCachingDisabled': {
        disabled: false,
        ...sendOpts,
      },
      'DOMStorage.enable': sendOpts,
      'Database.enable': sendOpts,
      'IndexedDB.enable': sendOpts,
      'CSS.enable': sendOpts,
      'Heap.enable': sendOpts,
      'Memory.enable': sendOpts,
      'ApplicationCache.enable': sendOpts,
      'ApplicationCache.getFramesWithManifests': sendOpts,
      'Timeline.setInstruments': {
        instruments: ['Timeline', 'ScriptProfiler', 'CPU'],
        ...sendOpts,
      },
      'Timeline.setAutoCaptureEnabled': {
        enabled: false,
        ...sendOpts,
      },
      'Debugger.enable': sendOpts,
      'Debugger.setBreakpointsActive': {
        active: true,
        ...sendOpts,
      },
      'Debugger.setPauseOnExceptions': {
        state: 'none',
        ...sendOpts,
      },
      'Debugger.setPauseOnAssertions': {
        enabled: false,
        ...sendOpts,
      },
      'Debugger.setAsyncStackTraceDepth': {
        depth: 200,
        ...sendOpts,
      },
      'Debugger.setPauseForInternalScripts': {
        shouldPause: false,
        ...sendOpts,
      },
      'LayerTree.enable': sendOpts,
      'Worker.enable': sendOpts,
      'Canvas.enable': sendOpts,
      'Console.enable': sendOpts,
      'DOM.getDocument': sendOpts,
      'Console.getLoggingChannels': sendOpts,

      'Inspector.initialized': sendOpts,
    };

    for (const [domain, opts] of Object.entries(domainsToOptsMap)) {
      try {
        const res = await this.send(domain, opts);
        if (domain === 'Console.getLoggingChannels') {
          for (const source of (res?.channels || []).map((entry: { source: any }) => entry.source)) {
            try {
              await this.send('Console.setLoggingChannelLevel', Object.assign({
                source,
                level: 'verbose',
              }, sendOpts));
            } catch (err: any) {
              log.info(`Cannot set logging channel level for '${source}': ${err.message}`);
              if (MISSING_TARGET_ERROR_PATTERN.test(err.message)) {
                return false;
              }
            }
          }
        }
      } catch (err: any) {
        log.info(`Cannot enable domain '${domain}' during full initialization: ${err.message}`);
        if (MISSING_TARGET_ERROR_PATTERN.test(err.message)) {
          return false;
        }
      }
    }
    log.debug(
      `Full initialization of page '${pageIdKey}' for app '${appIdKey}' completed ` +
      `in ${timer.getDuration().asMilliSeconds}ms`
    );
    return true;
  }

  /**
   * Connects to a specific application and returns its page dictionary.
   *
   * @param appIdKey - The application identifier key to connect to.
   * @returns A promise that resolves to a tuple containing the connected app ID key
   *          and the page dictionary.
   * @throws Error if a new application connects during the process or if the page
   *               dictionary is empty.
   */
  async selectApp(appIdKey: AppIdKey): Promise<[string, StringRecord]> {
    return await new B<[string, StringRecord]>((resolve, reject) => {
      // local callback, temporarily added as callback to
      // `_rpc_applicationConnected:` remote debugger response
      // to handle the initial connection
      const onAppChange = (err: Error | null, dict: StringRecord) => {
        if (err) {
          return reject(err);
        }
        // from the dictionary returned, get the ids
        const oldAppIdKey = dict.WIRHostApplicationIdentifierKey;
        const correctAppIdKey = dict.WIRApplicationIdentifierKey;

        // if this is a report of a proxy redirect from the remote debugger
        // we want to update our dictionary and get a new app id
        if (oldAppIdKey && correctAppIdKey !== oldAppIdKey) {
          log.debug(`We were notified we might have connected to the wrong app. ` +
                    `Using id ${correctAppIdKey} instead of ${oldAppIdKey}`);
        }

        reject(new Error(NEW_APP_CONNECTED_ERROR));
      };
      this.messageHandler.prependOnceListener('_rpc_applicationConnected:', onAppChange);

      // do the actual connecting to the app
      (async () => {
        try {
          const [connectedAppIdKey, pageDict] = await this.send('connectToApp', {appIdKey});
          // sometimes the connect logic happens, but with an empty dictionary
          // which leads to the remote debugger getting disconnected, and into a loop
          if (_.isEmpty(pageDict)) {
            reject(new Error(EMPTY_PAGE_DICTIONARY_ERROR));
          } else {
            resolve([connectedAppIdKey, pageDict]);
          }
        } catch (err: any) {
          log.warn(`Unable to connect to the app: ${err.message}`);
          reject(err);
        } finally {
          this.messageHandler.off('_rpc_applicationConnected:', onAppChange);
        }
      })();
    });
  }

  /**
   * Handles execution context creation events by storing the context ID.
   *
   * @param err - Error if one occurred, undefined otherwise.
   * @param context - The execution context information.
   */
  onExecutionContextCreated(err: Error | undefined, context: { id: number }): void {
    // { id: 2, isPageContext: true, name: '', frameId: '0.1' }
    // right now we have no way to map contexts to apps/pages
    // so just store
    this.contexts.push(context.id);
  }

  /**
   * Handles garbage collection events by logging them.
   * Garbage collection can affect operation timing.
   */
  onGarbageCollected(): void {
    // just want to log that this is happening, as it can affect operation
    log.debug(`Web Inspector garbage collected`);
  }

  /**
   * Handles script parsing events by logging script information.
   *
   * @param err - Error if one occurred, undefined otherwise.
   * @param scriptInfo - Information about the parsed script.
   */
  onScriptParsed(err: Error | undefined, scriptInfo: StringRecord): void {
    // { scriptId: '13', url: '', startLine: 0, startColumn: 0, endLine: 82, endColumn: 3 }
    log.debug(`Script parsed: ${JSON.stringify(scriptInfo)}`);
  }

  /**
   * Resumes a paused target.
   *
   * @param appIdKey - The application identifier key.
   * @param pageIdKey - The page identifier key.
   * @param targetId - The target ID to resume.
   */
  private async _resumeTarget(appIdKey: AppIdKey, pageIdKey: PageIdKey, targetId: TargetId): Promise<void> {
    try {
      await this.send('Target.resume', {
        appIdKey,
        pageIdKey,
        targetId,
      });
      log.debug(`Successfully resumed the target ${targetId}@${appIdKey}`);
    } catch (e: any) {
      log.warn(`Could not resume the target ${targetId}@${appIdKey}: ${e.message}`);
    }
  }

  /**
   * Waits for a page to be ready by periodically checking the document readyState.
   * Uses the provided readiness detector to determine when the page is ready.
   *
   * @param appIdKey - The application identifier key.
   * @param pageIdKey - The page identifier key.
   * @param targetId - The target ID.
   * @param pageReadinessDetector - The detector for determining page readiness.
   */
  private async _waitForPageReadiness(
    appIdKey: AppIdKey,
    pageIdKey: PageIdKey,
    targetId: TargetId,
    pageReadinessDetector?: PageReadinessDetector
  ): Promise<void> {
    if (!pageReadinessDetector) {
      return;
    }

    log.debug(`Waiting up to ${pageReadinessDetector.timeoutMs}ms for page readiness`);
    const timer = new timing.Timer().start();
    while (pageReadinessDetector.timeoutMs - timer.getDuration().asMilliSeconds > 0) {
      let readyState: string;
      try {
        const commandTimeoutMs = Math.max(
          100,
          Math.trunc((pageReadinessDetector.timeoutMs - timer.getDuration().asMilliSeconds) * 0.8)
        );
        const rawResult = await B.resolve(this.send('Runtime.evaluate', {
          expression: 'document.readyState;',
          returnByValue: true,
          appIdKey,
          pageIdKey,
          targetId,
        })).timeout(commandTimeoutMs);
        readyState = convertJavascriptEvaluationResult(rawResult);
      } catch (e: any) {
        log.debug(`Cannot determine page readiness: ${e.message}`);
        continue;
      }
      if (pageReadinessDetector.readinessDetector(readyState)) {
        log.info(
          `Page '${pageIdKey}' for app '${appIdKey}' is ready after ` +
          `${timer.getDuration().asMilliSeconds}ms`
        );
        return;
      }
      await B.delay(100);
    }
    log.warn(
      `Page '${pageIdKey}' for app '${appIdKey}' is not ready after ` +
      `${timer.getDuration().asMilliSeconds}ms. Continuing anyway`
    );
  }

  /**
   * Waits for a page to be initialized by acquiring locks on both the page
   * target lock and the page selection lock.
   *
   * @param appIdKey - The application identifier key.
   * @param pageIdKey - The page identifier key.
   * @throws Error if no targets are found for the application.
   */
  async waitForPage(appIdKey: AppIdKey, pageIdKey: PageIdKey): Promise<void> {
    const appTargetsMap = this.targets[appIdKey];
    if (!appTargetsMap) {
      throw new Error(`No targets found for app '${appIdKey}'`);
    }
    const lock = appTargetsMap.lock;
    const timer = new timing.Timer().start();
    await Promise.all([
      lock.acquire(pageIdKey, async () => await B.delay(0)),
      this._pageSelectionLock.acquire(toPageSelectionKey(appIdKey, pageIdKey), async () => await B.delay(0))
    ]);
    const durationMs = timer.getDuration().asMilliSeconds;
    if (durationMs > 10) {
      log.debug(`Waited ${durationMs}ms until the page ${pageIdKey}@${appIdKey} is initialized`);
    }
  }

  /**
   * Gets the pending target details if there is a pending request for the given app.
   * Filters out non-page target types (e.g., 'frame').
   *
   * @param appId - The application identifier key.
   * @param targetInfo - Information about the target.
   * @returns The pending page target details if there's a match, undefined otherwise.
   */
  private _getPendingPageTargetDetails(
    appId: AppIdKey,
    targetInfo: TargetInfo
  ): PendingPageTargetDetails | undefined {
    const logInfo = (message: string): undefined =>
      void log.info(
        `Skipping 'Target.targetCreated' event ${message} for app '${appId}': ${JSON.stringify(targetInfo)}`
      );
    if (!this._pendingTargetNotification) {
      return logInfo('with no pending request');
    }
    if (targetInfo.type !== 'page') {
      // TODO: We'll need to handle 'frame' type for several domains.
      // Target, Runtime, Debugger and Console should ignore this target for now.
      // https://github.com/WebKit/WebKit/commit/06f8ad1a5a66f9ffaa33696a5b9fba4f4c65070b#diff-42db8526b5e72dc714b9561e283ef57fbbc3000576a36839ad03df52b5e54667
      // https://github.com/appium/appium/issues/21705
      return logInfo(`with type '${targetInfo.type}'`);
    }

    return this._pendingTargetNotification.appIdKey === appId
      ? {...this._pendingTargetNotification}
      : logInfo('with different app id');
  }
}

/**
 * Creates a unique key for page selection based on app and page IDs.
 *
 * @param appIdKey - The application identifier key.
 * @param pageIdKey - The page identifier key.
 * @returns A string key combining both identifiers.
 */
function toPageSelectionKey(appIdKey: AppIdKey, pageIdKey: PageIdKey): string {
  return `${appIdKey}:${pageIdKey}`;
}
