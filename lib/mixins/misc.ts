import { checkParams } from '../utils';
import B, { TimeoutError as BTimeoutError } from 'bluebird';
import {
  getAppIdKey,
  getPageIdKey,
} from './property-accessors';
import type { RemoteDebugger } from '../remote-debugger';

const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const GARBAGE_COLLECT_TIMEOUT_MS = 5000;

/**
 * Launches Safari application on the device by sending a launch command
 * to the remote debugger.
 */
export async function launchSafari(this: RemoteDebugger): Promise<void> {
  await this.requireRpcClient().send('launchApplication', {
    bundleId: SAFARI_BUNDLE_ID
  });
}

/**
 * Starts recording the timeline by registering an event listener and
 * sending the Timeline.start command to the remote debugger.
 *
 * @param fn - Event listener function that will be called when timeline events are recorded.
 * @returns A promise that resolves when the timeline recording has started.
 */
export async function startTimeline(
  this: RemoteDebugger,
  fn: import('../types').EventListener
): Promise<any> {
  this.log.debug('Starting to record the timeline');
  this.requireRpcClient().on('Timeline.eventRecorded', fn);
  return await this.requireRpcClient().send('Timeline.start', {
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
  });
}

/**
 * Stops recording the timeline by sending the Timeline.stop command
 * to the remote debugger.
 */
export async function stopTimeline(this: RemoteDebugger): Promise<any> {
  this.log.debug('Stopping to record the timeline');
  await this.requireRpcClient().send('Timeline.stop', {
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
  });
}

/**
 * Overrides the user agent string for the current page.
 * Note: This may not work for mobile Safari.
 *
 * @param value - The user agent string to set.
 * @returns A promise that resolves when the user agent has been overridden.
 */
export async function overrideUserAgent(this: RemoteDebugger, value: string): Promise<any> {
  this.log.debug('Setting overrideUserAgent');
  return await this.requireRpcClient().send('Page.overrideUserAgent', {
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
    value,
  });
}

/**
 * Checks whether JavaScript execution is currently blocked on the page
 * by attempting to execute a simple JavaScript command with a timeout.
 *
 * @param timeoutMs - The maximum amount of milliseconds to wait for a JavaScript
 *                    command response. Defaults to 1000ms.
 * @returns A promise that resolves to true if JavaScript execution is blocked,
 *          false if it is not blocked.
 */
export async function isJavascriptExecutionBlocked(
  this: RemoteDebugger,
  timeoutMs: number = 1000
): Promise<boolean> {
  try {
    await B.resolve(
      this.requireRpcClient().send('Runtime.evaluate', {
        expression: '1+1;',
        returnByValue: true,
        appIdKey: getAppIdKey(this),
        pageIdKey: getPageIdKey(this),
      })
    ).timeout(timeoutMs);
    return false;
  } catch {
    return true;
  }
}

/**
 * Triggers garbage collection on the page's JavaScript heap.
 * This method will gracefully handle cases where garbage collection cannot
 * be performed (e.g., when not connected to a page).
 *
 * @param timeoutMs - Maximum time in milliseconds to wait for garbage collection
 *                    to complete. Defaults to GARBAGE_COLLECT_TIMEOUT_MS (5000ms).
 */
export async function garbageCollect(
  this: RemoteDebugger,
  timeoutMs: number = GARBAGE_COLLECT_TIMEOUT_MS
): Promise<void> {
  this.log.debug(`Garbage collecting with ${timeoutMs}ms timeout`);

  try {
    checkParams({
      appIdKey: getAppIdKey(this),
      pageIdKey: getPageIdKey(this),
    });
  } catch {
    this.log.debug(`Unable to collect garbage at this time`);
    return;
  }

  try {
    await B.resolve(this.requireRpcClient().send(
      'Heap.gc', {
        appIdKey: getAppIdKey(this),
        pageIdKey: getPageIdKey(this),
      })
    ).timeout(timeoutMs);
    this.log.debug(`Garbage collection successful`);
  } catch (e: any) {
    if (e instanceof BTimeoutError) {
      this.log.debug(`Garbage collection timed out after ${timeoutMs}ms`);
    } else {
      this.log.debug(`Unable to collect garbage: ${e.message}`);
    }
  }
}
