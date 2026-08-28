/**
 * Thrown when a cancellable delay is cancelled.
 */
export class DelayCancellation extends Error {
  constructor(message: string = 'Delay cancelled') {
    super(message);
    this.name = 'DelayCancellation';
  }
}

/**
 * Error thrown when an async operation exceeds the configured timeout.
 */
export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Thrown when alert/confirm/prompt operations are attempted but no dialog
 * is currently showing. Mirrors the W3C WebDriver 'no such alert' error.
 */
export class NoSuchAlertError extends Error {
  constructor(message: string = 'No such alert') {
    super(message);
    this.name = 'NoSuchAlertError';
  }
}

/**
 * Thrown when an operation is blocked because an unhandled dialog is open.
 * Mirrors the W3C WebDriver 'unexpected alert open' error.
 */
export class UnexpectedAlertOpenError extends Error {
  constructor(message: string = 'Unexpected alert open') {
    super(message);
    this.name = 'UnexpectedAlertOpenError';
  }
}

/**
 * Thrown when alert APIs are used against a target that cannot support them
 * (a non-Safari app, or Safari with Remote Automation disabled).
 */
export class UnsupportedAlertTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedAlertTargetError';
  }
}
