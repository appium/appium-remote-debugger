import {
  getAppIdKey,
  getPageIdKey,
} from './property-accessors';

/**
 * Capture a rect of the page or by default the viewport
 * @this {RemoteDebugger}
 * @param {ScreenshotCaptureOptions} [opts={}]  if rect is null capture the whole
 * coordinate system else capture the rect in the given coordinateSystem
 * @returns {Promise<string>} a base64 encoded string of the screenshot
 */
export async function captureScreenshot(opts = {}) {
  const {rect = null, coordinateSystem = 'Viewport'} = opts;
  this.log.debug('Capturing screenshot');

  const arect = rect ?? /** @type {import('@appium/types').Rect} */ (await this.executeAtom(
    'execute_script',
    ['return {x: 0, y: 0, width: window.innerWidth, height: window.innerHeight}', []]
  ));
  const response = await this.requireRpcClient().send('Page.snapshotRect', {
    ...arect,
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
    coordinateSystem,
  });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.dataURL.replace(/^data:image\/png;base64,/, '');
}

/**
 * @typedef {Object} ScreenshotCaptureOptions
 * @property {import('@appium/types').Rect | null} [rect=null]
 * @property {"Viewport" | "Page"} [coordinateSystem="Viewport"]
 */

/**
 * @typedef {import('../remote-debugger').RemoteDebugger} RemoteDebugger
 */
