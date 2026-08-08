import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {importAtomsModuleInternal} from '../../helpers/atoms-module.js';

describe('atoms/src/core/locators/id.ts', function () {
  describe('cssEscape (private helper)', function () {
    async function load() {
      const mod = await importAtomsModuleInternal(['core', 'locators', 'id.ts'], ['cssEscape']);
      return mod.cssEscape as (s: string) => string;
    }

    it('escapes CSS-meaningful punctuation', async function () {
      const cssEscape = await load();
      assert.strictEqual(cssEscape('a.b'), 'a\\.b');
      assert.strictEqual(cssEscape('a#b'), 'a\\#b');
      assert.strictEqual(cssEscape('a:b'), 'a\\:b');
    });

    it('escapes whitespace (ids allow spaces via getElementById, unlike a CSS identifier)', async function () {
      const cssEscape = await load();
      assert.strictEqual(cssEscape('a b'), 'a\\ b');
    });

    it('escapes quote and backslash characters', async function () {
      const cssEscape = await load();
      assert.strictEqual(cssEscape(`a'b"c\\d`), `a\\'b\\"c\\\\d`);
    });

    it('leaves ordinary word characters untouched', async function () {
      const cssEscape = await load();
      assert.strictEqual(cssEscape('plainId123'), 'plainId123');
    });
  });
});
