import {describe, it} from 'node:test';

import {expect} from 'chai';

import {createRemoteDebugger} from '../../lib/index.js';

const UDID = process.env.DEVICE_UDID ?? '';
const PLATFORM_VERSION = process.env.PLATFORM_VERSION ?? '26';

describe('Real device Safari remote debugger', {skip: !process.env.DEVICE_UDID}, function () {
  it('should connect to Safari and execute JavaScript', async function () {
    const rd = createRemoteDebugger(
      {
        udid: UDID,
        bundleId: 'com.apple.mobilesafari',
        platformVersion: PLATFORM_VERSION,
        isSafari: true,
        includeSafari: false,
        logAllCommunication: false,
        logFullResponse: false,
        targetCreationTimeoutMs: 5000,
      },
      true,
    );

    try {
      await rd.connect(15000);

      const pages = await rd.selectApp(null, undefined, true);
      expect(pages).to.have.length.above(0, 'No Safari pages found');

      const page = pages[0];
      const [appIdKey, pageIdKey] = String(page.id).split('.');
      await rd.selectPage(appIdKey, pageIdKey, true);

      const title = await rd.execute('document.title');
      expect(title).to.be.a('string').and.not.be.empty;
    } finally {
      await rd.disconnect();
    }
  });
});
