import log from '../logger';
import {RpcClient} from './rpc-client';
import {services} from 'appium-ios-device';
import fs from 'fs/promises';
import fsSync from 'fs';

export class RpcClientRealDevice extends RpcClient {
  /**
   * @param {import('./rpc-client').RpcClientOptions} [opts={}]
   */
  constructor(opts = {}) {
    super(
      Object.assign(
        {
          shouldCheckForTarget: false,
        },
        opts,
      ),
    );
    this.fileWatcher = null;
    this.lastPosition = 0;
  }

  /**
   * @override
   */
  async connect() {
    this.service = await services.startWebInspectorService(this.udid, {
      osVersion: this.platformVersion,
      isSimulator: false,
      verbose: this.logAllCommunication,
      verboseHexDump: this.logAllCommunicationHexDump,
      socketChunkSize: this.socketChunkSize,
      maxFrameLength: this.webInspectorMaxFrameLength,
    });

    this.service.listenMessage(this.receive.bind(this));
    this.isConnected = true;

    // Start watching the file for new data to send
    this.startFileWatcher();
  }

  /**
   * @override
   */
  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    log.debug('Disconnecting from remote debugger');

    // Stop file watcher
    this.stopFileWatcher();

    await super.disconnect();
    this.service.close();
    this.isConnected = false;
  }

  /**
   * @override
   */
  async sendMessage(cmd) {
    this.service.sendMessage(cmd);
  }

  /**
   * @override
   */
  async receive(data) {
    if (!this.isConnected) {
      return;
    }

    if (data && data.__argument && data.__argument.WIRMessageDataKey) {
      const messageData = data.__argument.WIRMessageDataKey;
      // console.log(`<< Received message data: ${messageData.toString('utf8')}`);
      // append to a file in /tmp for debugging
      // await fs.appendFile(`/tmp/wir-message.bin`, messageData.toString('utf8'));
      await fs.appendFile('/tmp/wir-message.bin', messageData.toString('utf8') + require('os').EOL);
    }
    // @ts-ignore messageHandler must be defined here
    await this.messageHandler.handleMessage(data);
  }

  /**
   * Start watching the file for new data to send
   */
  startFileWatcher() {
    const filePath = '/tmp/wir-tobe-sent.bin';

    // Initialize last position to end of file if it exists
    if (fsSync.existsSync(filePath)) {
      const stats = fsSync.statSync(filePath);
      this.lastPosition = stats.size;
    }

    // Watch the file for changes
    this.fileWatcher = fsSync.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        this.handleFileChange(filePath);
      }
    });

    log.debug(`Started watching ${filePath} for new data to send`);
  }

  /**
   * Stop watching the file
   */
  stopFileWatcher() {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
      log.debug('Stopped file watcher');
    }
  }

  /**
   * Handle file change events and send new data
   */
  async handleFileChange(filePath) {
    try {
      const stats = fsSync.statSync(filePath);
      if (stats.size <= this.lastPosition) {
        return; // No new data
      }

      // Read new data
      const buffer = Buffer.alloc(stats.size - this.lastPosition);
      const fd = fsSync.openSync(filePath, 'r');
      fsSync.readSync(fd, buffer, 0, buffer.length, this.lastPosition);
      fsSync.closeSync(fd);

      // Update position
      this.lastPosition = stats.size;

      // Convert buffer to string and send
      const data = buffer.toString('utf8').trim();
      if (data) {
        log.debug(`Sending data from file: ${data}`);
        this.service.sendMessage(data);
      }
    } catch (error) {
      log.error(`Error handling file change: ${error.message}`);
    }
  }
}

export default RpcClientRealDevice;
