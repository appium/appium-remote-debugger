import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {JSDOM} from 'jsdom';

import {importAtomsModule, importAtomsModuleInternal} from '../helpers/atoms-module.js';

// appium/appium-xcuitest-driver#2536: clicking an <a target="_blank"> link via an atom silently
// did nothing on real iOS WebKit — no error, no navigation, no new tab — because WebKit requires
// a genuine user gesture to open a *new* top-level browsing context, which a script-dispatched
// click can never carry. `opensNewBrowsingContext` (private to core/action.ts) detects that case
// up front so `click()` raises an actionable error instead of a silent no-op.
describe('atoms/src/core/action.ts', function () {
  describe('opensNewBrowsingContext (private helper)', function () {
    async function load() {
      const mod = await importAtomsModuleInternal(['core', 'action.ts'], ['opensNewBrowsingContext']);
      return mod.opensNewBrowsingContext as (el: any) => boolean;
    }

    it('is true for a target="_blank" link with no existing match', async function () {
      const opensNewBrowsingContext = await load();
      const {window} = new JSDOM('<a href="https://example.com/" target="_blank">go</a>', {
        url: 'http://localhost/',
      });
      assert.strictEqual(opensNewBrowsingContext(window.document.querySelector('a')!), true);
    });

    it('is true for an arbitrary named target with no existing match', async function () {
      const opensNewBrowsingContext = await load();
      const {window} = new JSDOM('<a href="https://example.com/" target="does-not-exist">go</a>', {
        url: 'http://localhost/',
      });
      assert.strictEqual(opensNewBrowsingContext(window.document.querySelector('a')!), true);
    });

    it('is false for a same-window link (no target)', async function () {
      const opensNewBrowsingContext = await load();
      const {window} = new JSDOM('<a href="https://example.com/">go</a>', {url: 'http://localhost/'});
      assert.strictEqual(opensNewBrowsingContext(window.document.querySelector('a')!), false);
    });

    it('is false for target="_self"/"_parent"/"_top"', async function () {
      const opensNewBrowsingContext = await load();
      for (const target of ['_self', '_parent', '_top']) {
        const {window} = new JSDOM(`<a href="https://example.com/" target="${target}">go</a>`, {
          url: 'http://localhost/',
        });
        assert.strictEqual(opensNewBrowsingContext(window.document.querySelector('a')!), false, target);
      }
    });

    it('is false when the target names an existing frame (navigates it in place)', async function () {
      const opensNewBrowsingContext = await load();
      const {window} = new JSDOM(
        `<iframe name="content-frame"></iframe>
         <a href="https://example.com/" target="content-frame">go</a>`,
        {url: 'http://localhost/'},
      );
      assert.strictEqual(opensNewBrowsingContext(window.document.querySelector('a')!), false);
    });

    it('is false for an element with no href', async function () {
      const opensNewBrowsingContext = await load();
      const {window} = new JSDOM('<a target="_blank">go</a>', {url: 'http://localhost/'});
      assert.strictEqual(opensNewBrowsingContext(window.document.querySelector('a')!), false);
    });

    it('is false for an element with no enclosing anchor', async function () {
      const opensNewBrowsingContext = await load();
      const {window} = new JSDOM('<div>not a link</div>', {url: 'http://localhost/'});
      assert.strictEqual(opensNewBrowsingContext(window.document.querySelector('div')!), false);
    });

    it('resolves through a non-anchor descendant (e.g. a <span> inside the <a>)', async function () {
      const opensNewBrowsingContext = await load();
      const {window} = new JSDOM('<a href="https://example.com/" target="_blank"><span>go</span></a>', {
        url: 'http://localhost/',
      });
      assert.strictEqual(opensNewBrowsingContext(window.document.querySelector('span')!), true);
    });
  });

  describe('click', function () {
    it('throws an actionable error instead of silently no-op-ing on a target="_blank" link', async function () {
      const {click} = await importAtomsModule(['core', 'action.ts']);
      const {window} = new JSDOM('<a href="https://example.com/" target="_blank">go</a>', {
        url: 'http://localhost/',
      });

      assert.throws(
        () => click(window.document.querySelector('a')!),
        (err: any) => {
          assert.match(err.message, /new browsing context/);
          assert.strictEqual(err.code, 12); // INVALID_ELEMENT_STATE
          return true;
        },
      );
    });
  });
});
