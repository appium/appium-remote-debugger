import { checkParams } from '../utils';
import B from 'bluebird';

const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const GARBAGE_COLLECT_TIMEOUT_MS = 5000;

/**
 * @this {RemoteDebugger}
 * @returns {Promise<void>}
 */
export async function launchSafari () {
  await this.requireRpcClient().send('launchApplication', {
    bundleId: SAFARI_BUNDLE_ID
  });
}

/**
 * @this {RemoteDebugger}
 * @param {import('../types').EventListener} fn
 * @returns {Promise<any>}
 */
export async function startTimeline (fn) {
  this.log.debug('Starting to record the timeline');
  this.requireRpcClient().on('Timeline.eventRecorded', fn);
  return await this.requireRpcClient().send('Timeline.start', {
    appIdKey: this._appIdKey,
    pageIdKey: this._pageIdKey,
  });
}

/**
 * @this {RemoteDebugger}
 * @returns {Promise<any>}
 */
export async function stopTimeline () {
  this.log.debug('Stopping to record the timeline');
  await this.requireRpcClient().send('Timeline.stop', {
    appIdKey: this._appIdKey,
    pageIdKey: this._pageIdKey,
  });
}

// Potentially this does not work for mobile safari
/**
 * @this {RemoteDebugger}
 * @param {string} value
 * @returns {Promise<any>}
 */
export async function overrideUserAgent (value) {
  this.log.debug('Setting overrideUserAgent');
  return await this.requireRpcClient().send('Page.overrideUserAgent', {
    appIdKey: this._appIdKey,
    pageIdKey: this._pageIdKey,
    value
  });
}

/**
 * @this {RemoteDebugger}
 * @param {number} [timeoutMs=GARBAGE_COLLECT_TIMEOUT_MS]
 * @returns {Promise<void>}
 */
export async function garbageCollect (timeoutMs = GARBAGE_COLLECT_TIMEOUT_MS) {
  this.log.debug(`Garbage collecting with ${timeoutMs}ms timeout`);

  try {
    checkParams({appIdKey: this._appIdKey, pageIdKey: this._pageIdKey});
  } catch (err) {
    this.log.debug(`Unable to collect garbage at this time`);
    return;
  }

  try {
    await B.resolve(this.requireRpcClient().send(
      'Heap.gc', {
        appIdKey: this._appIdKey,
        pageIdKey: this._pageIdKey,
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

/**
 * @typedef {Object} HasMiscRelatedProperties
 * @property {string | null | undefined} _appIdKey
 * @property {string | number | null | undefined} _pageIdKey
 */

/**
 * @typedef {import('../remote-debugger').RemoteDebugger & HasMiscRelatedProperties} RemoteDebugger
 */
