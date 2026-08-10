import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {importAtomsModule, installDomGlobals} from '../helpers/atoms-module.js';

// jsdom does not implement `HTMLElement.contentEditable`/`.isContentEditable` at all (both read
// back as `undefined`), so a plain `contenteditable="true"` div doesn't look content-editable to
// atoms/src/core/dom.ts's `isContentEditable` under test. Faked here the same way a real
// `isContentEditable` getter would report it, without touching the module under test.
function makeContentEditableDiv(text = ''): HTMLDivElement {
  const div = document.createElement('div');
  div.textContent = text;
  Object.defineProperty(div, 'contentEditable', {value: 'true', configurable: true});
  Object.defineProperty(div, 'isContentEditable', {value: true, configurable: true});
  document.body.appendChild(div);
  return div;
}

async function loadSelection() {
  installDomGlobals();
  return importAtomsModule(['core', 'selection.ts']) as Promise<{
    setStart(textfield: Element, pos: number): void;
    getStart(textfield: Element): number;
    setEnd(textfield: Element, pos: number): void;
    getEnd(textfield: Element): number;
    getEndPoints(textfield: Element): [number, number];
    setCursorPosition(textfield: Element, pos: number): void;
    setText(textfield: Element, text: string): void;
    checkCanUpdateSelection(element: Element): void;
    supportsSelection(element: Element): boolean;
    getLength(element: Element): number;
  }>;
}

// Simulates atoms/src/core/keyboard.ts's `updateOnCharacter` character-by-character, the same
// sequence a real keypress loop drives.
function typeCharacter(selection: Awaited<ReturnType<typeof loadSelection>>, el: Element, character: string): void {
  const newPos = selection.getStart(el) + 1;
  assert.strictEqual(selection.supportsSelection(el), true);
  selection.setText(el, character);
  selection.setStart(el, newPos);
}

describe('atoms/src/core/selection.ts', function () {
  describe('supportsSelection', function () {
    it('is true for an <input>', async function () {
      const selection = await loadSelection();
      const input = document.createElement('input');
      assert.strictEqual(selection.supportsSelection(input), true);
    });

    it('is true for a content-editable element (issue #2803)', async function () {
      const selection = await loadSelection();
      assert.strictEqual(selection.supportsSelection(makeContentEditableDiv()), true);
    });

    it('is false for a plain, non-editable element', async function () {
      const selection = await loadSelection();
      assert.strictEqual(selection.supportsSelection(document.createElement('div')), false);
    });
  });

  describe('getLength', function () {
    it("returns an <input>'s value length", async function () {
      const selection = await loadSelection();
      const input = document.createElement('input');
      input.value = 'hello';
      assert.strictEqual(selection.getLength(input), 5);
    });

    it("returns a content-editable element's text length", async function () {
      const selection = await loadSelection();
      assert.strictEqual(selection.getLength(makeContentEditableDiv('hello')), 5);
    });
  });

  describe('typing into a content-editable element', function () {
    it('inserts typed characters at the cursor, one at a time', async function () {
      const selection = await loadSelection();
      const div = makeContentEditableDiv();

      for (const character of 'abc') {
        typeCharacter(selection, div, character);
      }

      assert.strictEqual(div.textContent, 'abc');
      assert.deepStrictEqual(selection.getEndPoints(div), [3, 3]);
    });

    it('replaces backspace-selected text, matching updateOnBackspaceOrDelete', async function () {
      const selection = await loadSelection();
      const div = makeContentEditableDiv();
      for (const character of 'abc') {
        typeCharacter(selection, div, character);
      }

      // Mirrors keyboard.ts's updateOnBackspaceOrDelete for a BACKSPACE with no existing selection.
      selection.checkCanUpdateSelection(div);
      let endpoints = selection.getEndPoints(div);
      assert.deepStrictEqual(endpoints, [3, 3]);
      selection.setStart(div, endpoints[1] - 1);
      selection.setEnd(div, endpoints[1]);

      endpoints = selection.getEndPoints(div);
      assert.deepStrictEqual(endpoints, [2, 3]);
      const textChanged = !(endpoints[0] === selection.getLength(div) || endpoints[1] === 0);
      assert.strictEqual(textChanged, true);
      selection.setText(div, '');

      assert.strictEqual(div.textContent, 'ab');
    });

    it('inserts in the middle of existing text when the cursor is repositioned', async function () {
      const selection = await loadSelection();
      const div = makeContentEditableDiv('ac');
      selection.setCursorPosition(div, 1);

      typeCharacter(selection, div, 'b');

      assert.strictEqual(div.textContent, 'abc');
    });
  });
});
