import log from '../logger';
import { checkParams } from '../utils';
import events from './events';
import { timing, util } from '@appium/support';
import _ from 'lodash';
import B from 'bluebird';

const DEFAULT_PAGE_READINESS_TIMEOUT_MS = 1000 * 60; // 1 minute
const PAGE_READINESS_CHECK_INTERVAL_MS = 30;

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {void}
 */
function frameDetached () {
  this.emit(events.EVENT_FRAMES_DETACHED);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {timing.Timer?} [startPageLoadTimer]
 * @returns {Promise<void>}
 */
async function pageLoad (startPageLoadTimer) {
  if (!_.isFunction(startPageLoadTimer?.getDuration)) {
    log.debug(`Page load timer not a timer. Creating new timer`);
    startPageLoadTimer = new timing.Timer().start();
  }

  const readinessTimeoutMs = this.pageLoadMs || DEFAULT_PAGE_READINESS_TIMEOUT_MS;
  log.debug(`Page loaded, waiting up to ${readinessTimeoutMs}ms until it is ready`);
  this.pageLoading = true;
  this.pageLoadDelay = util.cancellableDelay(readinessTimeoutMs);

  /** @type {B} */
  const pageReadinessCancellationListenerPromise = B.resolve((async () => {
    try {
      await this.pageLoadDelay;
    } catch (ign) {
      this.pageLoading = false;
    }
  })());

  /** @type {B} */
  const pageReadinessPromise = B.resolve((async () => {
    while (this.pageLoading) {
      await B.delay(PAGE_READINESS_CHECK_INTERVAL_MS);
      // we can get this called in the middle of trying to find a new app
      if (!this.appIdKey) {
        log.debug('Not connected to an application. Ignoring page readiess check');
        return;
      }
      if (!this.pageLoading) {
        return;
      }

      // if we are ready, or we've spend too much time on this
      // @ts-ignore startPageLoadTimer is defined here
      const elapsedMs = startPageLoadTimer.getDuration().asMilliSeconds;
      const isPageReady = await this.checkPageIsReady();
      if (isPageReady || elapsedMs > readinessTimeoutMs) {
        if (isPageReady) {
          log.debug(`Page is ready in ${elapsedMs}ms`);
        } else {
          log.info(`Timed out after ${readinessTimeoutMs}ms of waiting for the page readiness. Continuing anyway`);
        }
        this.pageLoading = false;
        return;
      }
    }
  })());

  try {
    await B.any([pageReadinessCancellationListenerPromise, pageReadinessPromise]);
    if (pageReadinessPromise.isPending()) {
      await pageReadinessPromise;
    }
    if (pageReadinessCancellationListenerPromise.isPending()) {
      this.pageLoadDelay.cancel();
    }
  } finally {
    this.pageLoading = false;
    this.pageLoadDelay = B.resolve();
  }
}
/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {void}
 */
function cancelPageLoad () {
  log.debug('Unregistering from page readiness notifications');
  this.pageLoading = false;
  if (this.pageLoadDelay) {
    this.pageLoadDelay.cancel();
  }
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {Promise<void>}
 */
async function pageUnload () {
  log.debug('Page unloading');
  await this.waitForDom();
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {timing.Timer|null|undefined} startPageLoadTimer
 * @returns {Promise<void>}
 */
async function waitForDom (startPageLoadTimer) {
  log.debug('Waiting for dom...');
  await this.pageLoad(startPageLoadTimer);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {Promise<boolean>}
 */
async function checkPageIsReady () {
  checkParams({appIdKey: this.appIdKey});

  const readyCmd = 'document.readyState;';
  try {
    return await B.resolve(this.execute(readyCmd, true)).timeout(this.pageReadyTimeout) === 'complete';
  } catch (err) {
    if (!(err instanceof B.TimeoutError)) {
      throw err;
    }
  }
  log.debug(`Page readiness check timed out after ${this.pageReadyTimeout}ms`);
  return false;
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string} url
 * @returns {Promise<void>}
 */
async function navToUrl (url) {
  checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});

  if (!this.rpcClient) {
    throw new Error('rpcClient is undefined. Is the debugger connected?');
  }

  this._navigatingToPage = true;

  try {
    log.debug(`Navigating to new URL: '${url}'`);

    // begin listening for frame navigation event, which will be waited for later
    const waitForFramePromise = this.waitForFrameNavigated();

    await this.rpcClient.send('Page.navigate', {
      url,
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });

    if (!this.useNewSafari) {
      // a small pause for the browser to catch up
      await B.delay(1000);
    }

    // wait until the page has been navigated
    await waitForFramePromise;

    await this.waitForDom(new timing.Timer().start());

    // enable console logging, so we get the events (otherwise we only
    // get notified when navigating to a local page
    await this.rpcClient.send('Console.enable', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });
  } finally {
    this._navigatingToPage = false;
  }
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {Promise<any>}
 */
async function waitForFrameNavigated () {
  let navEventListener;
  return await new B(async (resolve) => {
    log.debug('Waiting for frame navigated message...');
    if (!this.rpcClient) {
      throw new Error('rpcClient is undefined. Is the debugger connected?');
    }
    const start = new timing.Timer().start();

    // add a handler for the `Page.frameNavigated` message
    // from the remote debugger
    navEventListener = (err, value) => {
      log.debug(`Frame navigated in ${start.getDuration().asMilliSeconds.toFixed(0)}ms from: ${value}`);
      if (!this.allowNavigationWithoutReload && !this.pageLoading) {
        resolve(value);
      } else {
        log.debug('Frame navigated but we were warned about it, not ' +
                  'considering page state unloaded');
        this.allowNavigationWithoutReload = false;
      }
      if (this.navigationDelay) {
        this.navigationDelay.cancel();
      }
    };

    this.rpcClient.once('Page.frameNavigated', navEventListener);

    // timeout, in case remote debugger doesn't respond,
    // or takes a long time
    if (!this.useNewSafari || this.pageLoadMs >= 0) {
      // use pageLoadMs, or a small amount of time
      const timeout = this.useNewSafari ? this.pageLoadMs : 500;
      this.navigationDelay = util.cancellableDelay(timeout);
      try {
        await this.navigationDelay;
        navEventListener(null, `${timeout}ms timeout`);
      } catch (err) {
        // nothing to do: we only get here if the remote debugger
        // already notified of frame navigation, and the delay
        // was cancelled
      }
    }
  }).finally(() => {
    if (navEventListener) {
      this.rpcClient?.off('Page.frameNavigated', navEventListener);
    }
  });
}


export default {
  frameDetached, pageLoad, cancelPageLoad, pageUnload, waitForDom, checkPageIsReady, navToUrl, waitForFrameNavigated
};
