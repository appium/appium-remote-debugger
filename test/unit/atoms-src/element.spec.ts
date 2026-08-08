import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {importAtomsModuleInternal} from '../helpers/atoms-module.js';

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
});
