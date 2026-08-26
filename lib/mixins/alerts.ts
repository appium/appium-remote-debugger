import type {RemoteDebugger} from '../remote-debugger.js';
import {AutomationSession} from '../rpc/automation-session.js';
import type {AppIdKey} from '../types.js';
import {checkParams, NoSuchAlertError, SAFARI_BUNDLE_ID, UnexpectedAlertOpenError, UnsupportedAlertTargetError} from '../utils/index.js';
import {getAppDict, getAppIdKey, getAutomationSession, getPageIdKey, setAutomationSession} from './property-accessors.js';

/**
 * Establishes (or reuses) the Automation session for the current app and
 * resolves the browsing context handle for the currently selected page.
 * Throws {@link UnsupportedAlertTargetError} immediately, before attempting
 * any session handshake, if the target cannot support it at all.
 */
async function ensureAutomationReady(
  rd: RemoteDebugger,
): Promise<{session: AutomationSession; browsingContextHandle: string}> {
  const appIdKey = getAppIdKey(rd);
  const pageIdKey = getPageIdKey(rd);
  checkParams({appIdKey, pageIdKey});

  const appInfo = getAppDict(rd)[appIdKey as string];
  if (!appInfo || appInfo.bundleId !== SAFARI_BUNDLE_ID || appInfo.isAutomationEnabled !== true) {
    throw new UnsupportedAlertTargetError(
      `Alert handling requires Safari with Remote Automation enabled ` +
        `(Settings > Safari > Advanced > Remote Automation). ` +
        `Current app '${appInfo?.bundleId ?? appIdKey}' does not qualify.`,
    );
  }

  let session = getAutomationSession(rd);
  if (!session) {
    session = new AutomationSession(rd.requireRpcClient(), rd.log);
    setAutomationSession(rd, session);
  }
  await session.ensureStarted(appIdKey as AppIdKey);

  // pageIdKey may be a string or number depending on the caller, while pageArray entries
  // always carry whatever type the Web Inspector protocol reported - compare as strings
  const currentUrl = appInfo.pageArray?.find((page) => String(page.id) === String(pageIdKey))?.url ?? '';
  const browsingContextHandle = await session.getBrowsingContextHandle(currentUrl);
  return {session, browsingContextHandle};
}

/**
 * Maps WebKit's Automation-domain error message prefixes (`NoJavaScriptDialog`,
 * `UnexpectedAlertOpen`, ...) onto this library's typed alert errors.
 */
function classifyAutomationError(err: any): Error {
  const message: string = err?.message || '';
  if (message.includes('NoJavaScriptDialog')) {
    return new NoSuchAlertError(message);
  }
  if (message.includes('UnexpectedAlertOpen')) {
    return new UnexpectedAlertOpenError(message);
  }
  return err;
}

async function withAutomation<T>(
  rd: RemoteDebugger,
  operation: (session: AutomationSession, browsingContextHandle: string) => Promise<T>,
): Promise<T> {
  const {session, browsingContextHandle} = await ensureAutomationReady(rd);
  try {
    return await operation(session, browsingContextHandle);
  } catch (err: any) {
    throw classifyAutomationError(err);
  }
}

/** Gets the text of the currently showing JS alert/confirm/prompt dialog. */
export async function getAlertText(this: RemoteDebugger): Promise<string> {
  return await withAutomation(this, (session, browsingContextHandle) => session.getDialogMessage(browsingContextHandle));
}

/** Accepts the currently showing JS alert/confirm/prompt dialog. */
export async function acceptAlert(this: RemoteDebugger): Promise<void> {
  await withAutomation(this, (session, browsingContextHandle) => session.acceptDialog(browsingContextHandle));
}

/** Dismisses the currently showing JS alert/confirm/prompt dialog. */
export async function dismissAlert(this: RemoteDebugger): Promise<void> {
  await withAutomation(this, (session, browsingContextHandle) => session.dismissDialog(browsingContextHandle));
}

/** Sets the input text of the currently showing JS prompt dialog. */
export async function sendAlertText(this: RemoteDebugger, text: string): Promise<void> {
  await withAutomation(this, (session, browsingContextHandle) => session.setDialogUserInput(browsingContextHandle, text));
}
