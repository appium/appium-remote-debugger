import {
  cancellableDelay,
  DelayCancellation,
  pageArrayFromDict,
  checkParams,
  appInfoFromDict,
  deepEqual,
  defaults,
  simpleStringify,
  canUseWebInspectorShim,
} from '../../lib/utils';
import {TimeoutError, withTimeout} from 'asyncbox';
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

  describe('canUseWebInspectorShim', function () {
    it('returns false when platform version is missing', function () {
      expect(canUseWebInspectorShim(undefined)).to.equal(false);
      expect(canUseWebInspectorShim(null)).to.equal(false);
      expect(canUseWebInspectorShim('')).to.equal(false);
    });

    it('returns true only for iOS 18 and newer', function () {
      expect(canUseWebInspectorShim('17.5')).to.equal(false);
      expect(canUseWebInspectorShim('18.0')).to.equal(true);
    });
  });

  describe('cancellableDelay', function () {
    it('resolves after the delay interval', async function () {
      await cancellableDelay(0);
    });

    it('rejects when cancelled', async function () {
      const delayed = cancellableDelay(50);
      delayed.cancel();

      try {
        await delayed;
        throw new Error('Expected cancellation rejection');
      } catch (err: any) {
        expect(err).to.be.instanceOf(DelayCancellation);
        expect(err.message).to.equal('Delay cancelled');
      }
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
