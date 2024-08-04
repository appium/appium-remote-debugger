import RemoteDebugger from './remote-debugger';
import { RpcClientRealDevice } from './rpc';
import type { RemoteDebuggerRealDeviceOptions } from './types';

export class RemoteDebuggerRealDevice extends RemoteDebugger {
  private readonly _udid: string;

  constructor (opts: RemoteDebuggerRealDeviceOptions) {
    super(opts);
    this._udid = opts.udid;
    this._skippedApps = ['lockdownd'];
  }

  override initRpcClient (): void {
    this._rpcClient = new RpcClientRealDevice({
      bundleId: this._bundleId,
      platformVersion: this._platformVersion,
      isSafari: this._isSafari,
      logAllCommunication: this._logAllCommunication,
      logAllCommunicationHexDump: this._logAllCommunicationHexDump,
      socketChunkSize: this._socketChunkSize,
      webInspectorMaxFrameLength: this._webInspectorMaxFrameLength,
      udid: this._udid,
    });
  }
}

export default RemoteDebuggerRealDevice;
