// transpile:main

import http from 'http';
import Promise from 'bluebird';
import ws from 'ws';
import { logger } from 'appium-support';

const log = logger.getLogger('RemoteDebugger');
let WebSocketServer = ws.Server;


// fake server for allowing both http requests and
// websocket requests, as needed to test Appium's
// version of webkit remote debugging support
class WebKitRemoteDebuggerServer {
  constructor () {
    this.server = null;
    this.websocketServer = null;
    this.nextResponse = null;
  }

  // start the server
  // if a websocket server is needed, pass in `true`
  async start (ws = false) {
    if (!ws) {
      // just need a simple http server for non-websocket calls
      return new Promise((resolve) => {
        this.server = http.createServer((req, res) => {
          res.writeHead(200, {'Content-Type': 'application/json'});
          if (this.nextResponse) {
            res.end(JSON.stringify(this.nextResponse));
            this.nextResponse = null;
          } else {
            res.end(JSON.stringify({id: 2, type: 'real'}));
          }
        });
        this.server.listen(1337, 'localhost', resolve);
        log.debug('Server running at http://localhost:1337/');
      });
    } else {
      // need a fake websocket server
      // but it doesn't need to do anything but connect and disconnect
      this.ws = true;
      return new Promise((resolve) => {
        this.server = new WebSocketServer({host: 'localhost', port: 1337}, resolve);
      });
    }
  }

  // stop one or both of the servers.
  async stop () {
    if (!this.ws) {
      return new Promise((resolve) => {
        if (this.server) {
          this.server.close((err) => { // eslint-disable-line promise/prefer-await-to-callbacks
            resolve(`Stopped listening: ${err}`);
          });
        } else {
          resolve('Not listening.');
        }
      });
    } else {
      // websocket server isn't asynchronous
      this.server.close();
      return Promise.resolve();
    }
  }

  // set what the next call to the http server will respond with
  respondWith (response) {
    this.nextResponse = response;
  }
}

export { WebKitRemoteDebuggerServer };
