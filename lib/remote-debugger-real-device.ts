import {RemoteDebugger} from './remote-debugger';
import {RpcClientRealDevice, RpcClientRealDeviceShim} from './rpc';
import {canUseWebInspectorShim} from './utils';
import type {RemoteDebuggerRealDeviceOptions} from './types';

export class RemoteDebuggerRealDevice extends RemoteDebugger {
  private readonly _udid!: string;
  private _useWebInspectorShim: boolean = false;

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

  override async initRpcClient(): Promise<void> {
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

    this._useWebInspectorShim = canUseWebInspectorShim(this._platformVersion as string);
    if (this._useWebInspectorShim) {
      const shimClient = new RpcClientRealDeviceShim(commonOpts);
      try {
        await shimClient.connect();
        this._rpcClient = shimClient;
        this.log.info(`Using WebInspector shim service for iOS ${this._platformVersion}`);
        return;
      } catch (err: any) {
        this.log.warn(
          `Failed to start WebInspector shim service: ${err.message}. ` +
            'Falling back to the legacy Web Inspector implementation.',
        );
        this._useWebInspectorShim = false;
      }
    }

    this._rpcClient = new RpcClientRealDevice(commonOpts);
  }
}

export default RemoteDebuggerRealDevice;
