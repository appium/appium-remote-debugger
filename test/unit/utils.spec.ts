import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {TimeoutError, withTimeout} from 'asyncbox';

import {
  pageArrayFromDict,
  checkParams,
  appInfoFromDict,
  deepEqual,
  defaults,
  simpleStringify,
  canUseWebInspectorShim,
} from '../../lib/utils/index.js';

describe('utils', function () {
  describe('appInfoFromDict', function () {
    it('should return the id and entry for a dict', function () {
      const dict = {
        WIRApplicationIdentifierKey: '42',
        WIRApplicationNameKey: 'App Name',
        WIRApplicationBundleIdentifierKey: 'app.name',
        WIRIsApplicationProxyKey: 'false',
        WIRHostApplicationIdentifierKey: '43',
      };
      const [id, entry] = appInfoFromDict(dict);
      assert.strictEqual(id, dict.WIRApplicationIdentifierKey);
      assert.strictEqual(entry.id, dict.WIRApplicationIdentifierKey);
      assert.strictEqual(entry.name, dict.WIRApplicationNameKey);
      assert.strictEqual(entry.bundleId, dict.WIRApplicationBundleIdentifierKey);
      assert.strictEqual(entry.isProxy, dict.WIRIsApplicationProxyKey === 'true');
      assert.strictEqual(entry.hostId, dict.WIRHostApplicationIdentifierKey);
    });
  });
  describe('pageArrayFromDict', function () {
    const basePageDict = {
      1: {
        WIRTitleKey: 'Appium/welcome',
        WIRTypeKey: 'WIRTypeWeb',
        WIRURLKey: 'http://127.0.0.1:4723/welcome',
        WIRPageIdentifierKey: 1,
        WIRConnectionIdentifierKey: 'e777f792-c41e-4e5d-8722-68393af663b2',
      },
    };
    it('should return a valid page array', function () {
      const pageArray = pageArrayFromDict(basePageDict);
      assert.strictEqual(pageArray.length, 1);
    });
    it('should return a valid page array with 13.4-style type key', function () {
      const pageDict = {
        ...basePageDict,
        2: {
          WIRTypeKey: 'WIRTypeWebPage',
        },
      };
      const pageArray = pageArrayFromDict(pageDict);
      assert.strictEqual(pageArray.length, 2);
    });
    it('should not count WIRTypeWeb entries', function () {
      const pageDict = {
        ...basePageDict,
        2: {
          WIRTypeKey: 'WIRTypeJavaScript',
        },
      };
      const pageArray = pageArrayFromDict(pageDict);
      assert.strictEqual(pageArray.length, 1);
    });
  });
  describe('checkParams', function () {
    it('should not throw error when not missing parameters', function () {
      checkParams({one: 'first', two: 'second', three: 'third'});
    });
    it('should throw error when parameter is missing', function () {
      assert.throws(() => checkParams({one: 'first', two: null, three: 'third'}), {
        message: 'Missing parameter: two',
      });
    });
  });

  describe('deepEqual', function () {
    it('treats equivalent page arrays as equal for onPageChange comparisons', function () {
      const previousPages = pageArrayFromDict({
        1: {
          WIRTitleKey: 'Appium/welcome',
          WIRTypeKey: 'WIRTypeWeb',
          WIRURLKey: 'http://127.0.0.1:4723/welcome',
          WIRPageIdentifierKey: 1,
          WIRConnectionIdentifierKey: 'e777f792-c41e-4e5d-8722-68393af663b2',
        },
      });
      const currentPages = pageArrayFromDict({
        1: {
          WIRTitleKey: 'Appium/welcome',
          WIRTypeKey: 'WIRTypeWeb',
          WIRURLKey: 'http://127.0.0.1:4723/welcome',
          WIRPageIdentifierKey: 1,
          WIRConnectionIdentifierKey: 'e777f792-c41e-4e5d-8722-68393af663b2',
        },
      });

      assert.strictEqual(deepEqual(previousPages, currentPages), true);
    });
  });

  describe('simpleStringify', function () {
    it('returns a string for undefined input', function () {
      const result = simpleStringify(undefined);
      assert.strictEqual(typeof result, 'string');
      assert.strictEqual(result, 'undefined');
    });

    it('falls back safely when structuredClone fails', function () {
      const value = {
        name: 'example',
        fn() {},
      };
      const result = simpleStringify(value);
      assert.strictEqual(typeof result, 'string');
      assert.strictEqual(result, '{"name":"example"}');
    });
  });

  describe('defaults', function () {
    it('only applies fallback values for undefined keys', function () {
      const result = defaults({a: 1, b: undefined, c: null as null | number}, {b: 2, c: 3, d: 4});
      assert.deepStrictEqual(result, {a: 1, b: 2, c: null, d: 4});
    });
  });

  describe('canUseWebInspectorShim', function () {
    it('returns false when platform version is missing', function () {
      assert.strictEqual(canUseWebInspectorShim(undefined), false);
      assert.strictEqual(canUseWebInspectorShim(null), false);
      assert.strictEqual(canUseWebInspectorShim(''), false);
    });

    it('returns true only for iOS 18 and newer', function () {
      assert.strictEqual(canUseWebInspectorShim('17.5'), false);
      assert.strictEqual(canUseWebInspectorShim('18.0'), true);
    });
  });

  describe('withTimeout', function () {
    it('resolves when promise settles before timeout', async function () {
      const value = await withTimeout(Promise.resolve('ok'), 50);
      assert.strictEqual(value, 'ok');
    });

    it('rejects with TimeoutError on timeout', async function () {
      try {
        await withTimeout(new Promise<void>(() => {}), 5, 'timed out');
        throw new Error('Expected timeout');
      } catch (err: any) {
        assert.ok(err instanceof TimeoutError);
        assert.strictEqual(err.message, 'timed out');
      }
    });
  });
});
