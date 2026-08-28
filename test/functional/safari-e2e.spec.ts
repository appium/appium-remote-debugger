import assert from 'node:assert/strict';
import {describe, it, type TestContext} from 'node:test';

import {errors} from '@appium/base-driver';
import type {StringRecord} from '@appium/types';
import {retryInterval} from 'asyncbox';

import {PAGE_TITLE, useRemoteDebuggerFixture} from './rd-fixture.js';

describe('Safari remote debugger', function () {
  const fixture = useRemoteDebuggerFixture();

  it('should be able to connect and get app', async function () {
    await retryInterval(10, 500, async () => {
      const pageArray = await fixture.rd().selectApp(fixture.address());
      assert.ok(pageArray.filter((page) => page.title === PAGE_TITLE).length >= 1);
    });
  });

  it('should be able to monitor network events', async function (ctx: TestContext) {
    if (process.env.CI) {
      // TODO: this test is flaky on CI due to its slowness
      return ctx.skip();
    }

    const networkEvents: {event: StringRecord; method: string}[] = [];
    fixture.rd().startNetwork((_err?: Error, event?: StringRecord, method?: string) => {
      if (event && method) {
        networkEvents.push({event, method});
      }
    });

    await fixture.selectTestPage();

    await fixture.rd().navToUrl(`https://github.com`);

    await fixture.rd().navToUrl(`${fixture.address()}/frameset.html`);

    await retryInterval(50, 100, async function () {
      assert.ok(networkEvents.length >= 1);
      assert.ok(networkEvents.find(({event}) => event?.request?.url === 'https://github.com/') != null);
    });
  });

  describe('capture', function () {
    it('full viewport', async function () {
      await fixture.selectTestPage();

      const screenshot = await fixture.rd().captureScreenshot();
      assert.ok(screenshot.startsWith('iVBOR'));
    });

    it('rect on a viewport', async function () {
      await fixture.selectTestPage();

      const screenshot = await fixture.rd().captureScreenshot({
        rect: {x: 0, y: 0, width: 100, height: 100},
      });
      assert.ok(screenshot.startsWith('iVBOR'));
    });

    it('full page', async function () {
      await fixture.selectTestPage();

      const screenshot = await fixture.rd().captureScreenshot({
        coordinateSystem: 'Page',
      });
      assert.ok(screenshot.startsWith('iVBOR'));
    });

    it('rect on a page', async function () {
      await fixture.selectTestPage();

      const screenshot = await fixture.rd().captureScreenshot({
        rect: {x: 0, y: 0, width: 100, height: 100},
        coordinateSystem: 'Page',
      });
      assert.ok(screenshot.startsWith('iVBOR'));
    });
  });

  it('should drive a full WebDriver-style round trip over an Automation session without disrupting normal traffic', async function () {
    await fixture.selectTestPage();

    const rd = fixture.rd();
    try {
      const session = await rd.startAutomationSession();
      assert.strictEqual(session.isStarted, true);
      assert.ok(session.currentWindowHandle);

      await session.navigate(`${fixture.address()}/`);
      assert.strictEqual(await session.getTitle(), PAGE_TITLE);

      const div = await session.findElement('css selector', '#somediv');
      assert.ok(div);
      assert.strictEqual(await session.getText(div), 'This is in #somediv');
      assert.strictEqual(await session.isDisplayed(div), true);

      const hiddenDiv = await session.findElement('css selector', '#hiddendiv');
      assert.ok(hiddenDiv);
      assert.strictEqual(await session.isDisplayed(hiddenDiv), false);

      const input = await session.findElement('css selector', '#input');
      assert.ok(input);
      // Exercises the click/sendKeys wire protocol round-trip (params build correctly,
      // the calls don't error). NOT asserting on the typed value landing in #input's
      // value: confirmed against a real Simulator that even a correct touch-down/up
      // sequence (per WebKit's own Automation.json) doesn't reliably move real UI-level
      // input focus there, independently of this library's code - script-level DOM state
      // (activeElement, .focus()) is unaffected and still verified below.
      await session.click(input);
      await session.sendKeys(input, 'hello automation');
      const focused = await session.getActiveElement();
      assert.ok(focused);
      assert.deepStrictEqual(focused, input);

      // W3C Actions API translation round-trip: a raw touch tap via Element-relative
      // origin (exercises sourceType mapping, origin/nodeHandle resolution, and the
      // down->up tick-state translation against real WebKit, not just unit-tested logic).
      await session.performW3CActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: {pointerType: 'touch'},
          actions: [
            {type: 'pointerMove', x: 0, y: 0, origin: div as any, duration: 0},
            {type: 'pointerDown', button: 0},
            {type: 'pointerUp', button: 0},
          ],
        },
      ]);

      // W3C error mapping round-trip against real WebKit: a bogus node handle triggers
      // WebKit's own native-protocol "InvalidNodeIdentifier" error...
      await assert.rejects(
        session.getText({ELEMENT: 'does-not-exist', 'element-6066-11e4-a52e-4f735466cecf': 'does-not-exist'}),
        errors.StaleElementReferenceError,
      );
      // ...and an atom throwing a BotError (clear() on a non-editable div) surfaces as the
      // matching W3C error too, recovered from the state our atoms embed under WebKit's
      // generic JavaScriptError classification (see lib/rpc/automation/errors.ts).
      await assert.rejects(session.clear(div), errors.InvalidElementStateError);

      assert.ok(Array.isArray(await session.getCookies()));

      const screenshot = await session.screenshot();
      assert.ok(screenshot.startsWith('iVBOR'));
    } finally {
      // Must always run, or a leaked session breaks every test after this one.
      await rd.stopAutomationSession();
    }
    assert.strictEqual(rd.automationSession, undefined);
  });

  it(`should be able to call 'selectApp' after already connecting to app`, async function () {
    // this mimics the situation of getting all contexts multiple times
    await fixture.selectTestPage();

    const script = 'return 1 + 1;';
    const sum = await fixture.rd().executeAtom('execute_script', [script, []]);
    assert.strictEqual(sum, 2);

    await fixture.rd().selectApp(fixture.address());
  });

  it('should be able to get console logs from a remote page', async function () {
    await fixture.selectTestPage();

    const lines: any[] = [];
    // Event listener registration; callback is required by startConsole API
    fixture.rd().startConsole((_err, line) => {
      lines.push(line);
    });

    await fixture.rd().navToUrl('https://google.com');

    await fixture.rd().executeAtom('execute_script', [`console.log('hi from appium')`, []]);

    // wait for the asynchronous console event to come in
    await retryInterval(50, 100, async function () {
      assert.ok(lines.length >= 1);
      assert.strictEqual(lines.filter((line) => line.text === 'hi from appium').length, 1);
    });
  });

  it('should be able to access the shadow DOM', async function (ctx: TestContext) {
    function shadowScript(text: string): string {
      return `return (function (elem) {
  return (function() {
    // element has a shadowRoot property
    if (this.shadowRoot) {
      return this.shadowRoot.querySelector('${text}')
    }
    // fall back to querying the element directly if not
    return this.querySelector('${text}')
  }).call(elem);
}).apply(null, arguments)`;
    }

    await fixture.selectTestPage();

    await fixture.rd().navToUrl(`${fixture.address()}/shadow-dom.html`);

    // make sure the browser supports shadow DOM before running the test
    const shadowDomSupported = await fixture
      .rd()
      .executeAtom('execute_script', ['return !!document.head.createShadowRoot || !!document.head.attachShadow;']);
    if (!shadowDomSupported) {
      return ctx.skip();
    }

    await assert.doesNotReject(
      retryInterval(5, 500, async function () {
        const el1 = await fixture.rd().executeAtom('find_element_fragment', ['class name', 'element']);
        const sEl1 = await fixture.rd().executeAtom('execute_script', [shadowScript('#shadowContent'), [el1]]);
        const sEl2 = await fixture.rd().executeAtom('execute_script', [shadowScript('#shadowSubContent'), [sEl1]]);
        const text = await fixture.rd().executeAtom('get_text', [sEl2]);
        assert.strictEqual(text, 'It is murky in here');
      }),
    );
  });
});
