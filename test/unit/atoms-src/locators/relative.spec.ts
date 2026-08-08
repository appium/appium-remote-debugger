import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {JSDOM} from 'jsdom';

import {importAtomsModuleInternal} from '../../helpers/atoms-module.js';

const NAMES = [
  'above',
  'below',
  'leftOf',
  'rightOf',
  'straightAbove',
  'straightBelow',
  'straightLeftOf',
  'straightRightOf',
  'near',
];

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

function makeEl(doc: Document, rect: RectLike): Element {
  const el = doc.createElement('div');
  (el as any).getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
  });
  return el;
}

describe('atoms/src/core/locators/relative.ts', function () {
  // A 100x100 anchor at (100, 100)-(200, 200); each filter is `filter(anchorEl)(candidateEl)`.
  const ANCHOR: RectLike = {left: 100, top: 100, width: 100, height: 100};

  describe('above / below / leftOf / rightOf (private helpers)', function () {
    it("above is true only for a candidate whose bottom edge is at/above the anchor's top edge", async function () {
      const {above} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      const candidateAbove = makeEl(window.document, {left: 120, top: 0, width: 60, height: 80}); // bottom=80
      const candidateOverlapping = makeEl(window.document, ANCHOR);
      assert.strictEqual(above(anchor)(candidateAbove), true);
      assert.strictEqual(above(anchor)(candidateOverlapping), false);
    });

    it("below is true only for a candidate whose top edge is at/below the anchor's bottom edge", async function () {
      const {below} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      const candidateBelow = makeEl(window.document, {left: 120, top: 220, width: 60, height: 80});
      const candidateOverlapping = makeEl(window.document, ANCHOR);
      assert.strictEqual(below(anchor)(candidateBelow), true);
      assert.strictEqual(below(anchor)(candidateOverlapping), false);
    });

    it("leftOf is true only for a candidate whose right edge is at/left of the anchor's left edge", async function () {
      const {leftOf} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      const candidateLeft = makeEl(window.document, {left: 0, top: 120, width: 80, height: 60});
      const candidateOverlapping = makeEl(window.document, ANCHOR);
      assert.strictEqual(leftOf(anchor)(candidateLeft), true);
      assert.strictEqual(leftOf(anchor)(candidateOverlapping), false);
    });

    it("rightOf is true only for a candidate whose left edge is at/right of the anchor's right edge", async function () {
      const {rightOf} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      const candidateRight = makeEl(window.document, {left: 220, top: 120, width: 80, height: 60});
      const candidateOverlapping = makeEl(window.document, ANCHOR);
      assert.strictEqual(rightOf(anchor)(candidateRight), true);
      assert.strictEqual(rightOf(anchor)(candidateOverlapping), false);
    });
  });

  describe('straightAbove / straightBelow / straightLeftOf / straightRightOf (private helpers)', function () {
    it('straightAbove additionally requires horizontal (column) overlap with the anchor', async function () {
      const {straightAbove} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      const aligned = makeEl(window.document, {left: 120, top: 0, width: 60, height: 80}); // x: [120,180] is inside [100,200]
      const notAligned = makeEl(window.document, {left: 300, top: 0, width: 60, height: 80}); // x: [300,360]
      assert.strictEqual(straightAbove(anchor)(aligned), true);
      assert.strictEqual(straightAbove(anchor)(notAligned), false);
    });

    it('straightBelow additionally requires horizontal (column) overlap with the anchor', async function () {
      const {straightBelow} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      const aligned = makeEl(window.document, {left: 120, top: 220, width: 60, height: 80});
      const notAligned = makeEl(window.document, {left: 300, top: 220, width: 60, height: 80});
      assert.strictEqual(straightBelow(anchor)(aligned), true);
      assert.strictEqual(straightBelow(anchor)(notAligned), false);
    });

    it('straightLeftOf additionally requires vertical (row) overlap with the anchor', async function () {
      const {straightLeftOf} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      const aligned = makeEl(window.document, {left: 0, top: 120, width: 80, height: 60}); // y: [120,180] is inside [100,200]
      const notAligned = makeEl(window.document, {left: 0, top: 300, width: 80, height: 60});
      assert.strictEqual(straightLeftOf(anchor)(aligned), true);
      assert.strictEqual(straightLeftOf(anchor)(notAligned), false);
    });

    it('straightRightOf additionally requires vertical (row) overlap with the anchor', async function () {
      const {straightRightOf} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      const aligned = makeEl(window.document, {left: 220, top: 120, width: 80, height: 60});
      const notAligned = makeEl(window.document, {left: 220, top: 300, width: 80, height: 60});
      assert.strictEqual(straightRightOf(anchor)(aligned), true);
      assert.strictEqual(straightRightOf(anchor)(notAligned), false);
    });
  });

  describe('near (private helper)', function () {
    it('is true for a candidate within the default 50px distance, false just outside it', async function () {
      const {near} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      // 40px gap above the anchor: within the default 50px "near" radius.
      const nearby = makeEl(window.document, {left: 100, top: 20, width: 100, height: 40});
      // 60px gap above the anchor: outside the default 50px radius.
      const farAway = makeEl(window.document, {left: 100, top: 0, width: 100, height: 40});
      assert.strictEqual(near(anchor)(nearby), true);
      assert.strictEqual(near(anchor)(farAway), false);
    });

    it('is never true for an element compared to itself', async function () {
      const {near} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      assert.strictEqual(near(anchor)(anchor), false);
    });

    it('honors an explicit distance override', async function () {
      const {near} = await importAtomsModuleInternal(['core', 'locators', 'relative.ts'], NAMES);
      const {window} = new JSDOM('');
      const anchor = makeEl(window.document, ANCHOR);
      const gap60 = makeEl(window.document, {left: 100, top: 0, width: 100, height: 40}); // 60px gap
      assert.strictEqual(near(anchor, 50)(gap60), false);
      assert.strictEqual(near(anchor, 100)(gap60), true);
    });
  });
});
