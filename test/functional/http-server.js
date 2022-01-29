import http from 'http';
import B from 'bluebird';
import { logger } from '@appium/support';
import finalhandler from 'finalhandler';
import serveStatic from 'serve-static';
import path from 'path';


const serve = serveStatic(path.resolve('test', 'functional', 'html'));

const log = logger.getLogger('TestHttpServer');

const PORT = 1234;

let server;

async function startHttpServer (port = PORT) {
  // start a simple http server to serve pages (so no interwebs needed)
  server = http.createServer(function requestHandler (req, res) {
    log.debug(`${req.method} ${req.url}`);
    serve(req, res, finalhandler(req, res));
  });

  await (B.promisify(server.listen, {context: server}))(PORT);
  log.debug(`HTTP server listening on port '${port}'`);

  return port;
}

function stopHttpServer () {
  if (server) {
    server.close();
  }
}

export { startHttpServer, stopHttpServer };
