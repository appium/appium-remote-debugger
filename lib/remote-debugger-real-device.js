import RemoteDebugger from './remote-debugger';
import { RpcClientRealDevice } from './rpc';

/**
 * @typedef {Object} RemoteDebuggerRealDeviceOptions
 * @property {string} udid Real device UDID
 */

export default class RemoteDebuggerRealDevice extends RemoteDebugger {
  /** @type {string} */
  udid;

  /**
   * @param {RemoteDebuggerRealDeviceOptions & import('./remote-debugger').RemoteDebuggerOptions} opts
   */
  constructor (opts) {
    super(opts);

    this.udid = opts.udid;

    this._skippedApps = ['lockdownd'];
  }

  /**
   * @override
   */
  initRpcClient () {
    this.rpcClient = new RpcClientRealDevice({
      bundleId: this.bundleId,
      platformVersion: this.platformVersion,
      isSafari: this.isSafari,
      logAllCommunication: this.logAllCommunication,
      logAllCommunicationHexDump: this.logAllCommunicationHexDump,
      socketChunkSize: this.socketChunkSize,
      webInspectorMaxFrameLength: this.webInspectorMaxFrameLength,
      udid: this.udid,
    });
  }
}
