import {pageArrayFromDict, checkParams, appInfoFromDict} from '../../lib/utils';
import _ from 'lodash';
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
      const pageDict = _.defaults(
        {
          2: {
            WIRTypeKey: 'WIRTypeWebPage',
          },
        },
        basePageDict,
      );
      const pageArray = pageArrayFromDict(pageDict);
      expect(pageArray).to.have.length(2);
    });
    it('should not count WIRTypeWeb entries', function () {
      const pageDict = _.defaults(
        {
          2: {
            WIRTypeKey: 'WIRTypeJavaScript',
          },
        },
        basePageDict,
      );
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
});
