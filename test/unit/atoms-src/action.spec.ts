import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {importAtomsModule} from '../helpers/atoms-module.js';
import {patchLayout} from '../helpers/layout.js';

describe('atoms/src/core/action.ts', function () {
  describe('clear', function () {
    it("fires 'input' then 'change', and never the insertion-only 'textInput' (PR #536 review)", async function () {
      const {clear} = await importAtomsModule(['core', 'action.ts']);
      patchLayout();
      const input = document.createElement('input');
      input.value = 'prefilled';
      document.body.appendChild(input);
      const events: string[] = [];
      input.addEventListener('textInput', (e) => events.push(e.type));
      input.addEventListener('input', (e) => events.push(e.type));
      input.addEventListener('change', (e) => events.push(e.type));

      clear(input);

      // Clearing is a deletion, not an insertion: 'textInput' is spec'd for the latter only
      // (https://w3c.github.io/uievents/event-algo.html#fire-key-input-events), same reasoning
      // updateOnBackspaceOrDelete() in keyboard.ts follows for backspace/delete keystrokes.
      assert.deepStrictEqual(events, ['input', 'change']);
    });
  });
});
