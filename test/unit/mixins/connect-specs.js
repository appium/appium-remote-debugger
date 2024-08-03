import {
  getPossibleDebuggerAppKeys
} from '../../../lib/mixins/connect';
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

  describe('getPossibleDebuggerAppKeys', function () {
    it('should return the app key of the specified bundleIds', function () {
      rd._appDict = {
        ['42']: {
          bundleId: 'io.appium.bundle1'
        },
        ['43']: {
          bundleId: 'io.appium.bundle2'
        },
      };
      expect(getPossibleDebuggerAppKeys.bind(rd)(['io.appium.bundle1'])).to.eql(['42']);
    });
    const webviewBundleIds = [
      'com.apple.WebKit.WebContent',
      'process-com.apple.WebKit.WebContent',
      'process-SafariViewService',
      'com.apple.SafariViewService',
      '*',
    ];
    for (const webviewBundleId of webviewBundleIds) {
      it(`should return the app key of ${webviewBundleId}`, function () {
        rd._appDict = {
          ['42']: {
            bundleId: webviewBundleId
          }
        };
        expect(getPossibleDebuggerAppKeys.bind(rd)([])).to.eql(['42']);
      });
    }
    it('should return the app key for the bundleIds when proxied', function () {
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
      expect(getPossibleDebuggerAppKeys.bind(rd)(['io.appium.bundle'])).to.eql(['42', '43']);
    });
    it('should return an empty array when there is no appropriate app', function () {
      rd._appDict = {};
      expect(getPossibleDebuggerAppKeys.bind(rd)('io.appium.bundle')).to.eql([]);
    });
    it('should return the all app keys when the bundlIds array includes a wildcard', function () {
      rd._appDict = {
        ['42']: {
          bundleId: 'io.appium.bundle1'
        },
        ['43']: {
          bundleId: 'io.appium.bundle2'
        },
      };
      expect(getPossibleDebuggerAppKeys.bind(rd)(['*'])).to.eql(['42', '43']);
    });
  });
});
