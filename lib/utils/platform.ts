import {util} from '@appium/support';

/**
 * Determines if the WebInspector shim can be used based on the provided iOS platform version.
 * @param platformVersion - The iOS platform version string (e.g., "18.0", "17.5.1"), or undefined/null when unknown.
 * @returns true if the WebInspector shim can be used, false otherwise
 */
export function canUseWebInspectorShim(platformVersion: string | undefined | null): boolean {
  return !!platformVersion && util.compareVersions(platformVersion, '>=', '18.0');
}
