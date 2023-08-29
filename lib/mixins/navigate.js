import log from '../logger';
import { checkParams } from '../utils';
import events from './events';
import { timing, util } from '@appium/support';
import _ from 'lodash';
import B from 'bluebird';


/**
 * @typedef {(() => Promise<any>|void)|undefined} TPageLoadVerifyHook
 */

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {void}
 */
function frameDetached () {
  this.emit(events.EVENT_FRAMES_DETACHED);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {timing.Timer?} startPageLoadTimer
 * @param {TPageLoadVerifyHook} [pageLoadVerifyHook]
 * @returns {Promise<void>}
 */
async function pageLoad (startPageLoadTimer, pageLoadVerifyHook = _.noop) {
  const timeoutMs = 500;
  if (!_.isFunction(startPageLoadTimer?.getDuration)) {
    log.debug(`Page load timer not a timer. Creating new timer`);
    startPageLoadTimer = new timing.Timer().start();
  }

  log.debug('Page loaded, verifying whether ready');
  this.pageLoading = true;

  const verify = async () => {
    this.pageLoadDelay = util.cancellableDelay(timeoutMs);
    try {
      await this.pageLoadDelay;
    } catch (err) {
      if (err instanceof B.CancellationError) {
        // if the promise has been cancelled
        // we want to skip checking the readiness
        return;
      }
    }

    // we can get this called in the middle of trying to find a new app
    if (!this.appIdKey) {
      log.debug('Not connected to an application. Ignoring page load');
      return;
    }

    if (_.isFunction(pageLoadVerifyHook)) {
      await pageLoadVerifyHook();
    }

    // if we are ready, or we've spend too much time on this
    // @ts-ignore startPageLoadTimer is defined here
    const elapsedMs = startPageLoadTimer.getDuration().asMilliSeconds;
    if (await this.checkPageIsReady() || (this.pageLoadMs > 0 && elapsedMs > this.pageLoadMs)) {
      log.debug('Page is ready');
      this.pageLoading = false;
    } else {
      log.debug('Page was not ready, retrying');
      await verify();
    }
  };
  try {
    await verify();
  } finally {
    // @ts-ignore startPageLoadTimer is defined here
    log.debug(`Page load completed in ${startPageLoadTimer.getDuration().asMilliSeconds.toFixed(0)}ms`);
    this.pageLoading = false;
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
 * @param {TPageLoadVerifyHook} [pageLoadVerifyHook]
 * @returns {Promise<void>}
 */
async function waitForDom (startPageLoadTimer, pageLoadVerifyHook) {
  log.debug('Waiting for dom...');
  await this.pageLoad(startPageLoadTimer, pageLoadVerifyHook);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {Promise<boolean>}
 */
async function checkPageIsReady () {
  checkParams({appIdKey: this.appIdKey});

  log.debug('Checking document readyState');
  const readyCmd = 'document.readyState;';
  let readyState = 'loading';
  try {
    readyState = await B.resolve(this.execute(readyCmd, true)).timeout(this.pageReadyTimeout);
  } catch (err) {
    if (!(err instanceof B.TimeoutError)) {
      throw err;
    }
    log.debug(`Page readiness check timed out after ${this.pageReadyTimeout}ms`);
    return false;
  }
  log.debug(`Document readyState is '${readyState}'`);

  return readyState === 'complete';
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string} url
 * @param {TPageLoadVerifyHook} [pageLoadVerifyHook]
 * @returns {Promise<void>}
 */
async function navToUrl (url, pageLoadVerifyHook) {
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

    await this.waitForDom(new timing.Timer().start(), pageLoadVerifyHook);

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
