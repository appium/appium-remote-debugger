import {
  getAppIdKey,
  getPageIdKey,
} from './property-accessors';
import type { RemoteDebugger } from '../remote-debugger';
import type { Rect } from '@appium/types';

/**
 * Options for capturing a screenshot.
 */
export interface ScreenshotCaptureOptions {
  /** The rectangle to capture. If null, captures the whole viewport. */
  rect?: Rect | null;
  /** The coordinate system to use for the rectangle. */
  coordinateSystem?: 'Viewport' | 'Page';
}

/**
 * Captures a screenshot of a rectangular area of the page or the entire viewport.
 * If no rectangle is provided, captures the full viewport by default.
 *
 * @param opts - Screenshot capture options. If not provided, captures the entire viewport.
 *               - rect: The rectangle to capture. If null, captures the whole viewport.
 *               - coordinateSystem: The coordinate system to use ('Viewport' or 'Page').
 *                                  Defaults to 'Viewport'.
 * @returns A promise that resolves to a base64-encoded string of the screenshot
 *          (without the data URL prefix).
 */
export async function captureScreenshot(
  this: RemoteDebugger,
  opts: ScreenshotCaptureOptions = {}
): Promise<string> {
  const {rect = null, coordinateSystem = 'Viewport'} = opts;
  this.log.debug('Capturing screenshot');

  const arect = rect ?? (await this.executeAtom(
    'execute_script',
    ['return {x: 0, y: 0, width: window.innerWidth, height: window.innerHeight}', []]
  ) as Rect);
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
