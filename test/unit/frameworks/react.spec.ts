import assert from 'node:assert/strict';
import {afterEach, describe, it} from 'node:test';

import {importAtomsModule} from '../helpers/atoms-module.js';
import {patchLayout} from '../helpers/layout.js';
import {mountReactFixture} from '../helpers/react-fixture.js';

// Unlike atoms.spec.ts/atoms-src/*.spec.ts's raw HTML fixtures, these exercise atoms against DOM
// rendered by a real React component (type/clear/click/submit/locators/isEnabled/etc.). Storage
// and frame/script-execution atoms are out of scope — they don't touch component-rendered DOM.
//
// Guards a real bug: React overrides a controlled input's `value` setter to track JS writes, so a
// plain `element.value = x` looks like a no-op and `onChange` never fires. `setElementValue`
// (atoms/src/core/dom-core.ts) fixes this by writing through the prototype's setter instead.
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
    // Regression guard: without setElementValue, the DOM updates but onChange never fires.
    assert.strictEqual(echo.textContent, 'hello');
  });

  it('clearing a controlled text input updates React state, not just the DOM value', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {clear} = await importAtomsModule(['core', 'action.ts']);
    // Pre-filled from the first render (not via type(), which would confound this with Case 1).
    const input = container.querySelector('#react-prefilled-input') as HTMLInputElement;
    const echo = container.querySelector('#react-prefilled-echo') as HTMLSpanElement;
    assert.strictEqual(echo.textContent, 'prefilled');

    clear(input);

    assert.strictEqual(input.value, '');
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

  it('finds and matches elements by CSS locator against React-rendered DOM', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {findElement, findElements} = await importAtomsModule(['core', 'locators', 'index.ts']);
    const checkbox = container.querySelector('#react-checkbox');
    const radios = container.querySelectorAll("input[name='react-color']");

    assert.strictEqual(findElement({'css selector': '#react-checkbox'}, container), checkbox);
    const found = findElements({'css selector': "input[name='react-color']"}, container);
    assert.strictEqual(found.length, radios.length);
    assert.strictEqual(found[0], radios[0]);
    assert.strictEqual(found[1], radios[1]);
  });

  it('reports the focused React-rendered element as the active element', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {activeElement} = await importAtomsModule(['core', 'frame.ts']);
    const otp0 = container.querySelector('#react-otp-0') as HTMLInputElement;
    otp0.focus();

    assert.strictEqual(activeElement(), otp0);
  });

  it('sees an element React conditionally shows via a re-render, not a JS-level style write', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {isShown} = await importAtomsModule(['core', 'dom.ts']);
    const bananaOption = container.querySelector('#react-select option[value="banana"]') as HTMLOptionElement;
    const conditional = container.querySelector('#react-conditional') as HTMLSpanElement;

    assert.strictEqual(isShown(conditional), false);

    click(bananaOption);

    assert.strictEqual(isShown(conditional), true);
  });

  it('distinguishes editable/focusable/interactable React elements from a disabled one', async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {isEditable, isFocusable, isInteractable} = await importAtomsModule(['core', 'dom.ts']);
    const input = container.querySelector('#react-text-input') as HTMLInputElement;
    const disabledButton = container.querySelector('#react-toggle-btn') as HTMLButtonElement;

    assert.strictEqual(isEditable(input), true);
    assert.strictEqual(isFocusable(input), true);
    assert.strictEqual(isInteractable(input), true);

    assert.strictEqual(isEditable(disabledButton), false);
    // isFocusable is tag-based, not enabled-state-based — that's isInteractable's job.
    assert.strictEqual(isFocusable(disabledButton), true);
    assert.strictEqual(isInteractable(disabledButton), false);
  });

  it("reads a React element's inline style via getEffectiveStyle", async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {getEffectiveStyle} = await importAtomsModule(['core', 'dom.ts']);
    const styled = container.querySelector('#react-styled') as HTMLSpanElement;

    // jsdom's getComputedStyle serializes a fully-opaque color in rgba() form.
    assert.strictEqual(getEffectiveStyle(styled, 'color'), 'rgba(255, 0, 0, 1)');
  });

  it("reads a React element's size and location", async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {getSize} = await importAtomsModule(['core', 'action.ts']);
    const {getLocationInView, getLocation} = await importAtomsModule(['webdriver', 'element.ts']);
    const input = container.querySelector('#react-text-input') as HTMLInputElement;

    // Values come from patchLayout()'s fixed box. Compared field-by-field, not with deepStrictEqual:
    // these return Size/Coordinate/Rect instances, which deepStrictEqual treats a plain object as
    // unequal to (it checks the prototype too).
    const size = getSize(input);
    assert.strictEqual(size.width, 100);
    assert.strictEqual(size.height, 20);

    const locationInView = getLocationInView(input);
    assert.strictEqual(locationInView.x, 0);
    assert.strictEqual(locationInView.y, 0);

    // getLocation returns a Rect (left/top), unlike getLocationInView's Coordinate (x/y) above.
    const location = getLocation(input);
    assert.strictEqual(location?.left, 0);
    assert.strictEqual(location?.top, 0);
    assert.strictEqual(location?.width, 100);
    assert.strictEqual(location?.height, 20);
  });

  it("submitting a React-rendered form fires the component's onSubmit handler", async function () {
    const {container, unmount: doUnmount} = await mountReactFixture(['react', 'AtomFixture.tsx']);
    unmount = doUnmount;
    patchLayout();

    const {submit} = await importAtomsModule(['core', 'action.ts']);
    const formInput = container.querySelector('#react-form-input') as HTMLInputElement;
    const echo = container.querySelector('#react-form-echo') as HTMLSpanElement;
    assert.strictEqual(echo.textContent, 'not-submitted');

    // Unlike click/change, React doesn't flush the resulting state update synchronously here, so
    // wait a tick — same as a real WebDriver caller, which always has a round-trip between commands.
    submit(formInput);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.strictEqual(echo.textContent, 'submitted');
  });
});
