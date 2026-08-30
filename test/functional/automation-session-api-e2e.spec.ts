import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {errors} from '@appium/base-driver';

import type {AutomationSession} from '../../lib/index.js';
import {PAGE_TITLE, useRemoteDebuggerFixture} from './rd-fixture.js';

/**
 * Per-API isolation tests for the Automation-domain `AutomationSession`, split out of the single
 * combined round-trip test in `safari-e2e.spec.ts` so a slow/flaky API doesn't block or obscure
 * the others, and so a specific failure mode (e.g. a call hanging with no response right after a
 * `performInteractionSequence`-driven interaction, reported against appium-xcuitest-driver PR
 * #2962) can be isolated to the exact sequence that triggers it.
 *
 * Deliberately NOT wired into any npm script or CI workflow - these are for manual investigation
 * against a real Simulator, e.g.:
 *   npm run build && node --test --enable-source-maps --test-force-exit \
 *     --test-timeout=300000 ./build/test/functional/automation-session-api-e2e.spec.js
 */
describe('Automation session - per-API isolation', function () {
  const fixture = useRemoteDebuggerFixture();

  async function withSession(fn: (session: AutomationSession) => Promise<void>): Promise<void> {
    await fixture.selectTestPage();
    const rd = fixture.rd();
    const session = await rd.startAutomationSession();
    try {
      await fn(session);
    } finally {
      await rd.stopAutomationSession();
    }
  }

  it('startAutomationSession / stopAutomationSession', async function () {
    await withSession(async (session) => {
      assert.strictEqual(session.isStarted, true);
      assert.ok(session.currentWindowHandle);
    });
  });

  it('navigate / getCurrentUrl / getTitle / getPageSource', async function () {
    await withSession(async (session) => {
      await session.navigate(fixture.freshUrl());
      assert.strictEqual(await session.getTitle(), PAGE_TITLE);
      assert.ok((await session.getCurrentUrl()).startsWith(fixture.address()));
      assert.ok((await session.getPageSource()).includes('somediv'));
    });
  });

  it('findElement / findElements / getText / isDisplayed', async function () {
    await withSession(async (session) => {
      await session.navigate(fixture.freshUrl());
      const div = await session.findElement('css selector', '#somediv');
      assert.ok(div);
      assert.strictEqual(await session.getText(div), 'This is in #somediv');
      assert.strictEqual(await session.isDisplayed(div), true);

      const hiddenDiv = await session.findElement('css selector', '#hiddendiv');
      assert.ok(hiddenDiv);
      assert.strictEqual(await session.isDisplayed(hiddenDiv), false);

      const all = await session.findElements('css selector', 'div');
      assert.ok(all.length >= 2);
    });
  });

  it('click', async function () {
    await withSession(async (session) => {
      await session.navigate(fixture.freshUrl());
      const checkbox = await session.findElement('css selector', '#checkbox');
      assert.ok(checkbox);
      assert.strictEqual(await session.isSelected(checkbox), false);
      await session.click(checkbox);
      assert.strictEqual(await session.isSelected(checkbox), true);
    });
  });

  it('sendKeys types into the element (via the type atom)', async function () {
    await withSession(async (session) => {
      await session.navigate(fixture.freshUrl());
      const input = await session.findElement('css selector', '#input');
      assert.ok(input);
      await session.click(input);
      await session.sendKeys(input, 'hello automation');
      assert.strictEqual(await session.getAttribute(input, 'value'), 'hello automation');
    });
  });

  it('getCookies / addCookie / deleteCookie / deleteAllCookies', async function () {
    await withSession(async (session) => {
      await session.navigate(fixture.freshUrl());
      await session.deleteAllCookies();
      assert.deepStrictEqual(await session.getCookies(), []);

      await session.addCookie({name: 'a', value: '1'});
      const cookies = await session.getCookies();
      assert.ok(cookies.some((c) => c.name === 'a' && c.value === '1'));

      await session.deleteCookie('a');
      assert.ok(!(await session.getCookies()).some((c) => c.name === 'a'));
    });
  });

  it('performW3CActions - pointer down/up via an Element origin', async function () {
    await withSession(async (session) => {
      await session.navigate(fixture.freshUrl());
      const checkbox = await session.findElement('css selector', '#checkbox');
      assert.ok(checkbox);
      await session.performW3CActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: {pointerType: 'touch'},
          actions: [
            {type: 'pointerMove', x: 0, y: 0, origin: checkbox as any, duration: 0},
            {type: 'pointerDown', button: 0},
            {type: 'pointerUp', button: 0},
          ],
        },
      ]);
      assert.strictEqual(await session.isSelected(checkbox), true);
    });
  });

  it('screenshot / elementScreenshot', async function () {
    await withSession(async (session) => {
      await session.navigate(fixture.freshUrl());
      const screenshot = await session.screenshot();
      assert.ok(screenshot.startsWith('iVBOR'));

      const div = await session.findElement('css selector', '#somediv');
      assert.ok(div);
      const elScreenshot = await session.elementScreenshot(div);
      assert.ok(elScreenshot.startsWith('iVBOR'));
    });
  });

  it('window management - getWindowRect/setWindowRect/maximize/minimize/fullscreen', async function () {
    await withSession(async (session) => {
      await session.navigate(fixture.freshUrl());
      const rect = await session.getWindowRect();
      assert.ok(rect.width > 0 && rect.height > 0);

      await session.setWindowRect(undefined, undefined, 400, 600);
      await session.maximizeWindow();
      await session.minimizeWindow();
    });
  });

  it('W3C error mapping - stale element and BotError against real WebKit', async function () {
    await withSession(async (session) => {
      await session.navigate(fixture.freshUrl());
      await assert.rejects(
        session.getText({ELEMENT: 'does-not-exist', 'element-6066-11e4-a52e-4f735466cecf': 'does-not-exist'}),
        errors.StaleElementReferenceError,
      );
      const div = await session.findElement('css selector', '#somediv');
      assert.ok(div);
      await assert.rejects(session.clear(div), errors.InvalidElementStateError);
    });
  });

  // The sequence below reproduces (in isolation, with nothing else preceding it) the exact
  // failure reported against appium-xcuitest-driver PR #2962: a call issued immediately after a
  // performW3CActions pointer down/up sequence hangs with no response at all, resolved only
  // after an unrelated ~180s internal queue timeout elsewhere. Runs both getCookies (the reported
  // case) and a plain evaluateJavaScriptFunction-backed call (getText) right after the same
  // pointer sequence, since the earlier investigation showed the hang isn't specific to which
  // call comes next.
  it('reproduction: a call issued immediately after performW3CActions pointer down/up', async function () {
    await withSession(async (session) => {
      await session.navigate(fixture.freshUrl());
      const checkbox = await session.findElement('css selector', '#checkbox');
      assert.ok(checkbox);
      await session.performW3CActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: {pointerType: 'mouse'},
          actions: [
            {type: 'pointerMove', x: 0, y: 0, origin: checkbox as any, duration: 0},
            {type: 'pointerDown', button: 0},
            {type: 'pointerUp', button: 0},
          ],
        },
      ]);
      // No delay here - the report's own sequence went straight from releaseActions into the
      // next call with no intervening await beyond the driver's own dispatch.
      assert.ok(Array.isArray(await session.getCookies()));

      // repeat with a second pointer sequence, this time followed by evaluateJavaScriptFunction
      // (via getText) rather than getCookies, to check whether it's call-specific.
      const div = await session.findElement('css selector', '#somediv');
      assert.ok(div);
      await session.performW3CActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: {pointerType: 'mouse'},
          actions: [
            {type: 'pointerMove', x: 0, y: 0, origin: div as any, duration: 0},
            {type: 'pointerDown', button: 0},
            {type: 'pointerUp', button: 0},
          ],
        },
      ]);
      assert.strictEqual(await session.getText(div), 'This is in #somediv');
    });
  });
});
