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
// these tests build fixtures from that same `globalThis.document`, not a separate `new
// JSDOM(...)` instance, to stay in the same realm as the code under test. No `lib.dom` types are
// available in this package's tsconfig (`types: ["node"]`), hence the `any` casts.
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
    const doc = (globalThis as any).document;
    const TouchEventCtor = (globalThis as any).TouchEvent;
    const el = doc.createElement('div');
    doc.body.appendChild(el);

    // Simulates the iOS 26.5 environment: a WebKit build that still exposes the legacy method
    // alongside the standard constructor. If the fix regresses back to preferring this method,
    // calling it here throws, which fails the test below.
    TouchEventCtor.prototype.initTouchEvent = () => {
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
      delete TouchEventCtor.prototype.initTouchEvent;
    }
  });

  it('dispatches a real TouchEvent whose touches/changedTouches carry the given coordinates', async function () {
    const {fire, EventType} = await importAtomsModule(['core', 'events.ts']);
    const doc = (globalThis as any).document;
    const el = doc.createElement('div');
    doc.body.appendChild(el);

    let seen: any = null;
    el.addEventListener('touchstart', (e: unknown) => {
      seen = e;
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
    assert.strictEqual(seen.touches.length, 1);
    assert.strictEqual(seen.touches[0].clientX, 42);
    assert.strictEqual(seen.touches[0].clientY, 99);
    assert.strictEqual(seen.changedTouches.length, 1);
  });
});
