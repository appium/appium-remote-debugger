import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from '@appium/base-driver';
import {util} from '@appium/support';
import {JSDOM} from 'jsdom';

import {getAtom, getScriptForAtom} from '../../lib/atoms.js';
import {convertJavascriptEvaluationResult} from '../../lib/utils/javascript.js';

const W3C_ELEMENT_KEY = util.W3C_WEB_ELEMENT_IDENTIFIER;

const FIXTURE_HTML = `<!doctype html><html><body>
  <div id="somediv">This is in #somediv</div>
  <div id="hiddendiv" style="display:none">hidden text</div>
  <input id="textinput" type="text" value="" />
  <input id="checkbox" type="checkbox" />
  <select id="theselect">
    <option id="opt1" value="a">A</option>
    <option id="opt2" value="b" selected>B</option>
  </select>
  <button id="disabledbtn" disabled>Disabled</button>
  <form id="theform" action="#"><input id="submitbtn" type="submit" value="Go" /></form>
  <iframe id="frame1" name="frame-one"></iframe>
</body></html>`;

// jsdom does not implement real CSS layout: every element reports a zero-size
// getBoundingClientRect/offset*/scroll* regardless of its actual visibility, which makes the
// atoms' visibility/interactability checks (bot.dom.isShown, getOverflowState, ...) treat every
// element as clipped and not shown. Give elements a plausible fixed box (matching computed
// display:none/visibility:hidden so genuinely hidden elements still report zero size) so the
// atoms' real algorithms run their normal path instead of always hitting the "not shown" case.
function patchLayout(window: JSDOM['window']): void {
  (window.Element.prototype as any).getBoundingClientRect = function (this: any) {
    const style = window.getComputedStyle(this);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return {x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0};
    }
    return {x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20};
  };
  for (const prop of ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight', 'offsetWidth', 'offsetHeight']) {
    Object.defineProperty(window.HTMLElement.prototype, prop, {
      configurable: true,
      get(): number {
        return prop.includes('Width') ? 100 : 20;
      },
    });
  }
}

function createDom(): JSDOM {
  const dom = new JSDOM(FIXTURE_HTML, {
    runScripts: 'dangerously',
    url: 'http://localhost/index.html',
    pretendToBeVisual: true,
  });
  patchLayout(dom.window);
  return dom;
}

async function runAtom(window: JSDOM['window'], atom: string, args: any[] = [], frames: string[] = []): Promise<any> {
  const script = await getScriptForAtom(atom, args, frames);
  return window.eval(script);
}

// `bot.inject.executeScript`/`executeAsyncScript` only JSON-stringify their `{status, value}`
// envelope when explicitly asked to (`opt_stringify`); the real Runtime.evaluate wire always
// crosses a JSON round-trip regardless, landing back in this process's own realm. A raw
// `window.eval()` result stays in jsdom's realm, so round-trip it here to match production.
function crossRealmToLocal(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

// Atoms under the `webdriver.atoms.inject.*` namespace return a JSON string encoding
// `{status, value}` (Selenium's wire-protocol response shape, now with a W3C error string
// alongside the legacy status code on failure); this mirrors how
// `executeAtom`/`convertJavascriptEvaluationResult` unwrap a real Runtime.evaluate result.
async function runInjectAtom(
  window: JSDOM['window'],
  atom: string,
  args: any[] = [],
  frames: string[] = [],
): Promise<any> {
  return convertJavascriptEvaluationResult(await runAtom(window, atom, args, frames));
}

// A handful of atoms (bot.locators.findElement, webdriver.atoms.element.attribute.get,
// bot.dom.getEffectiveStyle, bot.dom.isEditable/isFocusable/isInteractable,
// bot.inject.cache.getElement) take a raw `!Element`/locator argument directly rather than the
// JSON-serializable `{ELEMENT: key}` handle the inject atoms use, so they can't go through
// `getScriptForAtom`'s arg-stringification. Build the invocation with the element looked up live
// inside the jsdom realm instead.
async function runFragmentAtom(window: JSDOM['window'], atom: string, rawArgs: string[]): Promise<any> {
  const atomSrc = (await getAtom(atom)).toString('utf8');
  return window.eval(`(${atomSrc})(${rawArgs.join(',')})`);
}

describe('atoms (green path, jsdom, mobile Safari)', function () {
  let dom: JSDOM;
  let window: JSDOM['window'];

  beforeEach(function () {
    dom = createDom();
    window = dom.window;
  });

  afterEach(function () {
    window.close();
  });

  describe('locators', function () {
    it('find_element_fragment finds an element by css selector', async function () {
      const el = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#somediv']);
      assert.strictEqual(typeof el.ELEMENT, 'string');
      // The W3C web element identifier must be present alongside the legacy key, with the same value.
      assert.strictEqual(el[W3C_ELEMENT_KEY], el.ELEMENT);
    });

    it('find_element_fragment returns null when nothing matches', async function () {
      assert.strictEqual(await runInjectAtom(window, 'find_element_fragment', ['css selector', '#nope']), null);
    });

    it('find_elements finds all matching elements', async function () {
      const els = await runInjectAtom(window, 'find_elements', ['css selector', 'div']);
      assert.strictEqual(els.length, 2);
    });

    it('find_element (fragment) locates the same node as a native DOM lookup', async function () {
      const found = await runFragmentAtom(window, 'find_element', [`{id: 'somediv'}`]);
      assert.strictEqual(found, window.document.getElementById('somediv'));
    });

    it('find_element_fragment accepts a root element referenced by either ELEMENT or the W3C key', async function () {
      const root = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#theform']);
      const viaLegacyKey = await runInjectAtom(window, 'find_element_fragment', [
        'css selector',
        '#submitbtn',
        {ELEMENT: root.ELEMENT},
      ]);
      const viaW3cKey = await runInjectAtom(window, 'find_element_fragment', [
        'css selector',
        '#submitbtn',
        {[W3C_ELEMENT_KEY]: root[W3C_ELEMENT_KEY]},
      ]);
      assert.strictEqual(typeof viaLegacyKey.ELEMENT, 'string');
      assert.strictEqual(viaW3cKey.ELEMENT, viaLegacyKey.ELEMENT);
    });
  });

  describe('errors', function () {
    it('a failed atom throws the Appium error class matching its W3C error string', async function () {
      await assert.rejects(
        runInjectAtom(window, 'find_element_fragment', ['css selector', '#somediv', {ELEMENT: 'bogus-cache-key'}]),
        errors.StaleElementReferenceError,
      );
    });

    it('a successful result shaped like an error (a plain `error` property) is not mistaken for a failure', async function () {
      const raw = await runAtom(window, 'execute_script', ['return {error: "not a real WebDriver error"};', []]);
      const result = convertJavascriptEvaluationResult(crossRealmToLocal(raw));
      assert.deepStrictEqual(result, {error: 'not a real WebDriver error'});
    });
  });

  describe('element state and text', function () {
    it('get_text returns the visible text of an element', async function () {
      const el = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#somediv']);
      assert.strictEqual(await runInjectAtom(window, 'get_text', [el]), 'This is in #somediv');
    });

    it('is_displayed is true for a visible element and false for display:none', async function () {
      const visible = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#somediv']);
      const hidden = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#hiddendiv']);
      assert.strictEqual(await runInjectAtom(window, 'is_displayed', [visible]), true);
      assert.strictEqual(await runInjectAtom(window, 'is_displayed', [hidden]), false);
    });

    it('is_enabled reflects the disabled attribute', async function () {
      const enabled = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#somediv']);
      const disabled = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#disabledbtn']);
      assert.strictEqual(await runInjectAtom(window, 'is_enabled', [enabled]), true);
      assert.strictEqual(await runInjectAtom(window, 'is_enabled', [disabled]), false);
    });

    it('is_selected reflects an option/checkbox selection state', async function () {
      const opt = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#opt2']);
      assert.strictEqual(await runInjectAtom(window, 'is_selected', [opt]), true);
    });

    it('get_size returns numeric element dimensions', async function () {
      const el = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#somediv']);
      const size = await runInjectAtom(window, 'get_size', [el]);
      assert.strictEqual(typeof size.width, 'number');
      assert.strictEqual(typeof size.height, 'number');
    });

    it('get_top_left_coordinates returns numeric x/y coordinates', async function () {
      const el = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#somediv']);
      const coords = await runInjectAtom(window, 'get_top_left_coordinates', [el]);
      assert.strictEqual(typeof coords.x, 'number');
      assert.strictEqual(typeof coords.y, 'number');
    });

    it('get_value_of_css_property returns a computed style value', async function () {
      const el = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#somediv']);
      assert.strictEqual(await runInjectAtom(window, 'get_value_of_css_property', [el, 'display']), 'block');
    });

    it('get_attribute_value and get_attribute (fragment) return the requested attribute', async function () {
      const el = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#somediv']);
      assert.strictEqual(await runInjectAtom(window, 'get_attribute_value', [el, 'id']), 'somediv');
      assert.strictEqual(
        await runFragmentAtom(window, 'get_attribute', [`document.getElementById('somediv')`, `'id'`]),
        'somediv',
      );
    });

    it('get_effective_style (fragment) returns a computed style value', async function () {
      assert.strictEqual(
        await runFragmentAtom(window, 'get_effective_style', [`document.getElementById('somediv')`, `'display'`]),
        'block',
      );
    });

    it('is_editable / is_focusable / is_interactable (fragment) reflect a normal text input', async function () {
      const elSrc = `document.getElementById('textinput')`;
      assert.strictEqual(await runFragmentAtom(window, 'is_editable', [elSrc]), true);
      assert.strictEqual(await runFragmentAtom(window, 'is_focusable', [elSrc]), true);
      assert.strictEqual(await runFragmentAtom(window, 'is_interactable', [elSrc]), true);
    });
  });

  describe('interaction', function () {
    it('type enters text, get_attribute_value reads it back, clear resets it', async function () {
      const el = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#textinput']);
      await runInjectAtom(window, 'type', [el, 'hello world']);
      assert.strictEqual(await runInjectAtom(window, 'get_attribute_value', [el, 'value']), 'hello world');
      await runInjectAtom(window, 'clear', [el]);
      assert.strictEqual(await runInjectAtom(window, 'get_attribute_value', [el, 'value']), '');
    });

    it('click toggles a checkbox', async function () {
      const el = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#checkbox']);
      assert.strictEqual(await runInjectAtom(window, 'is_selected', [el]), false);
      await runInjectAtom(window, 'click', [el]);
      assert.strictEqual(await runInjectAtom(window, 'is_selected', [el]), true);
    });

    it('submit does not throw for a form element', async function () {
      const el = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#theform']);
      await assert.doesNotReject(runInjectAtom(window, 'submit', [el]));
    });

    it('active_element and default_content return well-formed handles', async function () {
      const active = await runInjectAtom(window, 'active_element');
      assert.strictEqual(typeof active.ELEMENT, 'string');
      assert.strictEqual(active[W3C_ELEMENT_KEY], active.ELEMENT);
      assert.strictEqual(typeof (await runInjectAtom(window, 'default_content')).WINDOW, 'string');
    });
  });

  describe('frames', function () {
    it('frame_by_id_or_name, frame_by_index and get_frame_window resolve the iframe', async function () {
      assert.strictEqual(typeof (await runInjectAtom(window, 'frame_by_id_or_name', ['frame-one'])).WINDOW, 'string');
      assert.strictEqual(typeof (await runInjectAtom(window, 'frame_by_index', [0])).WINDOW, 'string');

      const frameEl = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#frame1']);
      assert.strictEqual(typeof (await runInjectAtom(window, 'get_frame_window', [frameEl])).WINDOW, 'string');
    });
  });

  describe('storage', function () {
    it('local storage: set/get/keys/size/key/remove/clear round-trip', async function () {
      assert.strictEqual(await runInjectAtom(window, 'get_local_storage_size'), 0);
      await runInjectAtom(window, 'set_local_storage_item', ['foo', 'bar']);
      assert.strictEqual(await runInjectAtom(window, 'get_local_storage_item', ['foo']), 'bar');
      assert.deepStrictEqual(await runInjectAtom(window, 'get_local_storage_keys'), ['foo']);
      assert.strictEqual(await runInjectAtom(window, 'get_local_storage_size'), 1);
      assert.strictEqual(await runFragmentAtom(window, 'get_local_storage_key', ['0']), 'foo');
      assert.strictEqual(await runInjectAtom(window, 'remove_local_storage_item', ['foo']), 'bar');
      assert.strictEqual(await runInjectAtom(window, 'get_local_storage_size'), 0);
      await runInjectAtom(window, 'set_local_storage_item', ['baz', 'qux']);
      await runInjectAtom(window, 'clear_local_storage');
      assert.strictEqual(await runInjectAtom(window, 'get_local_storage_size'), 0);
    });

    it('session storage: set/get/keys/size/key/remove/clear round-trip', async function () {
      assert.strictEqual(await runInjectAtom(window, 'get_session_storage_size'), 0);
      await runInjectAtom(window, 'set_session_storage_item', ['foo', 'bar']);
      assert.strictEqual(await runInjectAtom(window, 'get_session_storage_item', ['foo']), 'bar');
      assert.deepStrictEqual(await runInjectAtom(window, 'get_session_storage_keys'), ['foo']);
      assert.strictEqual(await runInjectAtom(window, 'get_session_storage_size'), 1);
      assert.strictEqual(await runFragmentAtom(window, 'get_session_storage_key', ['0']), 'foo');
      assert.strictEqual(await runInjectAtom(window, 'remove_session_storage_item', ['foo']), 'bar');
      assert.strictEqual(await runInjectAtom(window, 'get_session_storage_size'), 0);
      await runInjectAtom(window, 'set_session_storage_item', ['baz', 'qux']);
      await runInjectAtom(window, 'clear_session_storage');
      assert.strictEqual(await runInjectAtom(window, 'get_session_storage_size'), 0);
    });
  });

  describe('script execution', function () {
    it('execute_script runs arbitrary JS and returns the result', async function () {
      const raw = await runAtom(window, 'execute_script', ['return 1 + 1;', []]);
      assert.strictEqual(convertJavascriptEvaluationResult(crossRealmToLocal(raw)), 2);
    });

    it('execute_async_script invokes the provided callback with the result', async function () {
      const promiseName = 'atomsSpecAsyncResult';
      const asyncCallback = `function (res) { window.${promiseName} = res; }`;
      const script = await getScriptForAtom(
        'execute_async_script',
        ['arguments[arguments.length - 1](123);', [], 1000],
        [],
        asyncCallback,
      );
      window.eval(script);
      assert.strictEqual(convertJavascriptEvaluationResult(crossRealmToLocal((window as any)[promiseName])), 123);
    });
  });

  describe('html5 storage/geolocation', function () {
    it('get_location resolves the position via navigator.geolocation', async function () {
      (window.navigator as any).geolocation = {
        getCurrentPosition: (success: (pos: any) => void) =>
          success({coords: {latitude: 1, longitude: 2}, timestamp: 0}),
      };
      (window as any).__atomsSpecLocation = undefined;
      const src = (await getAtom('get_location')).toString('utf8');
      window.eval(`(${src})(function (pos) { window.__atomsSpecLocation = pos; })`);
      assert.strictEqual((window as any).__atomsSpecLocation.coords.latitude, 1);
    });
  });

  describe('element cache', function () {
    it('get_element_from_cache resolves a previously found element by its cache key', async function () {
      const el = await runInjectAtom(window, 'find_element_fragment', ['css selector', '#somediv']);
      const resolved = await runFragmentAtom(window, 'get_element_from_cache', [JSON.stringify(el.ELEMENT)]);
      assert.strictEqual(resolved, window.document.getElementById('somediv'));
    });
  });
});
