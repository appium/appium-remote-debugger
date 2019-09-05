import log from './logger';
import { RemoteDebugger } from './remote-debugger';
import RpcClientRealDevice from './rpc-client-real-device';


export default class RemoteDebuggerRealDevice extends RemoteDebugger {
  constructor (opts = {}) {
    super(opts);

    this.udid = opts.udid;

    this.skippedApps = ['lockdownd'];
  }

  async connect () {
    this.setup();

    // initialize the rpc client
    this.rpcClient = new RpcClientRealDevice({
      bundleId: this.bundleId,
      platformVersion: this.platformVersion,
      isSafari: this.isSafari,
      host: this.host,
      port: this.port,
      socketPath: this.socketPath,
      specialMessageHandlers: this.specialCbs,
      messageProxy: this.remoteDebugProxy,
      logFullResponse: this.logFullResponse,
      udid: this.udid
    });
    await this.rpcClient.connect();

    // get the connection information about the app
    try {
      const appInfo = await this.setConnectionKey();
      log.debug('Connected to application');
      return appInfo;
    } catch (err) {
      await this.disconnect();
      return null;
    }
  }
}
