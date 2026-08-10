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
    // jsdom reports every element as zero-size, which the atoms' visibility/interactability
    // checks treat as clipped and not shown; give elements a plausible fixed box so `type()`'s
    // interactability gate passes, same workaround as atoms.spec.ts's patchLayout.
    function patchLayout(): void {
      Element.prototype.getBoundingClientRect = function () {
        return {x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20} as DOMRect;
      };
      for (const prop of ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight']) {
        Object.defineProperty(HTMLElement.prototype, prop, {configurable: true, get: () => 100});
      }
    }

    // Minimal stand-in for a masked/segmented-input widget: field `a` moves focus to field `b`
    // once it decides `a` is "full", mimicking such a widget's own auto-advance JS.
    function buildTwoFieldShadowWidget(): {a: HTMLInputElement; b: HTMLInputElement} {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({mode: 'open'});
      const a = document.createElement('input');
      a.type = 'number';
      const b = document.createElement('input');
      b.type = 'number';
      shadowRoot.append(a, b);
      a.addEventListener('input', () => {
        if (a.value.length >= 1) {
          b.focus();
        }
      });
      return {a, b};
    }

    it('follows focus into a different element an app moves it to mid-typing (appium/appium#16697)', async function () {
      // A fixed keyboard target (the pre-fix behavior) would keep sending both characters to `a`.
      const {type} = await importAtomsModule(['webdriver', 'element.ts']);
      patchLayout();
      const {a, b} = buildTwoFieldShadowWidget();
      a.focus();

      type(a, '12');

      assert.strictEqual(a.value, '1');
      assert.strictEqual(b.value, '2');
    });

    it('replaces, rather than appends to, a field it follows focus into that already has a value (appium/appium#16697)', async function () {
      // `b`'s pre-existing value stands in for what a widget commonly does right after moving
      // focus to the next field: select all of it, expecting the next keystroke to overwrite it.
      // Number inputs can't expose that selection to this atom, so it has to assume one exists.
      // `a` is the element sendKeys originally targeted, so it must still append (sendKeys never
      // implies a prior clear).
      const {type} = await importAtomsModule(['webdriver', 'element.ts']);
      patchLayout();
      const {a, b} = buildTwoFieldShadowWidget();
      a.value = '5';
      b.value = '00';
      a.focus();

      type(a, '12');

      assert.strictEqual(a.value, '51');
      assert.strictEqual(b.value, '2');
    });
  });
});
