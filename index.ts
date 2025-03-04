import { RemoteDebugger, REMOTE_DEBUGGER_PORT } from './lib/remote-debugger';
import { RemoteDebuggerRealDevice } from './lib/remote-debugger-real-device';
import type { RemoteDebuggerRealDeviceOptions, RemoteDebuggerOptions } from './lib/types';

export function createRemoteDebugger<T extends boolean> (
  opts: T extends true ? RemoteDebuggerRealDeviceOptions : RemoteDebuggerOptions,
  realDevice: T
): T extends true ? RemoteDebuggerRealDevice : RemoteDebugger {
  return realDevice
    ? new RemoteDebuggerRealDevice(opts as RemoteDebuggerRealDeviceOptions)
    // @ts-ignore TS does not understand that
    : new RemoteDebugger(opts);
}

export { RemoteDebugger, RemoteDebuggerRealDevice, REMOTE_DEBUGGER_PORT };
export type { RemoteDebuggerRealDeviceOptions, RemoteDebuggerOptions };
