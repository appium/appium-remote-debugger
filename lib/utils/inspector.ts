import {util} from '@appium/support';
import type {StringRecord} from '@appium/types';
import type {AppInfo, AppDict, Page} from '../types';

export const WEB_CONTENT_BUNDLE_ID = 'com.apple.WebKit.WebContent';

const INACTIVE_APP_CODE = 0;

// values for the page `WIRTypeKey` entry
const ACCEPTED_PAGE_TYPES = [
  'WIRTypeWeb', // up to iOS 11.3
  'WIRTypeWebPage', // iOS 11.4
  'WIRTypePage', // iOS 11.4 webview
];

/**
 * Takes a dictionary from the remote debugger and converts it into a more
 * manageable AppInfo object with understandable keys.
 *
 * @param dict - Dictionary from the remote debugger containing application information.
 * @returns A tuple containing the application ID and the AppInfo object.
 */
export function appInfoFromDict(dict: Record<string, any>): [string, AppInfo] {
  const id = dict.WIRApplicationIdentifierKey;
  const isProxy =
    typeof dict.WIRIsApplicationProxyKey === 'string'
      ? dict.WIRIsApplicationProxyKey.toLowerCase() === 'true'
      : dict.WIRIsApplicationProxyKey;
  // automation enabled can be either from the keys
  //   - WIRRemoteAutomationEnabledKey (boolean)
  //   - WIRAutomationAvailabilityKey (string or boolean)
  let isAutomationEnabled: boolean | string = !!dict.WIRRemoteAutomationEnabledKey;
  if (Object.hasOwn(dict, 'WIRAutomationAvailabilityKey')) {
    if (typeof dict.WIRAutomationAvailabilityKey === 'string') {
      isAutomationEnabled =
        dict.WIRAutomationAvailabilityKey === 'WIRAutomationAvailabilityUnknown'
          ? 'Unknown'
          : dict.WIRAutomationAvailabilityKey === 'WIRAutomationAvailabilityAvailable';
    } else {
      isAutomationEnabled = !!dict.WIRAutomationAvailabilityKey;
    }
  }
  const entry: AppInfo = {
    id,
    isProxy,
    name: dict.WIRApplicationNameKey,
    bundleId: dict.WIRApplicationBundleIdentifierKey,
    hostId: dict.WIRHostApplicationIdentifierKey,
    isActive: dict.WIRIsApplicationActiveKey !== INACTIVE_APP_CODE,
    isAutomationEnabled,
  };

  return [id, entry];
}

/**
 * Takes a dictionary from the remote debugger and converts it into an array
 * of Page objects with understandable keys. Filters out non-web pages.
 *
 * @param pageDict - Dictionary from the remote debugger containing page information.
 * @returns An array of Page objects representing the available pages.
 */
export function pageArrayFromDict(pageDict: StringRecord): Page[] {
  return (
    Object.values(pageDict)
      // count only WIRTypeWeb pages and ignore all others (WIRTypeJavaScript etc)
      .filter(
        (dict) => dict.WIRTypeKey === undefined || ACCEPTED_PAGE_TYPES.includes(dict.WIRTypeKey),
      )
      .map((dict) => ({
        id: dict.WIRPageIdentifierKey,
        title: dict.WIRTitleKey,
        url: dict.WIRURLKey,
        isKey: dict.WIRConnectionIdentifierKey !== undefined,
      }))
  );
}

/**
 * Finds all application identifier keys that match the given bundle ID.
 * If no matches are found and the bundle ID is not WEB_CONTENT_BUNDLE_ID,
 * falls back to searching for WEB_CONTENT_BUNDLE_ID.
 *
 * @param bundleId - The bundle identifier to search for.
 * @param appDict - The application dictionary to search in.
 * @returns An array of unique application identifier keys matching the bundle ID.
 */
export function appIdsForBundle(bundleId: string, appDict: AppDict): string[] {
  const appIds: string[] = Object.entries(appDict)
    .filter(([, data]) => data.bundleId === bundleId)
    .map(([key]) => key);

  // if nothing is found, try to get the generic app
  if (appIds.length === 0 && bundleId !== WEB_CONTENT_BUNDLE_ID) {
    return appIdsForBundle(WEB_CONTENT_BUNDLE_ID, appDict);
  }

  return util.uniq(appIds);
}
