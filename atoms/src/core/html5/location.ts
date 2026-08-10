import {BotError, ErrorCode} from '../error.js';

/**
 * Default parameters for `navigator.geolocation.getCurrentPosition`: retrieval of any cached
 * position with high accuracy within a 5s timeout.
 * @see http://dev.w3.org/geo/api/spec-source.html#position-options
 */
export const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: Infinity,
  timeout: 5000,
};

/**
 * Retrieves the geolocation of the device via `navigator.geolocation.getCurrentPosition`.
 */
export function getCurrentPosition(
  successCallback: PositionCallback,
  errorCallback?: PositionErrorCallback,
  options: PositionOptions = DEFAULT_OPTIONS,
  win: Window = window,
): void {
  if (win.navigator?.geolocation != null) {
    win.navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
  } else {
    throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Geolocation undefined');
  }
}
