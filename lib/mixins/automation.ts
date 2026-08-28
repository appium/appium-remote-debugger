import {errors} from '@appium/base-driver';

import type {RemoteDebugger} from '../remote-debugger.js';
import {AutomationSession} from '../rpc/index.js';
import {SAFARI_BUNDLE_ID} from '../utils/index.js';
import {getAppDict, getAppIdKey, getAutomationSession, setAutomationSession} from './property-accessors.js';

/**
 * Starts (or reuses, for the same app) a WebKit `Automation` session and switches the
 * driven tab to a fresh browsing context it creates - this is the "switch to automation"
 * moment: from here, W3C commands should go through the returned session instead of atoms.
 *
 * @throws {import('@appium/base-driver').errors.SessionNotCreatedError} If no app is
 *         currently selected, or the selected app isn't Safari with Remote Automation enabled.
 */
export async function startAutomationSession(this: RemoteDebugger): Promise<AutomationSession> {
  const appIdKey = getAppIdKey(this);
  if (!appIdKey) {
    throw new errors.SessionNotCreatedError('Cannot start an automation session: no app is currently selected');
  }
  const appInfo = getAppDict(this)[appIdKey];
  if (appInfo?.bundleId !== SAFARI_BUNDLE_ID || appInfo.isAutomationEnabled !== true) {
    throw new errors.SessionNotCreatedError(
      `Cannot start an automation session: app '${appIdKey}' is not Safari with Remote Automation enabled`,
    );
  }

  const existing = getAutomationSession(this);
  if (existing?.isStarted && existing.trackedAppIdKey === appIdKey) {
    return existing;
  }

  const session = new AutomationSession(this.requireRpcClient(true), this.log);
  await session.start(appIdKey);
  setAutomationSession(this, session);
  return session;
}

/** Tears down the active automation session, if any. */
export async function stopAutomationSession(this: RemoteDebugger): Promise<void> {
  try {
    await getAutomationSession(this)?.stop();
  } finally {
    setAutomationSession(this, undefined);
  }
}
