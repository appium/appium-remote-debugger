import {DelayCancellation} from './errors';

export type CancellableDelay = Promise<void> & {
  cancel: () => void;
};

/**
 * Returns a delay promise with a `cancel` method that rejects the promise.
 *
 * @param ms - Delay in milliseconds.
 * @returns A cancellable delay promise.
 */
export function cancellableDelay(ms: number): CancellableDelay {
  let timeoutId: NodeJS.Timeout | undefined;
  let rejectFn: ((error: Error) => void) | undefined;

  const promise = new Promise<void>((resolve, reject) => {
    rejectFn = reject;
    timeoutId = setTimeout(resolve, ms);
  }) as CancellableDelay;

  promise.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    rejectFn?.(new DelayCancellation());
    rejectFn = undefined;
  };

  return promise;
}
