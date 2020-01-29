import { getDevices, createDevice, deleteDevice, openUrl } from 'node-simctl';
import { getSimulator } from 'appium-ios-simulator';
import { retryInterval, retry } from 'asyncbox';
import UUID from 'uuid-js';
import _ from 'lodash';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { createRemoteDebugger } from '../..';
import { startHttpServer, stopHttpServer } from './http-server';
import B from 'bluebird';


chai.should();
chai.use(chaiAsPromised);

const SIM_NAME = process.env.SIM_DEVICE_NAME || `appium-test-${UUID.create().hex.toUpperCase()}`;
const DEVICE_NAME = process.env.DEVICE_NAME || 'iPhone 6';
const PLATFORM_VERSION = process.env.PLATFORM_VERSION || '12.1';

const PAGE_TITLE = 'Remote debugger test page';

async function getExistingSim (deviceName, platformVersion) {
  const devices = await getDevices(platformVersion);

  for (const device of _.values(devices)) {
    if (device.name === deviceName) {
      return await getSimulator(device.udid);
    }
  }

  return null;
}

async function deleteDeviceWithRetry (udid) {
  try {
    await retryInterval(10, 1000, deleteDevice, udid);
  } catch (ign) {}
}

describe('Safari remote debugger', function () {
  this.timeout(480000);
  this.retries(2);

  let sim;
  let simCreated = false;
  let address;
  before(async function () {
    sim = await getExistingSim(DEVICE_NAME, PLATFORM_VERSION);
    if (!sim) {
      const udid = await createDevice(SIM_NAME, DEVICE_NAME, PLATFORM_VERSION);
      sim = await getSimulator(udid);
      simCreated = true;
    }
    // on certain system, particularly Xcode 11 on Travis, starting the sim fails
    await retry(4, async function () {
      try {
        await sim.run({
          startupTimeout: 60000,
        });
      } catch (err) {
        await sim.shutdown();
        throw err;
      }
    });

    const port = await startHttpServer();
    address = `http://localhost:${port}`;
  });
  after(async function () {
    await sim.shutdown();
    if (simCreated) {
      await deleteDeviceWithRetry(sim.udid);
    }

    stopHttpServer();
  });

  let rd;
  beforeEach(async function () {
    rd = createRemoteDebugger({
      bundleId: 'com.apple.mobilesafari',
      isSafari: true,
      useNewSafari: true,
      pageLoadMs: 1000,
      platformVersion: PLATFORM_VERSION,
      socketPath: await sim.getWebInspectorSocket(),
      garbageCollectOnExecute: false,
      isSimulator: true,
      logAllCommunication: true,
      logAllCommunicationHexDump: false,
    }, false);

    await openUrl(sim.udid, address);
    // pause a moment while Safari loads
    await B.delay(2000);
  });
  afterEach(async function () {
    if (rd) {
      await rd.disconnect();
    }
    rd = null;
  });

  async function connect (rd) {
    await rd.connect();
    return await retryInterval(30, 1000, async function () {
      if (!_.isEmpty(rd.appDict)) {
        return rd.appDict;
      }
      await rd.setConnectionKey();
      throw new Error('No apps connected');
    });
  }

  it('should be able to connect and get app', async function () {
    await connect(rd);
    const pageArray = await rd.selectApp(address);
    _.filter(pageArray, (page) => page.title === PAGE_TITLE)
      .should.have.length.at.least(1);
  });

  it('should be able to execute an atom', async function () {
    await connect(rd);
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    const script = 'return 1 + 1;';
    const sum = await rd.executeAtom('execute_script', [script, []], []);
    sum.should.eql(2);
  });

  describe('executeAtomAsync', function () {
    const timeout = 1000;
    it('should be able to execute an atom asynchronously', async function () {
      await connect(rd);
      const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
      const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
      await rd.selectPage(appIdKey, pageIdKey);

      const script = 'arguments[arguments.length - 1](123);';
      await rd.executeAtomAsync('execute_async_script', [script, [], timeout], [])
        .should.eventually.eql(123);
    });

    it('should bubble up JS errors', async function () {
      await connect(rd);
      const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
      const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
      await rd.selectPage(appIdKey, pageIdKey);

      const script = `arguments[arguments.length - 1](1--);`;
      await rd.executeAtomAsync('execute_async_script', [script, [], timeout], [])
        .should.eventually.be.rejectedWith(/operator applied to value that is not a reference/);
    });

    it('should timeout when callback is not invoked', async function () {
      await connect(rd);
      const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
      const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
      await rd.selectPage(appIdKey, pageIdKey);

      const script = 'return 1 + 2';
      await rd.executeAtomAsync('execute_async_script', [script, [], timeout], [])
        .should.eventually.be.rejectedWith(/Timed out waiting for/);
    });
  });

  it(`should be able to call 'selectApp' after already connecting to app`, async function () {
    // this mimics the situation of getting all contexts multiple times
    await connect(rd);
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    const script = 'return 1 + 1;';
    const sum = await rd.executeAtom('execute_script', [script, []], []);
    sum.should.eql(2);

    await rd.selectApp(address);
  });

  it('should be able to get console logs from a remote page', async function () {
    await connect(rd);
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    let lines = [];
    rd.startConsole(function (err, line) {
      lines.push(line);
    });

    await rd.navToUrl('https://google.com');

    await rd.executeAtom('execute_script', [`console.log('hi from appium')`, []], []);

    // wait for the asynchronous console event to come in
    await retryInterval(50, 100, function () {
      lines.length.should.be.at.least(1);
      lines.filter((line) => line.text === 'hi from appium').length.should.eql(1);
    });
  });

  it('should be able to access the shadow DOM', async function () {
    function shadowScript (text) {
      return `return (function (elem) {
  return (function() {
    // element has a shadowRoot property
    if (this.shadowRoot) {
      return this.shadowRoot.querySelector('${text}')
    }
    // fall back to querying the element directly if not
    return this.querySelector('${text}')
  }).call(elem);
}).apply(null, arguments)`;
    }

    await connect(rd);
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    await rd.navToUrl(`${address}/shadow-dom.html`);

    // make sure the browser supports shadow DOM before running the test
    const shadowDomSupported = await rd.executeAtom('execute_script', ['return !!document.head.createShadowRoot || !!document.head.attachShadow;'], []);
    if (!shadowDomSupported) {
      return this.skip();
    }

    await retryInterval(5, 500, async function () {
      const el1 = await rd.executeAtom('find_element', ['class name', 'element', null], []);
      const sEl1 = await rd.executeAtom('execute_script', [shadowScript('#shadowContent'), [el1]], []);
      const sEl2 = await rd.executeAtom('execute_script', [shadowScript('#shadowSubContent'), [sEl1]], []);
      await rd.executeAtom('get_text', [sEl2], []).should.eventually.eql('It is murky in here');
    }).should.not.be.rejectedWith('Element is no longer attached to the DOM');
  });
});
