import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {importAtomsModule, importAtomsModuleInternal} from '../helpers/atoms-module.js';

// isWebDriverKey checks whether a character falls in the Unicode Private-Use-Area range this
// codebase's `Key` map (webdriver/key.ts) actually uses. Built via String.fromCharCode rather
// than embedding literal PUA characters in this file's source, to avoid the exact class of
// silent-corruption bug this function's range once suffered (see git history).
describe('atoms/src/webdriver/element.ts', function () {
  describe('isWebDriverKey (private helper)', function () {
    async function load() {
      const mod = await importAtomsModuleInternal(['webdriver', 'element.ts'], ['isWebDriverKey']);
      return mod.isWebDriverKey as (c: string) => boolean;
    }

    it('is true for the lowest defined special key, Key.NULL (U+E000)', async function () {
      const isWebDriverKey = await load();
      assert.strictEqual(isWebDriverKey(String.fromCharCode(0xe000)), true);
    });

    it('is true for the highest defined special key, Key.META (U+E03D)', async function () {
      const isWebDriverKey = await load();
      assert.strictEqual(isWebDriverKey(String.fromCharCode(0xe03d)), true);
    });

    it('is false just below the range', async function () {
      const isWebDriverKey = await load();
      assert.strictEqual(isWebDriverKey(String.fromCharCode(0xdfff)), false);
    });

    it('is false just above the range', async function () {
      const isWebDriverKey = await load();
      assert.strictEqual(isWebDriverKey(String.fromCharCode(0xe03e)), false);
    });

    it('is false for an ordinary ASCII character', async function () {
      const isWebDriverKey = await load();
      assert.strictEqual(isWebDriverKey('a'), false);
    });
  });

  describe('type (exported)', function () {
    it('follows focus into a different element an app moves it to mid-typing (appium/appium#16697)', async function () {
      const {type} = await importAtomsModule(['webdriver', 'element.ts']);

      // jsdom reports every element as zero-size, which the atoms' visibility/interactability
      // checks treat as clipped and not shown; give elements a plausible fixed box so `type()`'s
      // interactability gate passes, same workaround as atoms.spec.ts's patchLayout.
      Element.prototype.getBoundingClientRect = function () {
        return {x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20} as DOMRect;
      };
      for (const prop of ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight']) {
        Object.defineProperty(HTMLElement.prototype, prop, {configurable: true, get: () => 100});
      }

      // Minimal stand-in for a masked/segmented-input widget: field `a` moves focus to field `b`
      // after receiving one character, mimicking such a widget's own auto-advance JS. A fixed
      // keyboard target (the pre-fix behavior) would keep sending both characters to `a`.
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({mode: 'open'});
      const a = document.createElement('input');
      const b = document.createElement('input');
      shadowRoot.append(a, b);
      a.addEventListener('input', () => {
        if (a.value.length >= 1) {
          b.focus();
        }
      });
      a.focus();

      type(a, 'xy');

      assert.strictEqual(a.value, 'x');
      assert.strictEqual(b.value, 'y');
    });
  });
});
