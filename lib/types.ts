import type { StringRecord, AppiumLogger } from '@appium/types';
import type B from 'bluebird';

export interface DeferredPromise {
  promise: B<any>;
  resolve: (...args: any[]) => void;
  reject: (err?: Error) => void;
}

export interface AppInfo {
  id: string;
  isProxy: boolean;
  name: string;
  bundleId: string;
  hostId?: string;
  isActive: boolean;
  isAutomationEnabled: boolean | string;
  pageArray?: Page[];
}

export interface AppPage {
  appIdKey: AppIdKey;
  pageDict: Page;
}

export interface App {
  id: string;
  bundleId: string;
}

export interface Page {
  url: string;
  title: string;
  id: number | string;
  isKey: boolean;
  bundleId?: string;
}

export type AppDict = StringRecord<AppInfo>;

export type EventListener = (error?: Error, event?: StringRecord) => any;

export interface RemoteDebuggerOptions {
  /** id of the app being connected to */
  bundleId?: string;
  /** array of possible bundle ids that the inspector could return */
  additionalBundleIds?: string[];
  /** version of iOS */
  platformVersion?: string;
  isSafari?: boolean;
  includeSafari?: boolean;
  /** @deprecated - deprecated for removal, not used anywhere */
  useNewSafari?: boolean;
  /** the time, in ms, that should be waited for page loading */
  pageLoadMs?: number;
  /** the remote debugger's host address */
  host?: string;
  /** the remote debugger port through which to communicate */
  port?: number;
  socketPath?: string;
  pageReadyTimeout?: number;
  remoteDebugProxy?: string;
  garbageCollectOnExecute?: boolean;
  logFullResponse?: boolean;
  /** log plists sent and received from Web Inspector */
  logAllCommunication?: boolean;
  /** log communication from Web Inspector as hex dump */
  logAllCommunicationHexDump?: boolean;
  /** The maximum size in bytes of a single data frame in the device communication protocol */
  webInspectorMaxFrameLength?: number;
  /** size, in bytes, of chunks of data sent to Web Inspector (real device only) */
  socketChunkSize?: number;
  fullPageInitialization?: boolean;
  pageLoadStrategy?: string;
  log?: AppiumLogger;
}

interface RemoteDebuggerRealDeviceSpecificOptions {
  udid: string;
}

export type RemoteDebuggerRealDeviceOptions = RemoteDebuggerRealDeviceSpecificOptions & RemoteDebuggerOptions;

export type AppIdKey = string | number;
export type PageIdKey = string | number;
export type TargetId = string;

export interface RemoteCommandOpts {
  appIdKey?: AppIdKey;
  pageIdKey?: PageIdKey;
  id?: string;
  connId?: string;
  senderId?: string;
  targetId?: TargetId;
  bundleId?: string;
  enabled?: boolean;
  [key: string]: any;
}

export interface ProtocolCommandOpts {
  id: string;
  method: string;
  params: StringRecord;
}

type SocketDataKey = Buffer | StringRecord;

interface RemoteCommandArgument<T extends SocketDataKey> {
  WIRSocketDataKey?: T;
  WIRConnectionIdentifierKey?: string;
  WIRSenderKey?: string;
  WIRApplicationIdentifierKey?: AppIdKey;
  WIRPageIdentifierKey?: PageIdKey;
  WIRMessageDataTypeKey?: string;
  WIRDestinationKey?: string;
  WIRMessageDataKey?: string;
  [key: string]: any;
}

interface RemoteCommandTemplated<T extends SocketDataKey> {
  __argument: RemoteCommandArgument<T>;
  __selector: string;
}

export type RawRemoteCommand = RemoteCommandTemplated<StringRecord>;
export type RemoteCommand = RemoteCommandTemplated<Buffer>;

export interface TargetInfo {
  targetId: string;
  type: 'page' | 'service-worker' | 'worker';
  isProvisional: boolean;
  isPaused: boolean;
}

export interface ProvisionalTargetInfo {
  oldTargetId: string;
  newTargetId: string;
}
