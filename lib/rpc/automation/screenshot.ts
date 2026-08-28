import type {AutomationSession} from './session.js';

/** Takes a base64-encoded screenshot of the current viewport. */
export async function screenshot(this: AutomationSession): Promise<string> {
  return await takeScreenshot.call(this, {});
}

/** Takes a base64-encoded screenshot, optionally scoped to a single element. Shared with `elements.ts`'s `elementScreenshot` - not part of the public API. */
export async function takeScreenshot(
  this: AutomationSession,
  opts: {nodeHandle?: string; scrollIntoViewIfNeeded?: boolean},
): Promise<string> {
  const params = this.withFrameHandle({handle: this.requireTopLevelHandle(), clipToViewport: true});
  if (opts.scrollIntoViewIfNeeded) {
    params.scrollIntoViewIfNeeded = true;
  }
  if (opts.nodeHandle) {
    params.nodeHandle = opts.nodeHandle;
  }
  const response = await this.callAutomation<{data: string}>('takeScreenshot', params);
  return response.data;
}
