import assert from 'node:assert/strict';
import {afterEach, describe, it} from 'node:test';

import {importAtomsModule} from '../helpers/atoms-module.js';
import {patchLayout} from '../helpers/layout.js';
import {mountReactFixture} from '../helpers/react-fixture.js';

// Atoms are otherwise only tested against raw hand-written HTML fixtures (atoms.spec.ts,
// atoms-src/*.spec.ts). These tests instead exercise them against DOM rendered by a real React
// component, to catch a real, live risk: React installs an instance-level override on a
// controlled input's `value` setter at mount time to keep its internal `_valueTracker` in sync
// with every JS-level write, from any source. atoms/src/core/keyboard.ts and
// atoms/src/core/selection.ts set `.value` via plain assignment (e.g. `element.value =
// character`), not the native-property-descriptor-setter trick some testing libraries use to
// defeat that tracker — so a plain `.value =` could update the DOM while never triggering React's
// `onChange`.
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
    // If this fails while the assertion above passes, that's the real controlled-input risk
    // described above surfacing: the DOM's `.value` updated but React's `onChange` never fired,
    // so its state (and therefore this echo, which is rendered from that state) never did.
    assert.strictEqual(echo.textContent, 'hello');
  });

  it('clicking a controlled checkbox updates React state, not just the DOM checked property', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {isSelected} = await importAtomsModule(['webdriver', 'element.ts']);
    const checkbox = container.querySelector('#react-checkbox') as HTMLInputElement;
    const echo = container.querySelector('#react-checkbox-echo') as HTMLSpanElement;

    click(checkbox);

    assert.strictEqual(checkbox.checked, true);
    assert.strictEqual(echo.textContent, 'yes');
    assert.strictEqual(isSelected(checkbox), true);
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
