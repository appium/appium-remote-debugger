import type { StringRecord } from '@appium/types';
import type B from 'bluebird';

export interface DeferredPromise {
  promise: B<any>;
  resolve: (...args: any[]) => void;
  reject: (err?: Error) => void;
}

export interface AppInfo {
  id: string;
  isProxy: boolean;
  name: string;
  bundleId: string;
  hostId?: string;
  isActive: boolean;
  isAutomationEnabled: boolean | string;
  pageArray?: Page[];
}

export interface AppPage {
  appIdKey: string;
  pageDict: Page;
}

export interface App {
  id: string;
  bundleId: string;
}

export interface Page {
  url: string;
  title: string;
  id: number | string;
  isKey: boolean;
  bundleId?: string;
}

export type AppDict = StringRecord<AppInfo>;
