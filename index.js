import { RemoteDebugger, REMOTE_DEBUGGER_PORT } from './lib/remote-debugger';
import RemoteDebuggerRealDevice from './lib/remote-debugger-real-device';


function createRemoteDebugger (opts, realDevice = false) {
  if (realDevice) {
    return new RemoteDebuggerRealDevice(opts);
  } else {
    return new RemoteDebugger(opts);
  }
}

export {
  createRemoteDebugger, RemoteDebugger, RemoteDebuggerRealDevice,
  REMOTE_DEBUGGER_PORT,
};
