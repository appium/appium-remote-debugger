import { checkParams } from '../utils';
import B from 'bluebird';

const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const GARBAGE_COLLECT_TIMEOUT_MS = 5000;

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {Promise<void>}
 */
export async function launchSafari () {
  await this.requireRpcClient().send('launchApplication', {
    bundleId: SAFARI_BUNDLE_ID
  });
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {(event: import('@appium/types').StringRecord) => any} fn
 * @returns {Promise<any>}
 */
export async function startTimeline (fn) {
  this.log.debug('Starting to record the timeline');
  this.requireRpcClient().on('Timeline.eventRecorded', fn);
  return await this.requireRpcClient().send('Timeline.start', {
    appIdKey: this.appIdKey,
    pageIdKey: this.pageIdKey,
  });
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {Promise<any>}
 */
export async function stopTimeline () {
  this.log.debug('Stopping to record the timeline');
  await this.requireRpcClient().send('Timeline.stop', {
    appIdKey: this.appIdKey,
    pageIdKey: this.pageIdKey,
  });
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {(event: import('@appium/types').StringRecord) => any} listener
 * @returns {void}
 */
export function startConsole (listener) {
  this.log.debug('Starting to listen for JavaScript console');
  this.addClientEventListener('Console.messageAdded', listener);
  this.addClientEventListener('Console.messageRepeatCountUpdated', listener);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {void}
 */
export function stopConsole () {
  this.log.debug('Stopping to listen for JavaScript console');
  this.removeClientEventListener('Console.messageAdded');
  this.removeClientEventListener('Console.messageRepeatCountUpdated');
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {(event: import('@appium/types').StringRecord) => any} listener
 * @returns {void}
 */
export function startNetwork (listener) {
  this.log.debug('Starting to listen for network events');
  this.addClientEventListener('NetworkEvent', listener);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {void}
 */
export function stopNetwork () {
  this.log.debug('Stopping to listen for network events');
  this.removeClientEventListener('NetworkEvent');
}

// Potentially this does not work for mobile safari
/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string} value
 * @returns {Promise<any>}
 */
export async function overrideUserAgent (value) {
  this.log.debug('Setting overrideUserAgent');
  return await this.requireRpcClient().send('Page.overrideUserAgent', {
    appIdKey: this.appIdKey,
    pageIdKey: this.pageIdKey,
    value
  });
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {number} [timeoutMs=GARBAGE_COLLECT_TIMEOUT_MS]
 * @returns {Promise<void>}
 */
export async function garbageCollect (timeoutMs = GARBAGE_COLLECT_TIMEOUT_MS) {
  this.log.debug(`Garbage collecting with ${timeoutMs}ms timeout`);

  try {
    checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});
  } catch (err) {
    this.log.debug(`Unable to collect garbage at this time`);
    return;
  }

  try {
    await B.resolve(this.requireRpcClient().send(
      'Heap.gc', {
        appIdKey: this.appIdKey,
        pageIdKey: this.pageIdKey,
      })
    ).timeout(timeoutMs);
    this.log.debug(`Garbage collection successful`);
  } catch (e) {
    if (e instanceof B.TimeoutError) {
      this.log.debug(`Garbage collection timed out after ${timeoutMs}ms`);
    } else {
      this.log.debug(`Unable to collect garbage: ${e.message}`);
    }
  }
}
