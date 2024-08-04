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
  appIdKey: string;
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

export type EventListener = (event: StringRecord) => any;

export interface RemoteDebuggerOptions {
  /** id of the app being connected to */
  bundleId?: string;
  /** array of possible bundle ids that the inspector could return */
  additionalBundleIds?: string[];
  /** version of iOS */
  platformVersion?: string;
  isSafari?: boolean;
  includeSafari?: boolean;
  /** for web inspector, whether this is a new Safari instance */
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
