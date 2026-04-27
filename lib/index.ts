import {RemoteDebugger, REMOTE_DEBUGGER_PORT} from './remote-debugger';
import {RemoteDebuggerRealDevice} from './remote-debugger-real-device';
import type {RemoteDebuggerRealDeviceOptions, RemoteDebuggerOptions} from './types';

export function createRemoteDebugger(
  opts: RemoteDebuggerRealDeviceOptions,
  realDevice: true,
): RemoteDebuggerRealDevice;
export function createRemoteDebugger(
  opts: RemoteDebuggerOptions,
  realDevice: false,
): RemoteDebugger;
/**
 * Creates a remote debugger instance for either simulator or real device flows.
 *
 * @param opts - Configuration options for the selected debugger type.
 * @param realDevice - Whether to create the real-device debugger implementation.
 * @returns The initialized debugger instance for the selected target type.
 */
export function createRemoteDebugger(
  opts: RemoteDebuggerRealDeviceOptions | RemoteDebuggerOptions,
  realDevice: boolean,
): RemoteDebuggerRealDevice | RemoteDebugger {
  return realDevice
    ? new RemoteDebuggerRealDevice(opts as RemoteDebuggerRealDeviceOptions)
    : new RemoteDebugger(opts as RemoteDebuggerOptions);
}

export {RemoteDebugger, RemoteDebuggerRealDevice, REMOTE_DEBUGGER_PORT};
export type {RemoteDebuggerRealDeviceOptions, RemoteDebuggerOptions};
