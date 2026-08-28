import type {StringRecord} from '@appium/types';

import {getAutomationAtomScript} from './atoms.js';
import {waitForNavigationToComplete} from './navigation.js';
import type {AutomationSession} from './session.js';
import type {AutomationElement} from './types.js';

/** Switches into a child frame, addressed either by its ordinal index or its `<iframe>`/`<frame>` element. */
export async function switchToFrame(this: AutomationSession, target: number | AutomationElement): Promise<void> {
  await waitForNavigationToComplete.call(this);
  const params: StringRecord = {browsingContextHandle: this.requireTopLevelHandle()};
  if (this.currentFrameHandle) {
    params.frameHandle = this.currentFrameHandle;
  }
  if (typeof target === 'number') {
    params.ordinal = target;
  } else {
    params.nodeHandle = this.unwrapElement(target);
  }
  const resp = await this.callAutomation<{result: string}>('resolveChildFrameHandle', params);
  await setCurrentFrame.call(this, resp.result);
}

/** Switches to the immediate parent of the current frame. */
export async function switchToParentFrame(this: AutomationSession): Promise<void> {
  await waitForNavigationToComplete.call(this);
  await setCurrentFrame.call(this, this.currentParentFrameHandle);
}

/** Switches back to the top-level browsing context, out of any frame. */
export async function switchToDefaultContent(this: AutomationSession): Promise<void> {
  await setCurrentFrame.call(this, '');
}

/** Returns the currently focused element in the current frame, if any. */
export async function getActiveElement(this: AutomationSession): Promise<AutomationElement | null> {
  await waitForNavigationToComplete.call(this);
  const raw = await this.evaluateJavaScriptFunction<any>(await getAutomationAtomScript('get_active_element'));
  return raw == null ? null : this.wrapElement(this.extractNodeHandle(raw));
}

async function setCurrentFrame(this: AutomationSession, handle: string): Promise<void> {
  await this.callAutomation('switchToBrowsingContext', {
    browsingContextHandle: this.requireTopLevelHandle(),
    frameHandle: handle,
  });
  this.currentFrameHandle = handle;
  if (!handle) {
    this.currentParentFrameHandle = '';
    return;
  }
  const resp = await this.callAutomation<{result: string}>('resolveParentFrameHandle', {
    browsingContextHandle: this.requireTopLevelHandle(),
    frameHandle: handle,
  });
  this.currentParentFrameHandle = resp.result;
}
