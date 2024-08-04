/* eslint-disable dot-notation */
import type { StringRecord } from '@appium/types';
import type { RemoteDebugger } from '../remote-debugger';
import type { EventListener } from '../types';

export function getAppDict(instance: RemoteDebugger): typeof instance['_appDict'] {
  return instance['_appDict'];
}

export function getAppIdKey(instance: RemoteDebugger): typeof instance['_appIdKey'] {
  return instance['_appIdKey'];
}

export function setAppIdKey(instance: RemoteDebugger, value: typeof instance['_appIdKey']): void {
  instance['_appIdKey'] = value;
}

export function getRcpClient(instance: RemoteDebugger): typeof instance['_rpcClient'] {
  return instance['_rpcClient'];
}

export function getPageIdKey(instance: RemoteDebugger): typeof instance['_pageIdKey'] {
  return instance['_pageIdKey'];
}

export function setPageIdKey(instance: RemoteDebugger, value: typeof instance['_pageIdKey']): void {
  instance['_pageIdKey'] = value;
}

export function getIsSafari(instance: RemoteDebugger): typeof instance['_isSafari'] {
  return instance['_isSafari'];
}

export function getIncludeSafari(instance: RemoteDebugger): typeof instance['_includeSafari'] {
  return instance['_includeSafari'];
}

export function getBundleId(instance: RemoteDebugger): typeof instance['_bundleId'] {
  return instance['_bundleId'];
}

export function getAdditionalBundleIds(instance: RemoteDebugger): typeof instance['_additionalBundleIds'] {
  return instance['_additionalBundleIds'];
}

export function getSkippedApps(instance: RemoteDebugger): typeof instance['_skippedApps'] {
  return instance['_skippedApps'];
}

export function getClientEventListeners(instance: RemoteDebugger): StringRecord<EventListener[]> {
  return instance['_clientEventListeners'];
}

export function getPageLoading(instance: RemoteDebugger): boolean {
  return instance['_pageLoading'];
}

export function setPageLoading(instance: RemoteDebugger, value: boolean): void {
  instance['_pageLoading'] = value;
}

export function getGarbageCollectOnExecute(instance: RemoteDebugger): typeof instance['_garbageCollectOnExecute'] {
  return instance['_garbageCollectOnExecute'];
}

export function getNavigatingToPage(instance: RemoteDebugger): typeof instance['_navigatingToPage'] {
  return instance['_navigatingToPage'];
}

export function setNavigatingToPage(instance: RemoteDebugger, value: typeof instance['_navigatingToPage']): void {
  instance['_navigatingToPage'] = value;
}

export function setCurrentState(instance: RemoteDebugger, value: typeof instance['_currentState']): void {
  instance['_currentState'] = value;
}

export function setConnectedDrivers(instance: RemoteDebugger, value: typeof instance['_connectedDrivers']): void {
  instance['_connectedDrivers'] = value;
}

export function getPageLoadDelay(instance: RemoteDebugger): typeof instance['_pageLoadDelay'] {
  return instance['_pageLoadDelay'];
}

export function setPageLoadDelay(instance: RemoteDebugger, value: typeof instance['_pageLoadDelay']): void {
  instance['_pageLoadDelay'] = value;
}

export function getPageLoadStartegy(instance: RemoteDebugger): typeof instance['_pageLoadStrategy'] {
  return instance['_pageLoadStrategy'];
}

export function getPageReadyTimeout(instance: RemoteDebugger): typeof instance['_pageReadyTimeout'] {
  return instance['_pageReadyTimeout'];
}
