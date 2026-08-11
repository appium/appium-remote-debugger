import assert from 'node:assert/strict';
import {afterEach, describe, it} from 'node:test';

import {importAtomsModule} from '../helpers/atoms-module.js';
import {patchLayout} from '../helpers/layout.js';
import {mountReactFixture} from '../helpers/react-fixture.js';

// Atoms are otherwise only tested against raw hand-written HTML fixtures (atoms.spec.ts,
// atoms-src/*.spec.ts). These tests instead exercise them against DOM rendered by a real React
// component, covering `type`/`clear` (core/keyboard.ts, core/selection.ts, core/action.ts),
// `click` (core/action.ts) against a checkbox, a <select>'s <option>, and a radio group,
// `isSelected`/`getText` (webdriver/element.ts), `get` (webdriver/attribute.ts), and `isEnabled`
// (core/dom.ts).
//
// This suite guards a real bug that used to exist here: React installs an instance-level override
// on a controlled input's `value` setter at mount time, to keep its internal `_valueTracker` in
// sync with every JS-level write, from any source. Writing `element.value = x` via *plain*
// assignment (as opposed to going through the `value` setter found on the element's *prototype*,
// bypassing any such instance-level override) resolves to that instance accessor, updating both
// the DOM value and React's own tracker together — so a synthetic `input`/`change` event dispatched
// afterwards looks like a no-op to React and its `onChange` never fires, even though the DOM value
// genuinely changed. `setElementValue` (atoms/src/core/dom-core.ts), used by keyboard.ts,
// selection.ts, and action.ts's `clear`/`type`, fixes this by always going through the prototype's
// setter — matching how a real, physical keystroke works, since that never runs through any JS
// setter at all. `click`-driven changes (toggling `.checked`, selecting an `<option>`) were never
// affected: they go through the browser's own native default action, not a JS-level write.
describe('React DOM compatibility', function () {
  let unmount: (() => void) | undefined;

  afterEach(function () {
    unmount?.();
    unmount = undefined;
  });

  it('typing into a controlled text input updates React state, not just the DOM value', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {type} = await importAtomsModule(['webdriver', 'element.ts']);
    const input = container.querySelector('#react-text-input') as HTMLInputElement;
    const echo = container.querySelector('#react-text-echo') as HTMLSpanElement;

    type(input, 'hello');

    assert.strictEqual(input.value, 'hello');
    // Regression guard for the `setElementValue` fix described above: without it, the DOM's
    // `.value` would update here but React's `onChange` would never fire, so its state (and
    // therefore this echo, which is rendered from that state) would never update either.
    assert.strictEqual(echo.textContent, 'hello');
  });

  it('clearing a controlled text input updates React state, not just the DOM value', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {clear} = await importAtomsModule(['core', 'action.ts']);
    // Starts genuinely pre-filled (both the DOM value and React's own state agree on 'prefilled'
    // from the first render — see AtomFixture.tsx's Case 6 comment). Deliberately not built via
    // `type()` first: since Case 1 may already leave React's state desynced from the DOM, layering
    // `clear()` on top of that would give the echo assertion below nothing real to prove either way.
    const input = container.querySelector('#react-prefilled-input') as HTMLInputElement;
    const echo = container.querySelector('#react-prefilled-echo') as HTMLSpanElement;
    assert.strictEqual(echo.textContent, 'prefilled');

    clear(input);

    assert.strictEqual(input.value, '');
    // Same underlying fix as the `type` test above: `clear` (core/action.ts) also goes through
    // `setElementValue` rather than writing `element.value = ''` directly.
    assert.strictEqual(echo.textContent, '');
  });

  it('clicking a controlled checkbox updates React state, not just the DOM checked property', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {isSelected, getText} = await importAtomsModule(['webdriver', 'element.ts']);
    const checkbox = container.querySelector('#react-checkbox') as HTMLInputElement;
    const echo = container.querySelector('#react-checkbox-echo') as HTMLSpanElement;

    click(checkbox);

    assert.strictEqual(checkbox.checked, true);
    assert.strictEqual(getText(echo), 'yes');
    assert.strictEqual(isSelected(checkbox), true);
  });

  it("a React re-render toggles a button's disabled state, and isEnabled/get(disabled) see it", async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {isEnabled} = await importAtomsModule(['core', 'dom.ts']);
    const {get} = await importAtomsModule(['webdriver', 'attribute.ts']);
    const checkbox = container.querySelector('#react-checkbox') as HTMLInputElement;
    const button = container.querySelector('#react-toggle-btn') as HTMLButtonElement;

    assert.strictEqual(isEnabled(button), false);
    assert.strictEqual(get(button, 'disabled'), 'true');

    click(checkbox);

    assert.strictEqual(isEnabled(button), true);
    assert.strictEqual(get(button, 'disabled'), null);
  });

  it("clicking an <option> updates a controlled <select>'s React state", async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {getText} = await importAtomsModule(['webdriver', 'element.ts']);
    const select = container.querySelector('#react-select') as HTMLSelectElement;
    const bananaOption = container.querySelector('#react-select option[value="banana"]') as HTMLOptionElement;
    const echo = container.querySelector('#react-select-echo') as HTMLSpanElement;

    click(bananaOption);

    assert.strictEqual(select.value, 'banana');
    assert.strictEqual(getText(echo), 'banana');
  });

  it('clicking a radio button updates its controlled React group state', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {isSelected} = await importAtomsModule(['webdriver', 'element.ts']);
    const red = container.querySelector('#react-radio-red') as HTMLInputElement;
    const blue = container.querySelector('#react-radio-blue') as HTMLInputElement;
    const echo = container.querySelector('#react-radio-echo') as HTMLSpanElement;

    assert.strictEqual(isSelected(red), true);
    assert.strictEqual(isSelected(blue), false);

    click(blue);

    assert.strictEqual(isSelected(red), false);
    assert.strictEqual(isSelected(blue), true);
    assert.strictEqual(echo.textContent, 'blue');
  });

  it('follows focus into a field a React re-render moves it to mid-typing (appium/appium#16697)', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {type} = await importAtomsModule(['webdriver', 'element.ts']);
    const otp0 = container.querySelector('#react-otp-0') as HTMLInputElement;
    const otp1 = container.querySelector('#react-otp-1') as HTMLInputElement;
    otp0.focus();

    type(otp0, '12');

    assert.strictEqual(otp0.value, '1');
    assert.strictEqual(otp1.value, '2');
  });
});
