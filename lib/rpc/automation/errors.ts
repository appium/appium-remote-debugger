import {errorFromW3CJsonCode, errors} from '@appium/base-driver';

/**
 * WebKit tags every failed `Automation.*` command with one of its own well-known
 * `ErrorMessage` names as a prefix of the error text (see WebKit's `Automation.json` and
 * `WebAutomationSession::toProtocolString()`), e.g. `"WindowNotFound: <details>"`. This maps
 * those names to the matching `@appium/base-driver` W3C error class.
 *
 * `JavaScriptError` (WebKit's catch-all for a thrown in-page exception) is handled separately
 * in {@link mapAutomationError}, since our own atoms embed a more precise W3C error state in
 * that case - see the `AUTOMATION_OUTPUT_WRAPPER` in `scripts/build-atoms.mjs`.
 */
const WEBKIT_ERROR_MAP: Record<string, new (message?: string, cause?: Error) => Error> = {
  Timeout: errors.TimeoutError,
  JavaScriptTimeout: errors.ScriptTimeoutError,
  WindowNotFound: errors.NoSuchWindowError,
  FrameNotFound: errors.NoSuchFrameError,
  NodeNotFound: errors.StaleElementReferenceError,
  InvalidNodeIdentifier: errors.StaleElementReferenceError,
  InvalidElementState: errors.InvalidElementStateError,
  NoJavaScriptDialog: errors.NoAlertOpenError,
  NotImplemented: errors.NotImplementedError,
  MissingParameter: errors.InvalidArgumentError,
  InvalidParameter: errors.InvalidArgumentError,
  InvalidSelector: errors.InvalidSelectorError,
  ElementNotInteractable: errors.ElementNotInteractableError,
  ElementNotSelectable: errors.ElementIsNotSelectableError,
  ScreenshotError: errors.UnableToCaptureScreen,
  UnexpectedAlertOpen: errors.UnexpectedAlertOpenError,
  TargetOutOfBounds: errors.MoveTargetOutOfBoundsError,
  InternalError: errors.UnknownError,
};

// Not anchored to the start: rpc-client.ts's own transport layer prepends
// `Remote debugger error with code '<n>': ` ahead of WebKit's own message for errors that cross
// over a WIRSocketDataKey-wrapped command (which every `Automation.*` command does), so the
// WebKit-tagged name doesn't start the string. A tolerant (rather than literal) separator is used
// after the name, since we don't rely on WebKit's exact punctuation there (confirmed against a
// real Simulator to be `;`, not `: ` as WebKit's public protocol docs might suggest) - just not so
// tolerant that it eats a detail that itself starts with punctuation (e.g. our own atoms'
// JSON-embedded state, see below).
const WEBKIT_ERROR_PATTERN = new RegExp(
  `(?<![A-Za-z])(${Object.keys(WEBKIT_ERROR_MAP).join('|')}|JavaScriptError)(?![A-Za-z])[:;,-]?\\s*([\\s\\S]*)$`,
);

/**
 * Reclassifies a raw error from a failed `Automation.*` command into the matching W3C error,
 * if WebKit (or one of our own atoms - see `AUTOMATION_OUTPUT_WRAPPER`) tagged it as a known
 * problem. Falls through unchanged for anything neither one recognized.
 */
export function mapAutomationError(err: unknown): Error {
  if (!(err instanceof Error)) {
    return err as Error;
  }
  const match = WEBKIT_ERROR_PATTERN.exec(err.message);
  if (!match) {
    return err;
  }
  const [, webkitName, detail] = match;
  if (webkitName === 'JavaScriptError') {
    const w3cState = parseAtomErrorState(detail);
    return w3cState ? errorFromW3CJsonCode(w3cState.state, w3cState.message) : new errors.JavaScriptError(detail, err);
  }
  return new WEBKIT_ERROR_MAP[webkitName](detail, err);
}

/** Recovers the W3C error state our own atoms embed when they catch a `BotError` (see `scripts/build-atoms.mjs`). */
function parseAtomErrorState(detail: string): {state: string; message: string} | null {
  try {
    const parsed = JSON.parse(detail);
    return typeof parsed?.state === 'string' && typeof parsed?.message === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
