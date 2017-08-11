// transpile:main

import net from 'net';
import bplistCreate from 'bplist-creator';
import bplistParse from 'bplist-parser';
import bufferpack from 'bufferpack';
import Promise from 'bluebird';
import { logger } from 'appium-support';

const log = logger.getLogger('RemoteDebugger');


const DEVICE_INFO = {
  name: 'iPhone Simulator',
  build: 'WP42FJ'
};

const APP_INFO = {
  'PID:42': {
    id: 'PID:42',
    name: 'app',
    bundleId: 'io.appium.bundle',
    isProxy: false,
    hostId: '',
    isActive: '1',
    isAutomationEnabled: false
  }
};

// a bunch of new app info structures to simulate
// the app getting proxied through other apps
const UPDATED_APP_INFO = [
  {
    id: 'PID:44',
    name: 'proxy app 1',
    bundleId: 'io.appium.bundle.proxy1',
    isProxy: true,
    hostId: 'PID:42',
    isActive: '1'
  },
  {
    id: 'PID:46',
    name: 'proxy app 1',
    bundleId: 'io.appium.bundle.proxy1',
    isProxy: true,
    hostId: 'PID:44',
    isActive: '1'
  },
  {
    id: 'PID:48',
    name: 'proxy app 1',
    bundleId: 'io.appium.bundle.proxy1',
    isProxy: true,
    hostId: 'PID:46',
    isActive: '1'
  },
  {
    id: 'PID:50',
    name: 'proxy app 1',
    bundleId: 'io.appium.bundle.proxy1',
    isProxy: true,
    hostId: 'PID:48',
    isActive: '1'
  }
];


/*
 * A fake remote debugger server that can be told to send certain
 * messages back to the client, and to return certain values.
 * Used for testing the client.
 */
class RemoteDebuggerServer {
  constructor () {
    this.server = null;
    this.client = null;
    this.pendingAppChange = false;
    this.appIdKey = 'PID:42';
    this.destinationKey = '2';
    this.app = 1;
    this.dataResponseValue = [];
  }

  _getConnectedApplicationList (num) {
    let data = {
      __selector: '_rpc_reportConnectedApplicationList:',
      __argument: {
        WIRApplicationDictionaryKey: [{
          WIRApplicationIdentifierKey: APP_INFO['PID:42'].id,
          WIRApplicationNameKey: APP_INFO['PID:42'].name,
          WIRApplicationBundleIdentifierKey: APP_INFO['PID:42'].bundleId,
          WIRIsApplicationProxyKey: APP_INFO['PID:42'].isProxy,
          WIRHostApplicationIdentifierKey: APP_INFO['PID:42'].hostId,
          WIRIsApplicationActiveKey: APP_INFO['PID:42'].isActive
        }]
      }
    };

    // add more
    if (num > UPDATED_APP_INFO+1) {
      // we only have so many to give!
      num = UPDATED_APP_INFO + 1;
    }
    for (let i = 0; i < num-1; i++) {
      let entry = UPDATED_APP_INFO[i];
      data.__argument.WIRApplicationDictionaryKey.push({[entry.id]: entry});
    }

    return data;
  }

  handleReportIdentifier () {
    let data = {
      __selector: '_rpc_reportSetup:',
      __argument: {
        WIRSimulatorNameKey: DEVICE_INFO.name,
        WIRSimulatorBuildKey: DEVICE_INFO.build
      }
    };
    this.send(data);

    if (this.dataResponseError) {
      data = {
        __selector: '_rpc_reportConnectedApplicationList:',
        __argument: {
          type: 'string',
          value: this.dataResponseError
        },
        wasThrown: true
      };
      this.dataResponseError = null;
    } else {
      data = this._getConnectedApplicationList(1);
    }
    this.send(data);
  }

  handleGetListing () {
    // if we have pending app change events, send them
    if (this.pendingAppChange) {
      this.changeApp(this.pendingAppChange, true);
      this.pendingAppChange = 0;
    }

    // need to send an app dictionary back
    let data = {
      __selector: '_rpc_applicationSentListing:',
      __argument: {
        WIRApplicationIdentifierKey: 'PID:42',
        WIRListingKey: {
          '1': {
            WIRTypeKey: 'WIRTypeWeb',
            WIRPageIdentifierKey: 1,
            WIRTitleKey: '',
            WIRURLKey: 'about:blank'
          }
        }
      }
    };
    this.send(data);
  }

  handleSocketData (plist) {
    let plistData = JSON.parse(plist.__argument.WIRSocketDataKey.toString('utf8'));

    let result = {};
    if (this.dataResponseError) {
      result = {
        result: {
          type: 'string',
          value: this.dataResponseError
        },
        wasThrown: true
      };
      this.dataResponseError = null;
    } else if (this.dataResponseValue.length > 0) {
      // add the response value
      result = {
        result: {
          type: 'string',
          value: this.dataResponseValue.shift()
        },
        wasThrown: false
      };
    }

    let dataKey = {
      result,
      id: plistData.id
    };
    dataKey = new Buffer(JSON.stringify(dataKey));
    let data = {
      __selector: '_rpc_applicationSentData:',
      __argument: {
        WIRDestinationKey: plist.__argument.WIRSenderKey,
        WIRApplicationIdentifierKey: plist.__argument.WIRApplicationIdentifierKey,
        WIRMessageDataKey: dataKey
      }
    };
    this.send(data);
  }

  changeApp (num = 1, immediate = true) {
    if (immediate) {
      if (num > UPDATED_APP_INFO.length-1) {
        // we only have a certain number of info to send
        num = UPDATED_APP_INFO.length - 1;
      }
      for (let i = 0; i < num; i++) {
        let data = {
          __selector: '_rpc_applicationConnected:',
          __argument: {
            WIRApplicationIdentifierKey: UPDATED_APP_INFO[this.app-1].id,
            WIRApplicationNameKey: UPDATED_APP_INFO[this.app-1].name,
            WIRApplicationBundleIdentifierKey: UPDATED_APP_INFO[this.app-1].bundleId,
            WIRIsApplicationProxyKey: UPDATED_APP_INFO[this.app-1].isProxy,
            WIRHostApplicationIdentifierKey: UPDATED_APP_INFO[this.app-1].hostId,
            WIRIsApplicationActiveKey: UPDATED_APP_INFO[this.app-1].isActive
          }
        };
        this.send(data);

        this.app++;
      }
    } else {
      this.pendingAppChange = num;
    }
  }

  sendPageInfoMessage (appIdKey) {
    let data = {
      __selector: '_rpc_applicationSentListing:',
      __argument: {
        WIRApplicationIdentifierKey: appIdKey,
        WIRListingKey: {
          '1': {
            WIRTypeKey: 'WIRTypeWeb',
            WIRPageIdentifierKey: 1,
            WIRTitleKey: '',
            WIRURLKey: 'about:blank'
          }
        }
      }
    };
    this.send(data);
  }

  sendFrameNavigationMessage () {
    let dataKey = {
      method: 'Page.frameNavigated',
      result: {},
      id: 1
    };
    dataKey = new Buffer(JSON.stringify(dataKey));
    let data = {
      __selector: '_rpc_applicationSentData:',
      __argument: {
        WIRDestinationKey: this.destinationKey,
        WIRApplicationIdentifierKey: this.appIdKey,
        WIRMessageDataKey: dataKey
      }
    };
    this.send(data);
  }

  setDataResponseError (error) {
    this.dataResponseError = error;
  }

  setDataResponseValue (value) {
    this.dataResponseValue.push(value);
  }

  async start () {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((c) => {
        this.client = c;
        c.on('end', () => {
          log.debug('client disconnected');
        });
        c.on('data', (data) => {
          let plist = bplistParse.parseBuffer(data.slice(4));

          if (!plist[0].__selector) {
            reject(new Error(`Unable to decipher plist: ${plist}`));
            return;
          }

          switch (plist[0].__selector) {
            case '_rpc_reportIdentifier:':
              this.handleReportIdentifier(plist[0]);
              break;
            case '_rpc_forwardGetListing:':
              this.handleGetListing(plist[0]);
              break;
            case '_rpc_forwardSocketSetup:':
              // do nothing
              break;
            case '_rpc_forwardSocketData:':
              this.handleSocketData(plist[0]);
              break;
            case '_rpc_forwardIndicateWebView:':
              reject(new Error(`NOT YET IMPLEMENTED: ${plist[0].__selector}`));
              break;
            default:
              this.client.write('do not compute');
          }
        });
      });

      // don't use the real port, or any open sims will break the tests
      this.server.listen(27754, '::1', () => {
        log.info(`server bound: ${JSON.stringify(this.server.address())}`);
        resolve();
      });
    });
  }

  async stop () {
    return new Promise((resolve) => {
      if (this.server) {
        if (this.client) {
          this.client.end();
        }
        this.server.close((err) => { // eslint-disable-line promise/prefer-await-to-callbacks
          resolve(`Stopped listening: ${err}`);
        });
      } else {
        resolve('Not listening.');
      }
    });
  }

  send (data) {
    let buf = bplistCreate(data);
    let length = bufferpack.pack('L', [buf.length]);
    this.client.write(Buffer.concat([length, buf]));
  }
}

export { RemoteDebuggerServer, APP_INFO, DEVICE_INFO };
