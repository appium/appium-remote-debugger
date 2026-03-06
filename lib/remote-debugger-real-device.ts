import {RemoteDebugger} from './remote-debugger';
import {RpcClientRealDevice, RpcClientRealDeviceShim} from './rpc';
import {requiresWebInspectorShim} from './utils';
import type {RemoteDebuggerRealDeviceOptions} from './types';

export class RemoteDebuggerRealDevice extends RemoteDebugger {
  private readonly _udid: string;
  private _useWebInspectorShim: boolean;

  constructor(opts: RemoteDebuggerRealDeviceOptions) {
    super(opts);
    this._udid = opts.udid;
    this._skippedApps = ['lockdownd'];
  }

  /**
   * Returns true if this instance is using the WebInspector shim service
   * (required for iOS 18+ real devices).
   */
  get useWebInspectorShim(): boolean {
    return this._useWebInspectorShim;
  }

  override initRpcClient (): void {
    const commonOpts = {
      bundleId: this._bundleId,
      platformVersion: this._platformVersion,
      isSafari: this._isSafari,
      logAllCommunication: this._logAllCommunication,
      logAllCommunicationHexDump: this._logAllCommunicationHexDump,
      socketChunkSize: this._socketChunkSize,
      webInspectorMaxFrameLength: this._webInspectorMaxFrameLength,
      udid: this._udid,
      pageLoadTimeoutMs: this._pageLoadMs,
    };

    this._useWebInspectorShim = requiresWebInspectorShim(this._platformVersion!);
    if (this._useWebInspectorShim) {
      this.log.info(`Using WebInspector shim service for iOS ${this._platformVersion}`);
      this._rpcClient = new RpcClientRealDeviceShim(commonOpts);
    } else {
      this._rpcClient = new RpcClientRealDevice(commonOpts);
    }
  }
}

export default RemoteDebuggerRealDevice;
