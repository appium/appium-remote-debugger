import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {importAtomsModule, importAtomsModuleInternal} from '../helpers/atoms-module.js';

describe('atoms/src/core/color.ts', function () {
  describe('standardizeColor', function () {
    it('passes non-color properties through unchanged', async function () {
      const {standardizeColor} = await importAtomsModule(['core', 'color.ts']);
      assert.strictEqual(standardizeColor('display', 'block'), 'block');
    });

    it('standardizes a hex color to rgba', async function () {
      const {standardizeColor} = await importAtomsModule(['core', 'color.ts']);
      assert.strictEqual(standardizeColor('color', '#ff0000'), 'rgba(255, 0, 0, 1)');
    });

    it('standardizes a named color to rgba', async function () {
      const {standardizeColor} = await importAtomsModule(['core', 'color.ts']);
      assert.strictEqual(standardizeColor('backgroundColor', 'red'), 'rgba(255, 0, 0, 1)');
    });

    it('passes an already-rgb(a) value through as-is (matched, then reassembled unchanged)', async function () {
      const {standardizeColor} = await importAtomsModule(['core', 'color.ts']);
      assert.strictEqual(standardizeColor('color', 'rgba(1, 2, 3, 0.5)'), 'rgba(1, 2, 3, 0.5)');
    });

    it('passes an unparsable color value through unchanged', async function () {
      const {standardizeColor} = await importAtomsModule(['core', 'color.ts']);
      assert.strictEqual(standardizeColor('color', 'not-a-color'), 'not-a-color');
    });
  });

  describe('maybeConvertHexOrColorName (private helper)', function () {
    async function load() {
      const mod = await importAtomsModuleInternal(['core', 'color.ts'], ['maybeConvertHexOrColorName']);
      return mod.maybeConvertHexOrColorName as (s: string) => [number, number, number, number] | null;
    }

    it('converts a 6-digit hex color, case-insensitively', async function () {
      const maybeConvertHexOrColorName = await load();
      assert.deepStrictEqual(maybeConvertHexOrColorName('#00FF80'), [0, 255, 128, 1]);
    });

    it('expands a 3-digit hex shorthand', async function () {
      const maybeConvertHexOrColorName = await load();
      assert.deepStrictEqual(maybeConvertHexOrColorName('#0f8'), [0, 255, 136, 1]);
    });

    it('accepts a hex value with no leading #', async function () {
      const maybeConvertHexOrColorName = await load();
      assert.deepStrictEqual(maybeConvertHexOrColorName('0000ff'), [0, 0, 255, 1]);
    });

    it('looks up a named color', async function () {
      const maybeConvertHexOrColorName = await load();
      assert.deepStrictEqual(maybeConvertHexOrColorName('red'), [255, 0, 0, 1]);
    });

    it('returns null for an invalid value', async function () {
      const maybeConvertHexOrColorName = await load();
      assert.strictEqual(maybeConvertHexOrColorName('not-a-color'), null);
      assert.strictEqual(maybeConvertHexOrColorName('#zzzzzz'), null);
    });
  });

  describe('maybeParseRgbaColor (private helper)', function () {
    async function load() {
      const mod = await importAtomsModuleInternal(['core', 'color.ts'], ['maybeParseRgbaColor']);
      return mod.maybeParseRgbaColor as (s: string) => [number, number, number, number] | null;
    }

    it('parses "rgba(r, g, b, a)"', async function () {
      const maybeParseRgbaColor = await load();
      assert.deepStrictEqual(maybeParseRgbaColor('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 0.5]);
    });

    it('parses the bare "(r, g, b, a)" form (no "rgba" prefix)', async function () {
      const maybeParseRgbaColor = await load();
      assert.deepStrictEqual(maybeParseRgbaColor('(10, 20, 30, 1)'), [10, 20, 30, 1]);
    });

    it('returns null when a component is out of range', async function () {
      const maybeParseRgbaColor = await load();
      assert.strictEqual(maybeParseRgbaColor('rgba(300, 0, 0, 1)'), null);
    });

    it('returns null for a non-matching string', async function () {
      const maybeParseRgbaColor = await load();
      assert.strictEqual(maybeParseRgbaColor('rgb(1, 2, 3)'), null);
    });
  });

  describe('maybeParseRgbColor (private helper)', function () {
    async function load() {
      const mod = await importAtomsModuleInternal(['core', 'color.ts'], ['maybeParseRgbColor']);
      return mod.maybeParseRgbColor as (s: string) => [number, number, number, number] | null;
    }

    it('parses "rgb(r, g, b)", defaulting alpha to 1', async function () {
      const maybeParseRgbColor = await load();
      assert.deepStrictEqual(maybeParseRgbColor('rgb(10, 20, 30)'), [10, 20, 30, 1]);
    });

    it('returns null when a component is out of range', async function () {
      const maybeParseRgbColor = await load();
      assert.strictEqual(maybeParseRgbColor('rgb(999, 0, 0)'), null);
    });

    it('rejects a leading-zero component (not a valid CSS integer)', async function () {
      const maybeParseRgbColor = await load();
      assert.strictEqual(maybeParseRgbColor('rgb(01, 2, 3)'), null);
    });
  });
});
