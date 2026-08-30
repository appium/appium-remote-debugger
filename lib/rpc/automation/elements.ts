import {errors} from '@appium/base-driver';
import type {StringRecord} from '@appium/types';
import {waitForCondition} from 'asyncbox';

import {getAutomationAtomScript, type AutomationAtomName} from './atoms.js';
import {takeScreenshot} from './screenshot.js';
import type {AutomationSession} from './session.js';
import type {AutomationElement, AutomationRect, LocatorStrategy} from './types.js';

const FIND_POLL_INTERVAL_MS = 100;

/** Finds the first matching element, polling until a match or the implicit wait elapses. */
export async function findElement(
  this: AutomationSession,
  strategy: LocatorStrategy,
  value: string,
  root?: AutomationElement,
): Promise<AutomationElement | null> {
  return await pollForRawNodes.call(this, 'find_element', strategy, value, root, (result) => result == null);
}

/** Finds every matching element, polling until at least one match or the implicit wait elapses. */
export async function findElements(
  this: AutomationSession,
  strategy: LocatorStrategy,
  value: string,
  root?: AutomationElement,
): Promise<AutomationElement[]> {
  const raw = await pollForRawNodes.call(
    this,
    'find_elements',
    strategy,
    value,
    root,
    (result) => !result || result.length === 0,
  );
  return raw ?? [];
}

// Native touch-based tapping (see below) reports success without actually toggling a
// checkbox/radio `<input>`'s checked state (confirmed on our driver and safaridriver alike).
// Route these through the `click` JS atom instead, same as `sendKeys` was moved off native
// keyboard delivery for the analogous reason. https://bugs.webkit.org/show_bug.cgi?id=322939
const CHECKABLE_INPUT_TYPES = new Set(['checkbox', 'radio']);

/** Taps/clicks the element via a native touch interaction, or selects it if it's an `<option>`. */
export async function click(this: AutomationSession, el: AutomationElement): Promise<void> {
  const tagName = await this.getTagName(el);
  if (tagName === 'option') {
    await selectOptionElement.call(this, el);
    return;
  }
  if (tagName === 'input' && CHECKABLE_INPUT_TYPES.has((await this.getAttribute(el, 'type'))?.toLowerCase() ?? '')) {
    await this.evaluateJavaScriptFunction<void>(await getAutomationAtomScript('click'), [el]);
    return;
  }
  const layout = await computeLayout.call(this, el, true, 'Viewport');
  if (layout.isObscured) {
    throw new errors.ElementClickInterceptedError(
      'Element is not clickable at its current position because it is obscured',
    );
  }
  // iOS has no real pointing device - Automation.performMouseInteraction is not
  // implemented there (confirmed against a real Simulator: 'NotImplemented'). Touch
  // is the input model WebKit actually supports on iOS/iPadOS. `mouseInteraction` is
  // required on both states - per WebKit's own Automation.json, if it's "unmentioned
  // and the interaction cannot be determined through other heuristics, the state is
  // dropped" (confirmed: WebAutomationSession's C++ has no such heuristic, only its
  // WebDriver/Session.cpp reference client does - omitting it silently no-ops the tap).
  await this.performInteractionSequence(
    [{sourceId: this.sessionId, sourceType: 'Touch'}],
    [
      {
        states: [
          {
            sourceId: this.sessionId,
            location: {x: layout.center.x, y: layout.center.y},
            pressedButton: 'Left',
            mouseInteraction: 'Down',
          },
        ],
      },
      {states: [{sourceId: this.sessionId, mouseInteraction: 'Up'}]},
    ],
  );
}

/** Clears an editable element's value. */
export async function clear(this: AutomationSession, el: AutomationElement): Promise<void> {
  await this.evaluateJavaScriptFunction<void>(await getAutomationAtomScript('clear'), [el]);
}

/**
 * Focuses the element and types the given text, translating special WebDriver key codes.
 *
 * Dispatched via the bundled `type` JS atom (the same synthetic-keyboard-event engine the
 * atoms-based execution path already uses) rather than any native Automation-domain keyboard
 * primitive. Ruled out a client-side args bug here (unlike the `addSingleCookie` `domain`/`path`
 * case): a real touch-based `click()` first, to establish true first-responder focus, still left
 * `Automation.performKeyboardInteractions` reporting success while typing nothing (confirmed
 * against a real iOS 27 beta Simulator and iOS 26.4 in CI alike) - the underlying key-event
 * simulation itself just isn't implemented/wired up on iOS the way it is on macOS.
 *
 * Reported to WebKit: https://bugs.webkit.org/show_bug.cgi?id=322938
 */
export async function sendKeys(this: AutomationSession, el: AutomationElement, text: string): Promise<void> {
  await this.evaluateJavaScriptFunction<void>(await getAutomationAtomScript('type'), [el, text]);
}

/** Submits the form the element belongs to. */
export async function submit(this: AutomationSession, el: AutomationElement): Promise<void> {
  await this.evaluateJavaScriptFunction<void>(await getAutomationAtomScript('submit'), [el]);
}

/** Returns the element's visible (rendered) text. */
export async function getText(this: AutomationSession, el: AutomationElement): Promise<string> {
  return await this.evaluateJavaScriptFunction<string>(await getAutomationAtomScript('get_text'), [el]);
}

/** Returns the element's lowercased tag name. */
export async function getTagName(this: AutomationSession, el: AutomationElement): Promise<string> {
  return await this.evaluateJavaScriptFunction<string>(await getAutomationAtomScript('get_tag_name'), [el]);
}

/** Returns the value of the given WebDriver-normalized attribute/property. */
export async function getAttribute(
  this: AutomationSession,
  el: AutomationElement,
  name: string,
): Promise<string | null> {
  return await this.evaluateJavaScriptFunction<string | null>(await getAutomationAtomScript('get_attribute'), [
    el,
    name,
  ]);
}

/** Returns the value of the given raw DOM attribute (no property fallback). */
export async function getDomAttribute(
  this: AutomationSession,
  el: AutomationElement,
  name: string,
): Promise<string | null> {
  return await this.evaluateJavaScriptFunction<string | null>(await getAutomationAtomScript('get_dom_attribute'), [
    el,
    name,
  ]);
}

/** Returns the value of the given JS property on the element. */
export async function getProperty(this: AutomationSession, el: AutomationElement, name: string): Promise<any> {
  return await this.evaluateJavaScriptFunction<any>(await getAutomationAtomScript('get_property'), [el, name]);
}

/** Returns the element's computed value for the given CSS property. */
export async function getCssValue(
  this: AutomationSession,
  el: AutomationElement,
  propertyName: string,
): Promise<string> {
  return await this.evaluateJavaScriptFunction<string>(await getAutomationAtomScript('get_css_value'), [
    el,
    propertyName,
  ]);
}

/** Whether the element is displayed (visible) per WebDriver's visibility rules. */
export async function isDisplayed(this: AutomationSession, el: AutomationElement): Promise<boolean> {
  return await this.evaluateJavaScriptFunction<boolean>(await getAutomationAtomScript('is_displayed'), [el]);
}

/** Whether the element is enabled (not `disabled`). */
export async function isEnabled(this: AutomationSession, el: AutomationElement): Promise<boolean> {
  return await this.evaluateJavaScriptFunction<boolean>(await getAutomationAtomScript('is_enabled'), [el]);
}

/** Whether the element is editable (not read-only/disabled and of an editable type). */
export async function isEditable(this: AutomationSession, el: AutomationElement): Promise<boolean> {
  return await this.evaluateJavaScriptFunction<boolean>(await getAutomationAtomScript('is_editable'), [el]);
}

/** Whether the element (checkbox/radio/option) is selected. */
export async function isSelected(this: AutomationSession, el: AutomationElement): Promise<boolean> {
  return await this.evaluateJavaScriptFunction<boolean>(await getAutomationAtomScript('is_selected'), [el]);
}

/** Returns the element's page-relative bounding rect. */
export async function getRect(this: AutomationSession, el: AutomationElement): Promise<AutomationRect> {
  return (await computeLayout.call(this, el, false, 'Page')).rect;
}

/** Takes a screenshot of just this element, scrolling it into view first. */
export async function elementScreenshot(this: AutomationSession, el: AutomationElement): Promise<string> {
  return await takeScreenshot.call(this, {nodeHandle: this.unwrapElement(el), scrollIntoViewIfNeeded: true});
}

/** Thrown internally by `pollForRawNodes` to signal a timeout, distinct from a real RPC/eval failure. */
class NoMatchError extends Error {}

/** Polls `atomName` (a `find_element`/`find_elements` atom) until a non-empty match or the implicit wait elapses. */
async function pollForRawNodes(
  this: AutomationSession,
  atomName: AutomationAtomName,
  strategy: LocatorStrategy,
  value: string,
  root: AutomationElement | undefined,
  isEmpty: (result: any) => boolean,
): Promise<any> {
  const script = await getAutomationAtomScript(atomName);
  try {
    const match = (await waitForCondition(
      async () => {
        const result = await this.evaluateJavaScriptFunction<any>(script, [strategy, value, root ?? null]);
        return isEmpty(result) ? false : {result};
      },
      {waitMs: this.implicitWaitTimeoutMs, intervalMs: FIND_POLL_INTERVAL_MS, error: new NoMatchError()},
    )) as {result: any};
    return match.result;
  } catch (err) {
    if (err instanceof NoMatchError) {
      return null;
    }
    throw err;
  }
}

// Unlike most Automation.* commands, computeElementLayout/selectOptionElement declare
// `frameHandle` as a required (not optional) param - it must always be sent, defaulting
// to '' when not inside a frame, or WebKit rejects the call outright.
async function selectOptionElement(this: AutomationSession, el: AutomationElement): Promise<void> {
  await this.callAutomation('selectOptionElement', {
    browsingContextHandle: this.requireTopLevelHandle(),
    nodeHandle: this.unwrapElement(el),
    frameHandle: this.currentFrameHandle,
  });
}

/**
 * Resolves an element's layout, optionally scrolling it into view first.
 *
 * `inViewCenterPoint` has been observed missing from WebKit's response even when
 * `scrollIntoViewIfNeeded` was requested - e.g. for an element pinned to the very bottom of a
 * page, past the last position the page can actually scroll to. Falls back to the rect's own
 * geometric center in that case, rather than crashing on `undefined`.
 */
export async function computeLayout(
  this: AutomationSession,
  el: AutomationElement,
  scrollIfNeeded: boolean,
  coordinateSystem: 'Page' | 'Viewport',
): Promise<{rect: AutomationRect; center: {x: number; y: number}; isObscured: boolean}> {
  const params: StringRecord = {
    browsingContextHandle: this.requireTopLevelHandle(),
    nodeHandle: this.unwrapElement(el),
    scrollIntoViewIfNeeded: scrollIfNeeded,
    coordinateSystem,
    frameHandle: this.currentFrameHandle,
  };
  const result = await this.callAutomation<any>('computeElementLayout', params);
  const {origin, size} = result.rect;
  const center = result.inViewCenterPoint ?? {x: origin.x + size.width / 2, y: origin.y + size.height / 2};
  return {
    rect: {x: Math.round(origin.x), y: Math.round(origin.y), width: size.width, height: size.height},
    center: {x: center.x, y: center.y},
    isObscured: !!result.isObscured,
  };
}
