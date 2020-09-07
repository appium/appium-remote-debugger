import RemoteDebugger from './remote-debugger';
import { RpcClientRealDevice } from './rpc';


export default class RemoteDebuggerRealDevice extends RemoteDebugger {
  constructor (opts = {}) {
    super(opts);

    this.udid = opts.udid;

    this._skippedApps = ['lockdownd'];
  }

  initRpcClient () {
    this.rpcClient = new RpcClientRealDevice({
      bundleId: this.bundleId,
      platformVersion: this.platformVersion,
      isSafari: this.isSafari,
      host: this.host,
      port: this.port,
      socketPath: this.socketPath,
      messageProxy: this.remoteDebugProxy,
      logAllCommunication: this.logAllCommunication,
      logAllCommunicationHexDump: this.logAllCommunicationHexDump,
      socketChunkSize: this.socketChunkSize,
      webInspectorMaxFrameLength: this.webInspectorMaxFrameLength,
      udid: this.udid
    });
  }
}
