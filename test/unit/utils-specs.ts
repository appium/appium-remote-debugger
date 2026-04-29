import {
  pageArrayFromDict,
  checkParams,
  appInfoFromDict,
  deepEqual,
  defaults,
  delay,
  isEmpty,
  isPlainObject,
  simpleStringify,
  TimeoutError,
  truncateString,
  uniq,
  withTimeout,
} from '../../lib/utils';
import {MOCHA_TIMEOUT} from '../helpers/helpers';
import {expect} from 'chai';

describe('utils', function () {
  this.timeout(MOCHA_TIMEOUT);

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
      expect(id).to.equal(dict.WIRApplicationIdentifierKey);
      expect(entry.id).to.equal(dict.WIRApplicationIdentifierKey);
      expect(entry.name).to.equal(dict.WIRApplicationNameKey);
      expect(entry.bundleId).to.equal(dict.WIRApplicationBundleIdentifierKey);
      expect(entry.isProxy).to.equal(dict.WIRIsApplicationProxyKey === 'true');
      expect(entry.hostId).to.equal(dict.WIRHostApplicationIdentifierKey);
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
      expect(pageArray).to.have.length(1);
    });
    it('should return a valid page array with 13.4-style type key', function () {
      const pageDict = {
        ...basePageDict,
        2: {
          WIRTypeKey: 'WIRTypeWebPage',
        },
      };
      const pageArray = pageArrayFromDict(pageDict);
      expect(pageArray).to.have.length(2);
    });
    it('should not count WIRTypeWeb entries', function () {
      const pageDict = {
        ...basePageDict,
        2: {
          WIRTypeKey: 'WIRTypeJavaScript',
        },
      };
      const pageArray = pageArrayFromDict(pageDict);
      expect(pageArray).to.have.length(1);
    });
  });
  describe('checkParams', function () {
    it('should not throw error when not missing parameters', function () {
      checkParams({one: 'first', two: 'second', three: 'third'});
    });
    it('should throw error when parameter is missing', function () {
      expect(() => checkParams({one: 'first', two: null, three: 'third'})).to.throw(
        'Missing parameter: two',
      );
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

      expect(deepEqual(previousPages, currentPages)).to.equal(true);
    });
  });

  describe('truncateString', function () {
    it('returns original value when within limit', function () {
      expect(truncateString('abc', 3)).to.equal('abc');
    });

    it('truncates and appends unicode ellipsis', function () {
      expect(truncateString('abcdef', 4)).to.equal('abc…');
    });
  });

  describe('simpleStringify', function () {
    it('returns a string for undefined input', function () {
      const result = simpleStringify(undefined);
      expect(result).to.be.a('string');
      expect(result).to.equal('undefined');
    });

    it('falls back safely when structuredClone fails', function () {
      const value = {
        name: 'example',
        fn() {},
      };
      const result = simpleStringify(value);
      expect(result).to.be.a('string');
      expect(result).to.equal('{"name":"example"}');
    });
  });

  describe('defaults', function () {
    it('only applies fallback values for undefined keys', function () {
      const result = defaults({a: 1, b: undefined, c: null as null | number}, {b: 2, c: 3, d: 4});
      expect(result).to.deep.equal({a: 1, b: 2, c: null, d: 4});
    });
  });

  describe('isPlainObject', function () {
    it('returns true for plain objects and null-prototype objects', function () {
      expect(isPlainObject({a: 1})).to.equal(true);
      expect(isPlainObject(Object.create(null))).to.equal(true);
    });

    it('returns false for arrays, null, and class instances', function () {
      class Example {}
      expect(isPlainObject([])).to.equal(false);
      expect(isPlainObject(null)).to.equal(false);
      expect(isPlainObject(new Example())).to.equal(false);
    });
  });

  describe('isEmpty', function () {
    it('returns true for empty collections and nullish values', function () {
      expect(isEmpty(undefined)).to.equal(true);
      expect(isEmpty(null)).to.equal(true);
      expect(isEmpty('')).to.equal(true);
      expect(isEmpty([])).to.equal(true);
      expect(isEmpty(new Set())).to.equal(true);
      expect(isEmpty({})).to.equal(true);
    });

    it('returns false for non-empty values', function () {
      expect(isEmpty('a')).to.equal(false);
      expect(isEmpty([1])).to.equal(false);
      expect(isEmpty(new Map([['k', 'v']]))).to.equal(false);
      expect(isEmpty({a: 1})).to.equal(false);
    });
  });

  describe('uniq', function () {
    it('deduplicates while preserving first-seen order', function () {
      expect(uniq(['b', 'a', 'b', 'c', 'a'])).to.deep.equal(['b', 'a', 'c']);
    });
  });

  describe('delay', function () {
    it('resolves asynchronously', async function () {
      let resolved = false;
      const promise = (async () => {
        await delay(0);
        resolved = true;
      })();
      expect(resolved).to.equal(false);
      await promise;
      expect(resolved).to.equal(true);
    });
  });

  describe('withTimeout', function () {
    it('resolves when promise settles before timeout', async function () {
      const value = await withTimeout(Promise.resolve('ok'), 50);
      expect(value).to.equal('ok');
    });

    it('rejects with TimeoutError on timeout', async function () {
      try {
        await withTimeout(new Promise<void>(() => {}), 5, 'timed out');
        throw new Error('Expected timeout');
      } catch (err: any) {
        expect(err).to.be.instanceOf(TimeoutError);
        expect(err.message).to.equal('timed out');
      }
    });
  });
});
