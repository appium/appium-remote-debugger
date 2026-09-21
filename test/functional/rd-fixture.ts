import {after, afterEach, before, beforeEach} from 'node:test';

import {NativeSimctl, SimDeviceState, type SimDeviceInfo} from '@appium/coresim';
import {util} from '@appium/support';
import {retry, retryInterval} from 'asyncbox';

import {createRemoteDebugger} from '../../lib/index.js';
import type {RemoteDebugger} from '../../lib/remote-debugger.js';
import {startHttpServer, stopHttpServer} from './http-server.js';

export const PAGE_TITLE = 'Remote debugger test page';

const SIM_NAME = process.env.SIM_DEVICE_NAME || `appium-test-${util.uuidV4()}`;
const DEVICE_NAME = process.env.DEVICE_NAME || 'iPhone 17';
const PLATFORM_VERSION = process.env.PLATFORM_VERSION || '26.2';

const nativeSimctl = new NativeSimctl();

// CI only sets a major.minor PLATFORM_VERSION (e.g. '26.2'), while runtime.versionString can carry
// a patch component (e.g. '26.2.1') - compare only as many components as platformVersion specifies.
function matchesPlatformVersion(versionString: string, platformVersion: string): boolean {
  const actual = versionString.split('.');
  return platformVersion.split('.').every((part, i) => actual[i] === part);
}

async function getRuntimeIdentifier(platformVersion: string): Promise<string> {
  const runtime = (await nativeSimctl.getSupportedRuntimes()).find((r) =>
    matchesPlatformVersion(r.versionString, platformVersion),
  );
  if (!runtime) {
    throw new Error(`No supported runtime found for platform version '${platformVersion}'`);
  }
  return runtime.identifier;
}

async function getDeviceTypeIdentifier(deviceName: string): Promise<string> {
  const deviceType = (await nativeSimctl.getSupportedDeviceTypes()).find((d) => d.name === deviceName);
  if (!deviceType) {
    throw new Error(`No supported device type found for name '${deviceName}'`);
  }
  return deviceType.identifier;
}

async function getExistingDevice(deviceName: string, platformVersion: string): Promise<SimDeviceInfo | null> {
  const runtimeIdentifier = await getRuntimeIdentifier(platformVersion);
  const devices = await nativeSimctl.getDevices();
  return devices.find((device) => device.name === deviceName && device.runtimeIdentifier === runtimeIdentifier) ?? null;
}

async function deleteDeviceWithRetry(udid: string): Promise<void> {
  try {
    await retryInterval(10, 1000, () => nativeSimctl.deleteDevice(udid));
  } catch {}
}

export interface RdFixture {
  rd(): RemoteDebugger;
  address(): string;
  freshUrl(): string;
  selectTestPage(): Promise<void>;
}

/**
 * Registers node:test before/after/beforeEach/afterEach hooks that boot an iOS Simulator,
 * serve the test fixture page over HTTP, and connect a RemoteDebugger to Safari before each
 * test. Call once per describe block.
 */
export function useRemoteDebuggerFixture(): RdFixture {
  let udid: string;
  let simCreated = false;
  let address: string;
  let rd: RemoteDebugger;
  let navigationCounter = 0;

  before(async function () {
    const portPromise = startHttpServer();

    const existing = await getExistingDevice(DEVICE_NAME, PLATFORM_VERSION);
    if (existing) {
      udid = existing.udid;
    } else {
      const [deviceTypeIdentifier, runtimeIdentifier] = await Promise.all([
        getDeviceTypeIdentifier(DEVICE_NAME),
        getRuntimeIdentifier(PLATFORM_VERSION),
      ]);
      udid = (await nativeSimctl.createDevice(SIM_NAME, deviceTypeIdentifier, runtimeIdentifier)).udid;
      simCreated = true;
    }

    const devices = await nativeSimctl.getDevices();
    const state = devices.find((device) => device.udid === udid)?.state;
    if (state !== SimDeviceState.Booted && state !== SimDeviceState.Booting) {
      await nativeSimctl.bootDevice(udid);
    }
    await nativeSimctl.waitForBoot(udid, {
      timeoutMs: process.env.CI ? 600000 : 120000,
    });
    address = `http://127.0.0.1:${await portPromise}`;
  });
  after(async function () {
    try {
      await nativeSimctl.shutdownDevice(udid);
    } catch {}
    if (simCreated) {
      await deleteDeviceWithRetry(udid);
    }

    stopHttpServer();
  });

  beforeEach(async function () {
    const socketPath = await nativeSimctl.getWebInspectorSocket(udid);
    rd = createRemoteDebugger(
      {
        bundleId: 'com.apple.mobilesafari',
        isSafari: true,
        platformVersion: PLATFORM_VERSION,
        socketPath: socketPath || undefined,
        garbageCollectOnExecute: false,
        logAllCommunication: true,
        logAllCommunicationHexDump: false,
        pageReadyTimeout: 30000,
        targetCreationTimeoutMs: process.env.CI ? 10 * 1000 * 60 : 60000,
      },
      false,
    );

    const maxRetries = process.env.CI ? 10 : 5;
    await retry(maxRetries, async () => await nativeSimctl.openUrl(udid, address));
    await retry(maxRetries, async () => {
      if (Object.keys(await rd.connect(60000)).length === 0) {
        await rd.disconnect();
        throw new Error('The remote debugger did not return any connected applications');
      }
    });
    // A page's URL updates as soon as navigation starts, but its title (which tests match on
    // to find the test page) only updates once the document finishes loading. Wait for the
    // title here so every test starts with the page actually ready, instead of each test/helper
    // having to guard against seeing the previous page's stale title.
    await retryInterval(10, 500, async () => {
      if (!(await rd.selectApp(address)).some((page) => page.title === PAGE_TITLE)) {
        throw new Error('Test page not ready yet');
      }
    });
  });
  afterEach(async function () {
    await rd?.disconnect();
    rd = null as any;
  });

  return {
    rd: () => rd,
    address: () => address,
    // WebKit restores form control state (e.g. a checkbox's checked-ness) when navigating back
    // to a URL it's already seen, even in a brand-new Automation-created browsing context - so
    // two tests navigating to the exact same `address()` can see the previous test's DOM state
    // leak through (observed: a checkbox left checked by one test starts already-checked in the
    // next, so clicking it toggles it back off). A unique query string per navigation defeats
    // that reuse; `serve-static` ignores the query when resolving which file to serve.
    freshUrl: () => `${address}?_t=${++navigationCounter}`,
    async selectTestPage(): Promise<void> {
      // Safari's reported app/page dictionary can briefly churn (e.g. right after a previous
      // test navigated away, or while a stale tab from an earlier test is still settling), so
      // a single `selectApp` call can transiently miss the test page. Retry rather than fail.
      const page = await retryInterval(10, 500, async () => {
        const found = (await rd.selectApp(address)).find((page) => page.title === PAGE_TITLE);
        if (!found) {
          throw new Error('Test page not found');
        }
        return found;
      });
      if (!page) {
        throw new Error('Test page not found');
      }
      const pageIdStr = String(page.id);
      const [appIdKey, pageIdKey] = pageIdStr.split('.').map((id) => parseInt(id, 10));
      await rd.selectPage(appIdKey, pageIdKey);
    },
  };
}
