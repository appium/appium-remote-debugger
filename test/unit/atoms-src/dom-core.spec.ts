import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {JSDOM} from 'jsdom';

import {importAtomsModule, importAtomsModuleInternal} from '../helpers/atoms-module.js';

// Unlike test/unit/atoms.spec.ts (which evals a compiled, bundled atom in jsdom and asserts on
// the WebDriver-wire response) and test/unit/atoms-loader.spec.ts (which tests lib/atoms.ts's
// Node-side script-generation helpers), this file imports atoms/src/core/dom-core.ts itself as a
// real ES module and calls its functions directly.
//
// `standardizeStyleAttribute` is not exported by dom-core.ts — it's a private helper used only by
// `getAttribute`. It stays that way; `importAtomsModuleInternal` reaches it for testing without
// changing the module's real public surface (see test/unit/helpers/atoms-module.ts).
describe('atoms/src/core/dom-core.ts', function () {
  describe('standardizeStyleAttribute (private helper)', function () {
    async function loadStandardizeStyleAttribute() {
      const mod = await importAtomsModuleInternal(['core', 'dom-core.ts'], ['standardizeStyleAttribute']);
      return mod.standardizeStyleAttribute as (value: string) => string;
    }

    it('lower-cases property names and appends a trailing semicolon', async function () {
      const standardizeStyleAttribute = await loadStandardizeStyleAttribute();
      assert.strictEqual(standardizeStyleAttribute('Color:RED;Background:BLUE'), 'color:RED;background:BLUE;');
    });

    it('already has a trailing semicolon, so does not double it', async function () {
      const standardizeStyleAttribute = await loadStandardizeStyleAttribute();
      assert.strictEqual(standardizeStyleAttribute('color:red;'), 'color:red;');
    });

    it('does not split on a semicolon inside a quoted value (e.g. a font-family list)', async function () {
      const standardizeStyleAttribute = await loadStandardizeStyleAttribute();
      assert.strictEqual(standardizeStyleAttribute(`content:"a;b";Color:red`), `content:"a;b";color:red;`);
    });

    it('ignores a malformed declaration with no colon', async function () {
      const standardizeStyleAttribute = await loadStandardizeStyleAttribute();
      assert.strictEqual(standardizeStyleAttribute('not-a-declaration;color:red'), 'color:red;');
    });

    it('returns an empty trailing-semicolon string for an empty input', async function () {
      const standardizeStyleAttribute = await loadStandardizeStyleAttribute();
      assert.strictEqual(standardizeStyleAttribute(''), ';');
    });
  });

  describe('getAttribute', function () {
    it('for the style attribute, reads the live style object rather than the raw attribute text', async function () {
      const {getAttribute} = await importAtomsModule(['core', 'dom-core.ts']);
      // No trailing semicolon in the source markup; the element's `style.cssText` getter (not the
      // raw attribute string) is the one that normalizes this, which is what proves `getAttribute`
      // reads through `.style.cssText` here rather than falling through to `getAttributeNode`.
      const {window} = new JSDOM('<div style="color:red"></div>');
      const el = window.document.querySelector('div')!;
      assert.strictEqual(el.getAttribute('style'), 'color:red');
      assert.strictEqual(getAttribute(el, 'style'), 'color: red;');
    });

    it('returns null for an attribute that is not present', async function () {
      const {getAttribute} = await importAtomsModule(['core', 'dom-core.ts']);
      const {window} = new JSDOM('<div></div>');
      const el = window.document.querySelector('div')!;
      assert.strictEqual(getAttribute(el, 'data-missing'), null);
    });

    it('is case-insensitive on the attribute name', async function () {
      const {getAttribute} = await importAtomsModule(['core', 'dom-core.ts']);
      const {window} = new JSDOM('<div data-foo="bar"></div>');
      const el = window.document.querySelector('div')!;
      assert.strictEqual(getAttribute(el, 'DATA-FOO'), 'bar');
    });
  });

  describe('isElement', function () {
    it('matches by tag name, case-insensitively on the requested name', async function () {
      const {isElement} = await importAtomsModule(['core', 'dom-core.ts']);
      const {window} = new JSDOM('<input type="text" />');
      const el = window.document.querySelector('input')!;
      assert.strictEqual(isElement(el, 'INPUT'), true);
      assert.strictEqual(isElement(el, 'select'), false);
    });

    it('returns true for any element when no tag name is given', async function () {
      const {isElement} = await importAtomsModule(['core', 'dom-core.ts']);
      const {window} = new JSDOM('<div></div>');
      assert.strictEqual(isElement(window.document.querySelector('div')), true);
      assert.strictEqual(isElement(window.document), false);
    });
  });

  describe('isSelectable / isSelected', function () {
    it('a checkbox is selectable, and reflects its checked state', async function () {
      const {isSelectable, isSelected} = await importAtomsModule(['core', 'dom-core.ts']);
      const {window} = new JSDOM('<input type="checkbox" checked />');
      const el = window.document.querySelector('input')!;
      assert.strictEqual(isSelectable(el), true);
      assert.strictEqual(isSelected(el), true);
    });

    it('a plain div is not selectable, and isSelected throws for it', async function () {
      const {isSelectable, isSelected} = await importAtomsModule(['core', 'dom-core.ts']);
      const {window} = new JSDOM('<div></div>');
      const el = window.document.querySelector('div')!;
      assert.strictEqual(isSelectable(el), false);
      assert.throws(() => isSelected(el));
    });
  });
});
