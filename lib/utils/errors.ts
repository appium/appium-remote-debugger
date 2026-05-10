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
