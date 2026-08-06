import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {useRemoteDebuggerFixture} from './rd-fixture.js';

describe('Safari remote debugger atoms', function () {
  const fixture = useRemoteDebuggerFixture();

  it('should be able to execute an atom', async function () {
    await fixture.selectTestPage();

    const script = 'return 1 + 1;';
    const sum = await fixture.rd().executeAtom('execute_script', [script, []]);
    assert.strictEqual(sum, 2);
  });

  it('should be able to find an element', async function () {
    await fixture.selectTestPage();

    const el = await fixture.rd().executeAtom('find_element_fragment', ['css selector', '#somediv']);
    const text = await fixture.rd().executeAtom('get_text', [el]);
    assert.strictEqual(text, 'This is in #somediv');
  });

  it('should be able to send text to an element and get attribute values', async function () {
    await fixture.selectTestPage();

    assert.strictEqual(await fixture.rd().isJavascriptExecutionBlocked(), false);
    const el = await fixture.rd().executeAtom('find_element_fragment', ['css selector', '#input']);
    let text = await fixture.rd().executeAtom('get_text', [el]);
    assert.strictEqual(text, '');
    await fixture.rd().executeAtom('type', [el, 'hello world']);

    text = await fixture.rd().executeAtom('get_attribute_value', [el, 'value']);
    assert.strictEqual(text, 'hello world');

    // clean up page
    await fixture.rd().executeAtom('execute_script', ['window.location.reload()']);
  });

  it('should be able to check element visibility and enabled state', async function () {
    await fixture.selectTestPage();

    const visibleEl = await fixture.rd().executeAtom('find_element_fragment', ['css selector', '#somediv']);
    assert.strictEqual(await fixture.rd().executeAtom('is_displayed', [visibleEl]), true);
    assert.strictEqual(await fixture.rd().executeAtom('is_enabled', [visibleEl]), true);

    const hiddenEl = await fixture.rd().executeAtom('find_element_fragment', ['css selector', '#hiddendiv']);
    assert.strictEqual(await fixture.rd().executeAtom('is_displayed', [hiddenEl]), false);
  });

  it('should be able to click a checkbox and read its selected state', async function () {
    await fixture.selectTestPage();

    const el = await fixture.rd().executeAtom('find_element_fragment', ['css selector', '#checkbox']);
    assert.strictEqual(await fixture.rd().executeAtom('is_selected', [el]), false);
    await fixture.rd().executeAtom('click', [el]);
    assert.strictEqual(await fixture.rd().executeAtom('is_selected', [el]), true);

    // clean up page
    await fixture.rd().executeAtom('execute_script', ['window.location.reload()']);
  });

  it('should be able to clear a text input', async function () {
    await fixture.selectTestPage();

    const el = await fixture.rd().executeAtom('find_element_fragment', ['css selector', '#input']);
    await fixture.rd().executeAtom('type', [el, 'some text']);
    assert.strictEqual(await fixture.rd().executeAtom('get_attribute_value', [el, 'value']), 'some text');
    await fixture.rd().executeAtom('clear', [el]);
    assert.strictEqual(await fixture.rd().executeAtom('get_attribute_value', [el, 'value']), '');

    // clean up page
    await fixture.rd().executeAtom('execute_script', ['window.location.reload()']);
  });

  it('should be able to round-trip local and session storage', async function () {
    await fixture.selectTestPage();

    await fixture.rd().executeAtom('set_local_storage_item', ['foo', 'bar']);
    assert.strictEqual(await fixture.rd().executeAtom('get_local_storage_item', ['foo']), 'bar');
    await fixture.rd().executeAtom('remove_local_storage_item', ['foo']);

    await fixture.rd().executeAtom('set_session_storage_item', ['foo', 'bar']);
    assert.strictEqual(await fixture.rd().executeAtom('get_session_storage_item', ['foo']), 'bar');
    await fixture.rd().executeAtom('remove_session_storage_item', ['foo']);
  });

  it('should be able to get the active element and default content', async function () {
    await fixture.selectTestPage();

    assert.ok((await fixture.rd().executeAtom('active_element', [])).ELEMENT);
    assert.ok((await fixture.rd().executeAtom('default_content', [])).WINDOW);
  });

  describe('executeAtomAsync', function () {
    const timeout = 1000;

    it('should be able to execute an atom asynchronously', async function () {
      await fixture.selectTestPage();

      const script = 'arguments[arguments.length - 1](123);';
      assert.strictEqual(await fixture.rd().executeAtomAsync('execute_async_script', [script, [], timeout]), 123);
    });

    it('should bubble up JS errors', async function () {
      await fixture.selectTestPage();

      const script = `arguments[arguments.length - 1](1--);`;
      await assert.rejects(
        fixture.rd().executeAtomAsync('execute_async_script', [script, [], timeout]),
        /operator applied to value that is not a reference/,
      );
    });

    it('should timeout when callback is not invoked', async function () {
      await fixture.selectTestPage();

      const script = 'return 1 + 2';
      await assert.rejects(
        fixture.rd().executeAtomAsync('execute_async_script', [script, [], timeout]),
        /Timed out waiting for/,
      );
    });

    it.skip('should be able to execute asynchronously in frame', async function () {
      await fixture.selectTestPage();

      // go to the frameset page
      await fixture.rd().navToUrl(`${fixture.address()}/frameset.html`);

      // get the correct frame
      const {WINDOW: frame} = await fixture.rd().executeAtom('frame_by_id_or_name', ['first']);
      const script = `arguments[arguments.length - 1](document.getElementsByTagName('h1')[0].innerHTML);`;
      const res = await fixture.rd().executeAtomAsync('execute_async_script', [script, [], timeout], [frame]);
      assert.strictEqual(res, 'Sub frame 1');
    });
  });
});
