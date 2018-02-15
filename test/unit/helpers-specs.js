// transpile:mocha

import { pageArrayFromDict, checkParams, appInfoFromDict, getDebuggerAppKey } from '../../lib/helpers';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';

let expect = chai.expect;
chai.should();
chai.use(chaiAsPromised);

describe('helpers', function () {
  describe('appInfoFromDict', function () {
    it('should return the id and entry for a dict', function () {
      let dict = {
        WIRApplicationIdentifierKey: '42',
        WIRApplicationNameKey: 'App Name',
        WIRApplicationBundleIdentifierKey: 'app.name',
        WIRIsApplicationProxyKey: 'false',
        WIRHostApplicationIdentifierKey: '43'
      };
      let [id, entry] = appInfoFromDict(dict);
      id.should.equal(dict.WIRApplicationIdentifierKey);
      entry.id.should.equal(dict.WIRApplicationIdentifierKey);
      entry.name.should.equal(dict.WIRApplicationNameKey);
      entry.bundleId.should.equal(dict.WIRApplicationBundleIdentifierKey);
      entry.isProxy.should.equal(dict.WIRIsApplicationProxyKey === 'true');
      entry.hostId.should.equal(dict.WIRHostApplicationIdentifierKey);
    });
  });
  describe('getDebuggerAppKey', function () {
    it('should return the app key for the bundle', function () {
      let appDict = {
        ['42']: {
          bundleId: 'io.appium.bundle'
        }
      };
      getDebuggerAppKey('io.appium.bundle', '8.3', appDict).should.equal('42');
    });
    it('should return the app key for the bundle when proxied', function () {
      let appDict = {
        ['42']: {
          bundleId: 'io.appium.bundle',
          isProxy: false
        },
        ['43']: {
          bundleId: 'io.appium.proxied.bundle',
          isProxy: true,
          hostId: '42'
        }
      };
      getDebuggerAppKey('io.appium.bundle', '8.3', appDict).should.equal('43');
    });
    it('should return undefined when there is no appropriate app', function () {
      expect(getDebuggerAppKey('io.appium.bundle', '8.3', {})).to.not.exist;
    });
  });
  describe('pageArrayFromDict', function () {
    let basePageDict = {
      1: {
        WIRTitleKey: 'Appium/welcome',
        WIRTypeKey: 'WIRTypeWeb',
        WIRURLKey: 'http://127.0.0.1:4723/welcome',
        WIRPageIdentifierKey: 1,
        WIRConnectionIdentifierKey: 'e777f792-c41e-4e5d-8722-68393af663b2'
      }
    };
    it('should return a valid page array', function () {
      let pageArray = pageArrayFromDict(basePageDict);
      pageArray.should.have.length(1);
    });
    it('should not count WIRTypeWeb entries', function () {
      let pageDict = _.defaults({
        2: {
          WIRTypeKey: 'WIRTypeJavaScript'
        }
      }, basePageDict);
      let pageArray = pageArrayFromDict(pageDict);
      pageArray.should.have.length(1);
    });
  });
  describe('checkParams', function () {
    it('should not return error when not missing parameters', function () {
      expect(checkParams({one: 'first', two: 'second', three: 'third'})).to.not.exist;
    });
    it('should return error when parameter is missing', function () {
      let errors = checkParams({one: 'first', two: null, three: 'third'});
      errors.should.have.length(1);
      errors[0].should.equal('two');
    });
  });
});
