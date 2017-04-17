// transpile:main

import log from './logger';
import { errors } from 'appium-base-driver';
import { RemoteDebugger, DEBUGGER_TYPES, RPC_RESPONSE_TIMEOUT_MS } from './remote-debugger';
import WebKitRpcClient from './webkit-rpc-client';
import _ from 'lodash';
import url from 'url';
import request from 'request-promise';
import { simpleStringify } from './helpers';


export default class WebKitRemoteDebugger extends RemoteDebugger {
  constructor (opts = {}) {
    super(_.defaults({debuggerType: DEBUGGER_TYPES.webkit}, opts));

    this.webkitResponseTimeout = opts.webkitResponseTimeout || RPC_RESPONSE_TIMEOUT_MS;

    // used to store callback types when sending requests
    this.dataMethods = {};
  }

  async connect (pageId) {
    this.rpcClient = new WebKitRpcClient(this.host, this.port, this.webkitResponseTimeout);
    await this.rpcClient.connect(pageId);
  }

  disconnect () {
    if (this.rpcClient && this.rpcClient.isConnected()) {
      this.rpcClient.disconnect();
    }
  }

  isConnected () {
    return !!(this.rpcClient && this.rpcClient.isConnected());
  }

  async pageArrayFromJson (ignoreAboutBlankUrl = false) {
    log.debug(`Getting WebKitRemoteDebugger pageArray: ${this.host}, ${this.port}`);
    let pageElementJSON = await this.getJsonFromUrl(this.host, this.port, '/json');
    if (pageElementJSON[0] && pageElementJSON[0].deviceId) {
      log.debug(`Device JSON: ${simpleStringify(pageElementJSON)}`);

      let devices = pageElementJSON.filter((device) => device.deviceId !== 'SIMULATOR');
      if (devices.length > 1) {
        log.debug(`Connected to ${devices.length} devices. ` +
                  `Choosing the first, with udid '${devices[0].deviceId}'.`);
      }
      this.port = devices[0].url.split(':')[1];
      log.debug(`Received notification that ios-webkit-debug-proxy is listening on port '${this.port}'`);

      pageElementJSON = await this.getJsonFromUrl(this.host, this.port, '/json');
    }
    log.debug(`Page element JSON: ${simpleStringify(pageElementJSON)}`);

    // Add elements to an array
    let newPageArray = pageElementJSON.filter((pageObject) => {
      return pageObject.url && (!ignoreAboutBlankUrl || pageObject.url !== 'about:blank');
    }).map((pageObject) => {
      let urlArray = pageObject.webSocketDebuggerUrl.split('/').reverse();
      let id = urlArray[0];
      return {
        id,
        title: pageObject.title,
        url: pageObject.url,
        isKey: !!id,
      };
    });

    return newPageArray;
  }

  async getJsonFromUrl (hostname, port, pathname) {
    let uri = url.format({
      protocol: 'http',
      hostname,
      port,
      pathname
    });
    log.debug(`Sending request to: ${uri}`);
    return JSON.parse(await request({uri, method: 'GET'}));
  }

  convertResult (res) {
    // WebKit returns a result wrapped deeper than the Remote Debugger:
    //   {
    //     result: {
    //       type: "string",
    //       value: {
    //         status: 0,
    //         value: {
    //           ELEMENT: ":wdc:1441819740060"
    //         }
    //       }
    //     },
    //     wasThrown: false
    //   }

    // check for errors
    if (res && res.wasThrown) {
      // we got some form of error.
      let message = res.result.value || res.result;
      throw new errors.JavaScriptError(message);
    }

    if (res && res.result && res.result.type === 'undefined') {
      // if it doesn't throw an error, we just want to put in a
      // place holder. this happens when we have an async execute request
      res.result.value = {};
    }

    // send the actual result to the Remote Debugger converter
    return super.convertResult(res && res.result ? res.result.value : res);
  }
}
