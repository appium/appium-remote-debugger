/* eslint-disable dot-notation */
import type {StringRecord} from '@appium/types';
import type {RemoteDebugger} from '../remote-debugger';
import type {EventListener} from '../types';

/** Gets the current app dictionary snapshot reference. */
export function getAppDict(instance: RemoteDebugger): (typeof instance)['_appDict'] {
  return instance['_appDict'];
}

/** Gets the currently selected application id key. */
export function getAppIdKey(instance: RemoteDebugger): (typeof instance)['_appIdKey'] {
  return instance['_appIdKey'];
}

/** Sets the currently selected application id key. */
export function setAppIdKey(instance: RemoteDebugger, value: (typeof instance)['_appIdKey']): void {
  instance['_appIdKey'] = value;
}

/** Gets the current RPC client instance. */
export function getRcpClient(instance: RemoteDebugger): (typeof instance)['_rpcClient'] {
  return instance['_rpcClient'];
}

/** Gets the currently selected page id key. */
export function getPageIdKey(instance: RemoteDebugger): (typeof instance)['_pageIdKey'] {
  return instance['_pageIdKey'];
}

/** Sets the currently selected page id key. */
export function setPageIdKey(
  instance: RemoteDebugger,
  value: (typeof instance)['_pageIdKey'],
): void {
  instance['_pageIdKey'] = value;
}

/** Gets whether Safari automation mode is enabled. */
export function getIsSafari(instance: RemoteDebugger): (typeof instance)['_isSafari'] {
  return instance['_isSafari'];
}

/** Gets whether Safari should be included in app listing. */
export function getIncludeSafari(instance: RemoteDebugger): (typeof instance)['_includeSafari'] {
  return instance['_includeSafari'];
}

/** Gets the configured primary bundle identifier. */
export function getBundleId(instance: RemoteDebugger): (typeof instance)['_bundleId'] {
  return instance['_bundleId'];
}

/** Gets additional bundle identifiers used for matching apps. */
export function getAdditionalBundleIds(
  instance: RemoteDebugger,
): (typeof instance)['_additionalBundleIds'] {
  return instance['_additionalBundleIds'];
}

/** Gets bundle identifiers to be ignored during matching. */
export function getIgnoredBundleIds(
  instance: RemoteDebugger,
): (typeof instance)['_ignoredBundleIds'] {
  return instance['_ignoredBundleIds'];
}

/** Gets the list of apps that were skipped. */
export function getSkippedApps(instance: RemoteDebugger): (typeof instance)['_skippedApps'] {
  return instance['_skippedApps'];
}

/** Gets registered client event listeners grouped by event name. */
export function getClientEventListeners(instance: RemoteDebugger): StringRecord<EventListener[]> {
  return instance['_clientEventListeners'];
}

/** Gets whether page loading is currently in progress. */
export function getPageLoading(instance: RemoteDebugger): boolean {
  return instance['_pageLoading'];
}

/** Sets whether page loading is currently in progress. */
export function setPageLoading(instance: RemoteDebugger, value: boolean): void {
  instance['_pageLoading'] = value;
}

/** Gets whether GC should run after JavaScript execution. */
export function getGarbageCollectOnExecute(
  instance: RemoteDebugger,
): (typeof instance)['_garbageCollectOnExecute'] {
  return instance['_garbageCollectOnExecute'];
}

/** Gets whether a navigation-to-page operation is active. */
export function getNavigatingToPage(
  instance: RemoteDebugger,
): (typeof instance)['_navigatingToPage'] {
  return instance['_navigatingToPage'];
}

/** Sets whether a navigation-to-page operation is active. */
export function setNavigatingToPage(
  instance: RemoteDebugger,
  value: (typeof instance)['_navigatingToPage'],
): void {
  instance['_navigatingToPage'] = value;
}

/** Sets the current state string reported by the remote debugger. */
export function setCurrentState(
  instance: RemoteDebugger,
  value: (typeof instance)['_currentState'],
): void {
  instance['_currentState'] = value;
}

/** Sets the currently connected driver list. */
export function setConnectedDrivers(
  instance: RemoteDebugger,
  value: (typeof instance)['_connectedDrivers'],
): void {
  instance['_connectedDrivers'] = value;
}

/** Gets the cancellable page-load delay promise. */
export function getPageLoadDelay(instance: RemoteDebugger): (typeof instance)['_pageLoadDelay'] {
  return instance['_pageLoadDelay'];
}

/** Sets the cancellable page-load delay promise. */
export function setPageLoadDelay(
  instance: RemoteDebugger,
  value: (typeof instance)['_pageLoadDelay'],
): void {
  instance['_pageLoadDelay'] = value;
}

/** Gets the configured page load strategy. */
export function getPageLoadStartegy(
  instance: RemoteDebugger,
): (typeof instance)['_pageLoadStrategy'] {
  return instance['_pageLoadStrategy'];
}

/** Gets the configured page readiness timeout in milliseconds. */
export function getPageReadyTimeout(
  instance: RemoteDebugger,
): (typeof instance)['_pageReadyTimeout'] {
  return instance['_pageReadyTimeout'];
}
