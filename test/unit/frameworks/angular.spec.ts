import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';

import {mountAngularFixture} from '../helpers/angular-fixture.js';
import {importAtomsModule} from '../helpers/atoms-module.js';
import {patchLayout} from '../helpers/layout.js';

// Unlike atoms.spec.ts/atoms-src/*.spec.ts's raw HTML fixtures, these exercise atoms against DOM
// rendered by a real (zoneless) Angular component (type/clear/click/submit/locators/isEnabled/
// etc.), mirroring frameworks/react.spec.ts's cases, plus two specific to Angular's `@if`/`@for`
// control-flow blocks, which create/destroy real DOM nodes rather than just toggling style.
//
// Angular runs zoneless here (no zone.js), so — unlike React, which flushes discrete DOM events
// synchronously — a re-render only happens once `tick()` is called. Every test calls it after the
// atom interaction it's checking, standing in for the round trip a real WebDriver client always
// has between commands.
describe('Angular DOM compatibility', function () {
  let container: HTMLElement;
  let tick: () => void;
  let unmount: () => void;

  beforeEach(async function () {
    ({container, tick, unmount} = await mountAngularFixture(['angular', 'AtomFixture.ts']));
    patchLayout();
  });

  afterEach(function () {
    unmount();
  });

  it('typing into a bound text input updates Angular state, not just the DOM value', async function () {
    const {type} = await importAtomsModule(['webdriver', 'element.ts']);
    const input = container.querySelector('#ng-text-input') as HTMLInputElement;
    const echo = container.querySelector('#ng-text-echo') as HTMLSpanElement;

    type(input, 'hello');
    tick();

    assert.strictEqual(input.value, 'hello');
    assert.strictEqual(echo.textContent, 'hello');
  });

  it('clearing a bound text input updates Angular state, not just the DOM value', async function () {
    const {clear} = await importAtomsModule(['core', 'action.ts']);
    // Pre-filled from the first render (not via type(), which would confound this with the case above).
    const input = container.querySelector('#ng-prefilled-input') as HTMLInputElement;
    const echo = container.querySelector('#ng-prefilled-echo') as HTMLSpanElement;
    assert.strictEqual(echo.textContent, 'prefilled');

    clear(input);
    tick();

    assert.strictEqual(input.value, '');
    assert.strictEqual(echo.textContent, '');
  });

  it('clicking a bound checkbox updates Angular state, not just the DOM checked property', async function () {
    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {isSelected, getText} = await importAtomsModule(['webdriver', 'element.ts']);
    const checkbox = container.querySelector('#ng-checkbox') as HTMLInputElement;
    const echo = container.querySelector('#ng-checkbox-echo') as HTMLSpanElement;

    click(checkbox);
    tick();

    assert.strictEqual(checkbox.checked, true);
    assert.strictEqual(getText(echo), 'yes');
    assert.strictEqual(isSelected(checkbox), true);
  });

  it("a re-render toggles a button's disabled state, and isEnabled/get(disabled) see it", async function () {
    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {isEnabled} = await importAtomsModule(['core', 'dom.ts']);
    const {get} = await importAtomsModule(['webdriver', 'attribute.ts']);
    const checkbox = container.querySelector('#ng-checkbox') as HTMLInputElement;
    const button = container.querySelector('#ng-toggle-btn') as HTMLButtonElement;

    assert.strictEqual(isEnabled(button), false);
    assert.strictEqual(get(button, 'disabled'), 'true');

    click(checkbox);
    tick();

    assert.strictEqual(isEnabled(button), true);
    assert.strictEqual(get(button, 'disabled'), null);
  });

  it("clicking an <option> updates a bound <select>'s Angular state", async function () {
    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {getText} = await importAtomsModule(['webdriver', 'element.ts']);
    const select = container.querySelector('#ng-select') as HTMLSelectElement;
    const bananaOption = container.querySelector('#ng-select option[value="banana"]') as HTMLOptionElement;
    const echo = container.querySelector('#ng-select-echo') as HTMLSpanElement;

    click(bananaOption);
    tick();

    assert.strictEqual(select.value, 'banana');
    assert.strictEqual(getText(echo), 'banana');
  });

  it('clicking a radio button updates its bound Angular group state', async function () {
    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {isSelected} = await importAtomsModule(['webdriver', 'element.ts']);
    const red = container.querySelector('#ng-radio-red') as HTMLInputElement;
    const blue = container.querySelector('#ng-radio-blue') as HTMLInputElement;
    const echo = container.querySelector('#ng-radio-echo') as HTMLSpanElement;

    assert.strictEqual(isSelected(red), true);
    assert.strictEqual(isSelected(blue), false);

    click(blue);
    tick();

    assert.strictEqual(isSelected(red), false);
    assert.strictEqual(isSelected(blue), true);
    assert.strictEqual(echo.textContent, 'blue');
  });

  it('follows focus into a field moved to mid-typing via a ViewChild ref (appium/appium#16697)', async function () {
    const {type} = await importAtomsModule(['webdriver', 'element.ts']);
    const otp0 = container.querySelector('#ng-otp-0') as HTMLInputElement;
    const otp1 = container.querySelector('#ng-otp-1') as HTMLInputElement;
    otp0.focus();

    type(otp0, '12');

    // The focus() call inside the component's handler runs imperatively as part of the synchronous
    // event dispatch, independent of change detection, so no tick() is needed to observe it.
    assert.strictEqual(otp0.value, '1');
    assert.strictEqual(otp1.value, '2');
  });

  it('finds and matches elements by CSS locator against Angular-rendered DOM', async function () {
    const {findElement, findElements} = await importAtomsModule(['core', 'locators', 'index.ts']);
    const checkbox = container.querySelector('#ng-checkbox');
    const radios = container.querySelectorAll("input[name='ng-color']");

    assert.strictEqual(findElement({'css selector': '#ng-checkbox'}, container), checkbox);
    const found = findElements({'css selector': "input[name='ng-color']"}, container);
    assert.strictEqual(found.length, radios.length);
    assert.strictEqual(found[0], radios[0]);
    assert.strictEqual(found[1], radios[1]);
  });

  it('reports the focused Angular-rendered element as the active element', async function () {
    const {activeElement} = await importAtomsModule(['core', 'frame.ts']);
    const otp0 = container.querySelector('#ng-otp-0') as HTMLInputElement;
    otp0.focus();

    assert.strictEqual(activeElement(), otp0);
  });

  it('sees an element Angular conditionally shows via a re-render, not a JS-level style write', async function () {
    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {isShown} = await importAtomsModule(['core', 'dom.ts']);
    const bananaOption = container.querySelector('#ng-select option[value="banana"]') as HTMLOptionElement;
    const conditional = container.querySelector('#ng-conditional') as HTMLSpanElement;

    assert.strictEqual(isShown(conditional), false);

    click(bananaOption);
    tick();

    assert.strictEqual(isShown(conditional), true);
  });

  it('distinguishes editable/focusable/interactable Angular elements from a disabled one', async function () {
    const {isEditable, isFocusable, isInteractable} = await importAtomsModule(['core', 'dom.ts']);
    const input = container.querySelector('#ng-text-input') as HTMLInputElement;
    const disabledButton = container.querySelector('#ng-toggle-btn') as HTMLButtonElement;

    assert.strictEqual(isEditable(input), true);
    assert.strictEqual(isFocusable(input), true);
    assert.strictEqual(isInteractable(input), true);

    assert.strictEqual(isEditable(disabledButton), false);
    // isFocusable is tag-based, not enabled-state-based — that's isInteractable's job.
    assert.strictEqual(isFocusable(disabledButton), true);
    assert.strictEqual(isInteractable(disabledButton), false);
  });

  it("reads an Angular element's inline style via getEffectiveStyle", async function () {
    const {getEffectiveStyle} = await importAtomsModule(['core', 'dom.ts']);
    const styled = container.querySelector('#ng-styled') as HTMLSpanElement;

    // jsdom's getComputedStyle serializes a fully-opaque color in rgba() form.
    assert.strictEqual(getEffectiveStyle(styled, 'color'), 'rgba(255, 0, 0, 1)');
  });

  it("reads an Angular element's size and location", async function () {
    const {getSize} = await importAtomsModule(['core', 'action.ts']);
    const {getLocationInView, getLocation} = await importAtomsModule(['webdriver', 'element.ts']);
    const input = container.querySelector('#ng-text-input') as HTMLInputElement;

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

  it("submitting an Angular-rendered form fires the component's (submit) handler", async function () {
    const {submit} = await importAtomsModule(['core', 'action.ts']);
    const formInput = container.querySelector('#ng-form-input') as HTMLInputElement;
    const echo = container.querySelector('#ng-form-echo') as HTMLSpanElement;
    assert.strictEqual(echo.textContent, 'not-submitted');

    submit(formInput);
    tick();

    assert.strictEqual(echo.textContent, 'submitted');
  });

  it('finds an element that an `@if` block just inserted, and loses it once the block removes it', async function () {
    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {getText} = await importAtomsModule(['webdriver', 'element.ts']);
    const {findElement} = await importAtomsModule(['core', 'locators', 'index.ts']);
    const toggleBtn = container.querySelector('#ng-if-toggle-btn') as HTMLButtonElement;

    assert.strictEqual(container.querySelector('#ng-if-panel'), null);

    click(toggleBtn);
    tick();

    // Unlike react.spec.ts's style-toggled "conditional" case, `@if` destroys/creates a real DOM
    // node — the element found here didn't exist before this tick(), so it must be re-queried.
    const content = findElement({'css selector': '#ng-if-content'}, container) as Element;
    assert.strictEqual(getText(content), 'Panel content');

    click(toggleBtn);
    tick();

    assert.strictEqual(container.querySelector('#ng-if-panel'), null);
  });

  it('finds elements an `@for` block adds to a live list after a signal update', async function () {
    const {click} = await importAtomsModule(['core', 'action.ts']);
    const {findElements} = await importAtomsModule(['core', 'locators', 'index.ts']);
    const {getText} = await importAtomsModule(['webdriver', 'element.ts']);
    const addBtn = container.querySelector('#ng-for-add-btn') as HTMLButtonElement;
    const list = container.querySelector('#ng-for-list') as HTMLUListElement;

    const initial = findElements({'css selector': '.ng-for-item'}, list);
    assert.strictEqual(initial.length, 2);

    click(addBtn);
    tick();

    const updated = findElements({'css selector': '.ng-for-item'}, list);
    assert.strictEqual(updated.length, 3);
    assert.strictEqual(getText(updated[2] as Element), 'tag-2');
  });
});
