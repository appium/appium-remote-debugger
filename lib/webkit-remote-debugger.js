// transpile:main

import log from './logger';
import { RemoteDebugger, DEBUGGER_TYPES } from './remote-debugger';
import WebKitRpcClient from './webkit-rpc-client';
import _ from 'lodash';
import url from 'url';
import request from 'request-promise';


export default class WebKitRemoteDebugger extends RemoteDebugger {
  constructor (opts) {
    super(_.defaults({debuggerType: DEBUGGER_TYPES.webkit}, opts));

    // used to store callback types when sending requests
    this.dataMethods = {};
  }

  async connect (pageId) {
    this.rpcClient = new WebKitRpcClient(this.host, this.port);
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

  async pageArrayFromJson () {
    log.debug('Getting WebKitRemoteDebugger pageArray');
    let pageElementJSON = await this.getJsonFromUrl(this.host, this.port, '/json');
    log.debug(`Page element JSON: ${JSON.stringify(pageElementJSON)}`);
    // Add elements to an array
    let newPageArray = [];
    for (let pageObject of pageElementJSON) {
      let urlArray = pageObject.webSocketDebuggerUrl.split('/').reverse();
      let id = urlArray[0];
      newPageArray.push({
        id,
        title: pageObject.title,
        url: pageObject.url,
        isKey: !!id,
      });
    }
    return newPageArray;
  }

  async getJsonFromUrl (hostname, port, pathname) {
    let uri = url.format({
      protocol: 'http',
      hostname,
      port,
      pathname
    });
    return JSON.parse(await request({uri, method: 'GET'}));
  }
}
