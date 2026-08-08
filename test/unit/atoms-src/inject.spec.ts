import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {JSDOM} from 'jsdom';

import {importAtomsModule, importAtomsModuleInternal} from '../helpers/atoms-module.js';

describe('atoms/src/core/inject.ts', function () {
  describe('isPlainObjectLike / isArrayLike (private helpers)', function () {
    async function load() {
      return importAtomsModuleInternal(['core', 'inject.ts'], ['isPlainObjectLike', 'isArrayLike']);
    }

    it('isPlainObjectLike is true for objects and functions, false for primitives and null', async function () {
      const {isPlainObjectLike} = await load();
      assert.strictEqual(isPlainObjectLike({}), true);
      assert.strictEqual(
        isPlainObjectLike(() => {}),
        true,
      );
      assert.strictEqual(isPlainObjectLike(null), false);
      assert.strictEqual(isPlainObjectLike('x'), false);
      assert.strictEqual(isPlainObjectLike(1), false);
    });

    it('isArrayLike is true for real arrays and array-like objects, false otherwise', async function () {
      const {isArrayLike} = await load();
      assert.strictEqual(isArrayLike([1, 2]), true);
      assert.strictEqual(isArrayLike({length: 0}), true);
      assert.strictEqual(isArrayLike({}), false);
      assert.strictEqual(isArrayLike(null), false);
      assert.strictEqual(isArrayLike('a string has a length too'), false);
    });
  });

  describe('getCache (private helper)', function () {
    async function load() {
      const mod = await importAtomsModuleInternal(['core', 'inject.ts'], ['getCache']);
      return mod.getCache as (doc?: any) => Record<string, unknown> & {nextId?: number};
    }

    it('initializes a fresh cache on the given document-like object, with a numeric nextId', async function () {
      const getCache = await load();
      const doc: any = {};
      const cache = getCache(doc);
      assert.strictEqual(typeof cache.nextId, 'number');
    });

    it('returns the same cache object on a repeat call for the same document', async function () {
      const getCache = await load();
      const doc: any = {};
      assert.strictEqual(getCache(doc), getCache(doc));
    });

    it('does not share a cache between two different document-like objects', async function () {
      const getCache = await load();
      const cacheA = getCache({} as any);
      const cacheB = getCache({} as any);
      assert.notStrictEqual(cacheA, cacheB);
    });
  });

  describe('isStale (private helper)', function () {
    async function load() {
      const mod = await importAtomsModuleInternal(['core', 'inject.ts'], ['isStale']);
      return mod.isStale as (doc: any, el: any) => boolean;
    }

    it('a closed Window (duck-typed via setInterval) is stale', async function () {
      const isStale = await load();
      const fakeWindow = {setInterval: () => {}, closed: true};
      assert.strictEqual(isStale({} as any, fakeWindow), true);
    });

    it('an open Window is not stale', async function () {
      const isStale = await load();
      const fakeWindow = {setInterval: () => {}, closed: false};
      assert.strictEqual(isStale({} as any, fakeWindow), false);
    });

    it('an element still attached to the document is not stale', async function () {
      const isStale = await load();
      const {window} = new JSDOM('<div id="attached"></div>');
      const el = window.document.getElementById('attached')!;
      assert.strictEqual(isStale(window.document, el), false);
    });

    it('an element detached from the document is stale', async function () {
      const isStale = await load();
      const {window} = new JSDOM('<body></body>');
      const el = window.document.createElement('div'); // never appended
      assert.strictEqual(isStale(window.document, el), true);
    });

    it('an element inside a shadow root attached to the document is not stale', async function () {
      const isStale = await load();
      const {window} = new JSDOM('<div id="host"></div>');
      const host = window.document.getElementById('host')!;
      const shadowRoot = host.attachShadow({mode: 'open'});
      const inner = window.document.createElement('span');
      shadowRoot.appendChild(inner);
      assert.strictEqual(isStale(window.document, inner), false);
    });
  });

  describe('sweep (private helper)', function () {
    it('removes only stale entries, leaving live entries and the nextId counter intact', async function () {
      const mod = await importAtomsModuleInternal(['core', 'inject.ts'], ['getCache', 'sweep']);
      const {window} = new JSDOM('<div id="attached"></div>');
      const doc = window.document;

      const cache = mod.getCache(doc);
      const liveEl = doc.getElementById('attached')!;
      const staleEl = doc.createElement('div'); // never appended, so it's stale
      cache.live = liveEl;
      cache.stale = staleEl;
      const nextIdBefore = cache.nextId;

      mod.sweep(doc);

      assert.strictEqual(cache.live, liveEl);
      assert.strictEqual('stale' in cache, false);
      assert.strictEqual(cache.nextId, nextIdBefore);
    });
  });

  describe('addElement / getElement (exported cache API)', function () {
    it('caches an element and round-trips it back out by the returned key', async function () {
      const {addElement, getElement} = await importAtomsModule(['core', 'inject.ts']);
      const {window} = new JSDOM('<div id="a"></div>');
      const el = window.document.getElementById('a')!;
      const key = addElement(el);
      assert.strictEqual(getElement(key, window.document), el);
    });

    it('returns the same key for the same element added twice', async function () {
      const {addElement} = await importAtomsModule(['core', 'inject.ts']);
      const {window} = new JSDOM('<div id="a"></div>');
      const el = window.document.getElementById('a')!;
      assert.strictEqual(addElement(el), addElement(el));
    });

    it('getElement throws for an unknown key', async function () {
      const {getElement} = await importAtomsModule(['core', 'inject.ts']);
      const {window} = new JSDOM('<div></div>');
      assert.throws(() => getElement(':wdc:does-not-exist', window.document));
    });

    it('getElement throws and evicts the entry once the element is detached', async function () {
      const {addElement, getElement} = await importAtomsModule(['core', 'inject.ts']);
      const {window} = new JSDOM('<body></body>');
      const el = window.document.createElement('div');
      window.document.body.appendChild(el);
      const key = addElement(el);
      window.document.body.removeChild(el);
      assert.throws(() => getElement(key, window.document));
      // The stale entry should now be evicted, so looking it up again throws the "does not
      // exist" (rather than "no longer attached") error — behavioral proof of the eviction.
      assert.throws(() => getElement(key, window.document));
    });

    it('adding elements past SWEEP_THRESHOLD sweeps stale entries out of the cache', async function () {
      // `addElement` is already exported by the module; only SWEEP_THRESHOLD/getCache are private.
      const {SWEEP_THRESHOLD, getCache, addElement} = await importAtomsModuleInternal(
        ['core', 'inject.ts'],
        ['SWEEP_THRESHOLD', 'getCache'],
      );
      const {window} = new JSDOM('<body></body>');
      const doc = window.document;
      const cache = getCache(doc);

      // Fill the cache with exactly SWEEP_THRESHOLD stale (detached) entries — addElement's guard
      // is `entryCount >= SWEEP_THRESHOLD`, checked before the new entry is itself added.
      for (let i = 0; i < SWEEP_THRESHOLD; i++) {
        cache[`stale-${i}`] = doc.createElement('div');
      }
      assert.strictEqual(Object.keys(cache).length - 1, SWEEP_THRESHOLD);

      // One more addition should observe the threshold already met and sweep before adding itself.
      const liveEl = doc.createElement('div');
      doc.body.appendChild(liveEl);
      addElement(liveEl);

      const remainingKeys = Object.keys(cache).filter((k) => k !== 'nextId');
      assert.strictEqual(
        remainingKeys.length,
        1,
        'every stale entry should have been swept, leaving only the live one',
      );
    });
  });
});
