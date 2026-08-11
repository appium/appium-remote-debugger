import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {JSDOM} from 'jsdom';

import {importAtomsModule, importAtomsModuleInternal} from '../helpers/atoms-module.js';

const NAMES = [
  'toCamelCase',
  'trimExcludingNonBreakingSpace',
  'concatenateCleanedLines',
  'getAreaRelativeRect',
  'appendVisibleTextLinesFromTextNode',
];

describe('atoms/src/core/dom.ts', function () {
  describe('toCamelCase (private helper)', function () {
    it('converts a kebab-case CSS property name to camelCase', async function () {
      const {toCamelCase} = await importAtomsModuleInternal(['core', 'dom.ts'], NAMES);
      assert.strictEqual(toCamelCase('background-color'), 'backgroundColor');
      assert.strictEqual(toCamelCase('color'), 'color');
    });
  });

  describe('trimExcludingNonBreakingSpace (private helper)', function () {
    it('trims regular leading/trailing whitespace', async function () {
      const {trimExcludingNonBreakingSpace} = await importAtomsModuleInternal(['core', 'dom.ts'], NAMES);
      assert.strictEqual(trimExcludingNonBreakingSpace('  \t hello \n '), 'hello');
    });

    it('leaves a leading/trailing non-breaking space untouched', async function () {
      const {trimExcludingNonBreakingSpace} = await importAtomsModuleInternal(['core', 'dom.ts'], NAMES);
      const nbsp = String.fromCharCode(0xa0);
      assert.strictEqual(trimExcludingNonBreakingSpace(`${nbsp}hello${nbsp}`), `${nbsp}hello${nbsp}`);
    });
  });

  describe('concatenateCleanedLines (private helper)', function () {
    it('joins lines with newlines, trims the overall result, and converts NBSP to a regular space', async function () {
      const {concatenateCleanedLines} = await importAtomsModuleInternal(['core', 'dom.ts'], NAMES);
      const nbsp = String.fromCharCode(0xa0);
      assert.strictEqual(concatenateCleanedLines(['  a  ', `b${nbsp}c`, '  ']), `a\nb c`);
    });
  });

  describe('getAreaRelativeRect (private helper)', function () {
    async function load() {
      const mod = await importAtomsModuleInternal(['core', 'dom.ts'], NAMES);
      return mod.getAreaRelativeRect as (el: any) => {left: number; top: number; width: number; height: number};
    }

    it('computes a rect for shape="rect"', async function () {
      const getAreaRelativeRect = await load();
      const {window} = new JSDOM('<map><area shape="rect" coords="10,20,110,70" /></map>');
      const area = window.document.querySelector('area')!;
      const rect = getAreaRelativeRect(area);
      assert.deepStrictEqual(
        {left: rect.left, top: rect.top, width: rect.width, height: rect.height},
        {
          left: 10,
          top: 20,
          width: 100,
          height: 50,
        },
      );
    });

    it('computes a bounding rect for shape="circle"', async function () {
      const getAreaRelativeRect = await load();
      const {window} = new JSDOM('<map><area shape="circle" coords="50,50,10" /></map>');
      const area = window.document.querySelector('area')!;
      const rect = getAreaRelativeRect(area);
      assert.deepStrictEqual(
        {left: rect.left, top: rect.top, width: rect.width, height: rect.height},
        {
          left: 40,
          top: 40,
          width: 20,
          height: 20,
        },
      );
    });

    it('returns a zero-size rect for an unsupported shape', async function () {
      const getAreaRelativeRect = await load();
      const {window} = new JSDOM('<map><area shape="default" coords="" /></map>');
      const area = window.document.querySelector('area')!;
      const rect = getAreaRelativeRect(area);
      assert.deepStrictEqual(
        {left: rect.left, top: rect.top, width: rect.width, height: rect.height},
        {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        },
      );
    });
  });

  describe('appendVisibleTextLinesFromTextNode (private helper)', function () {
    async function run(text: string, whitespace: string | null, textTransform: string | null): Promise<string> {
      const mod = await importAtomsModuleInternal(['core', 'dom.ts'], NAMES);
      const {window} = new JSDOM('');
      const textNode = window.document.createTextNode(text);
      const lines: string[] = [''];
      mod.appendVisibleTextLinesFromTextNode(textNode, lines, whitespace, textTransform);
      return lines.join('\n');
    }

    it('strips zero-width characters before they can be mistaken for regular spaces', async function () {
      const zeroWidthSpace = String.fromCharCode(0x200b);
      const result = await run(`a${zeroWidthSpace}b`, 'normal', null);
      assert.strictEqual(result, 'ab');
    });

    it('capitalizes the first letter of each word', async function () {
      const result = await run('hello world', 'normal', 'capitalize');
      assert.strictEqual(result, 'Hello World');
    });

    it('does not treat an underscore as a word separator (protects snake_case)', async function () {
      const result = await run('hello_world', 'normal', 'capitalize');
      assert.strictEqual(result, 'Hello_world');
    });

    it('uppercase/lowercase transforms apply to the whole text', async function () {
      assert.strictEqual(await run('Hello', 'normal', 'uppercase'), 'HELLO');
      assert.strictEqual(await run('Hello', 'normal', 'lowercase'), 'hello');
    });

    it('collapses runs of breaking whitespace to a single space for normal/nowrap', async function () {
      const result = await run('a   b\tc', 'normal', null);
      assert.strictEqual(result, 'a b c');
    });

    it('preserves whitespace runs (as non-breaking spaces) for pre/pre-wrap', async function () {
      const nbsp = String.fromCharCode(0xa0);
      const result = await run('a  b', 'pre', null);
      assert.strictEqual(result, `a${nbsp}${nbsp}b`);
    });
  });

  describe('getActiveElement (exported)', function () {
    it('pierces into an open shadow root to find the actual focused element (appium/appium#16697)', async function () {
      // document.activeElement alone only ever reports the shadow host, not the focused element
      // inside it, which broke keyboard focus-tracking for custom elements like a masked input.
      const {getActiveElement} = await importAtomsModule(['core', 'dom.ts']);
      const {window} = new JSDOM('<div id="host"></div>');
      const host = window.document.getElementById('host')!;
      const shadowRoot = host.attachShadow({mode: 'open'});
      const input = window.document.createElement('input');
      shadowRoot.appendChild(input);
      input.focus();

      assert.strictEqual(window.document.activeElement, host);
      assert.strictEqual(getActiveElement(window.document), input);
    });

    it('returns the top-level active element when there is no shadow root involved', async function () {
      const {getActiveElement} = await importAtomsModule(['core', 'dom.ts']);
      const {window} = new JSDOM('<input id="a"/>');
      const el = window.document.getElementById('a')!;
      el.focus();
      assert.strictEqual(getActiveElement(window.document), el);
    });

    it('falls back to the document body when nothing is explicitly focused', async function () {
      const {getActiveElement} = await importAtomsModule(['core', 'dom.ts']);
      const {window} = new JSDOM('<body></body>');
      assert.strictEqual(getActiveElement(window.document), window.document.body);
    });
  });
});
