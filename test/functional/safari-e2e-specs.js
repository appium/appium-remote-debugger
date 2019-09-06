import { getDevices, createDevice, deleteDevice, openUrl } from 'node-simctl';
import { getSimulator } from 'appium-ios-simulator';
import { retryInterval, retry } from 'asyncbox';
import UUID from 'uuid-js';
import _ from 'lodash';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { createRemoteDebugger } from '../..';
import { startHttpServer, stopHttpServer, PAGE_TITLE } from './http-server';
import B from 'bluebird';


chai.should();
chai.use(chaiAsPromised);

const SIM_NAME = process.env.SIM_DEVICE_NAME || `appium-test-${UUID.create().hex.toUpperCase()}`;
const DEVICE_NAME = process.env.DEVICE_NAME || 'iPhone 6';
const PLATFORM_VERSION = process.env.PLATFORM_VERSION || '12.1';

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
    return await retryInterval(10, 1000, async function () {
      const apps = await rd.connect();
      _.isEmpty(apps).should.be.equal(false);
      return apps;
    });
  }

  it('should be able to connect and get app', async function () {
    await connect(rd);
    const pageArray = await rd.selectApp(address);
    _.filter(pageArray, (page) => page.title === PAGE_TITLE)
      .should.have.length(1);
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
});
