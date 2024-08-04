import {
  getDebuggerAppKey
} from '../../../lib/mixins/message-handlers';
import { MOCHA_TIMEOUT } from '../../helpers/helpers';
import RemoteDebugger from '../../../lib/remote-debugger';

describe('connect', function () {
  this.timeout(MOCHA_TIMEOUT);
  let chai;
  let expect;
  /** @type {RemoteDebugger} */
  let rd;

  before(async function () {
    chai = await import('chai');
    chai.should();
    expect = chai.expect;
  });

  this.beforeEach(function () {
    rd = new RemoteDebugger();
  });

  describe('getDebuggerAppKey', function () {
    it('should return the app key for the bundle', function () {
      rd._appDict = {
        ['42']: {
          bundleId: 'io.appium.bundle'
        }
      };
      getDebuggerAppKey.bind(rd)('io.appium.bundle').should.equal('42');
    });
    it('should return the app key for the bundle when proxied', function () {
      rd._appDict = {
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
      getDebuggerAppKey.bind(rd)('io.appium.bundle').should.equal('43');
    });
    it('should return undefined when there is no appropriate app', function () {
      rd._appDict = {};
      expect(getDebuggerAppKey.bind(rd)('io.appium.bundle')).to.not.exist;
    });
  });
});
