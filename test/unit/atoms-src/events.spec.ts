import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {importAtomsModule} from '../helpers/atoms-module.js';

// Regression coverage for https://github.com/appium/appium-remote-debugger/pull/527#discussion_r3745949530:
// on iOS 26.5, `TouchEvent.prototype.initTouchEvent` is still present alongside the standard
// `TouchEvent` constructor, and this module used to prefer the (broken, for us) former: it
// requires a genuine `TouchList` argument, but `toNativeTouches` only ever builds a plain
// `Touch[]`, so real devices threw `Argument ... must be an instance of TouchList` before any
// touch action could dispatch. The fix always uses the constructor, which accepts a plain array.
//
// atoms/src references `document`/`TouchEvent` as ambient globals (never imports them), resolved
// against whatever `installDomGlobals` (see ../helpers/atoms-module.ts) put on `globalThis` — so
// these tests build fixtures from that same global `document`, not a separate `new JSDOM(...)`
// instance, to stay in the same realm as the code under test. `document`/`TouchEvent` type-check
// here (unlike the rest of test/, which is plain Node) because this directory is carved out into
// its own DOM-lib-enabled project — see tsconfig.atoms-tests.json.
describe('atoms/src/core/events.ts', function () {
  function touchInfo(overrides: Partial<Record<string, number>> = {}) {
    return {
      identifier: 0,
      screenX: 0,
      screenY: 0,
      clientX: 10,
      clientY: 20,
      pageX: 10,
      pageY: 20,
      ...overrides,
    };
  }

  it('fires a touchstart event without throwing, even when the legacy initTouchEvent method is also present', async function () {
    const {fire, EventType} = await importAtomsModule(['core', 'events.ts']);
    const el = document.createElement('div');
    document.body.appendChild(el);

    // Simulates the iOS 26.5 environment: a WebKit build that still exposes the legacy method
    // alongside the standard constructor. If the fix regresses back to preferring this method,
    // calling it here throws, which fails the test below. `initTouchEvent` isn't part of
    // lib.dom's `TouchEvent` type (it was never standardized), hence the cast.
    (TouchEvent.prototype as unknown as {initTouchEvent: () => void}).initTouchEvent = () => {
      throw new Error('initTouchEvent should not be called: it requires a real TouchList, not a plain array');
    };
    try {
      const touches = [touchInfo()];
      const result = fire(el, EventType.TOUCHSTART, {
        touches,
        targetTouches: touches,
        changedTouches: touches,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        relatedTarget: null,
        scale: 1,
        rotation: 0,
        clientX: 10,
        clientY: 20,
      });
      assert.strictEqual(result, true);
    } finally {
      delete (TouchEvent.prototype as unknown as {initTouchEvent?: unknown}).initTouchEvent;
    }
  });

  it('dispatches a real TouchEvent whose touches/changedTouches carry the given coordinates', async function () {
    const {fire, EventType} = await importAtomsModule(['core', 'events.ts']);
    const el = document.createElement('div');
    document.body.appendChild(el);

    let seen: TouchEvent | null = null;
    el.addEventListener('touchstart', (e) => {
      seen = e as TouchEvent;
    });

    const touches = [touchInfo({clientX: 42, clientY: 99})];
    fire(el, EventType.TOUCHSTART, {
      touches,
      targetTouches: touches,
      changedTouches: touches,
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      relatedTarget: null,
      scale: 1,
      rotation: 0,
      clientX: 42,
      clientY: 99,
    });

    assert.ok(seen);
    const event: TouchEvent = seen;
    assert.strictEqual(event.touches.length, 1);
    assert.strictEqual(event.touches[0].clientX, 42);
    assert.strictEqual(event.touches[0].clientY, 99);
    assert.strictEqual(event.changedTouches.length, 1);
  });
});
