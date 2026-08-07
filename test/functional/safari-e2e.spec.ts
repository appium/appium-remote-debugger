import assert from 'node:assert/strict';
import {describe, it, type TestContext} from 'node:test';

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
