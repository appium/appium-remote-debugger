import http from 'node:http';
import {logger} from '@appium/support';
import finalhandler from 'finalhandler';
import serveStatic from 'serve-static';
import path from 'node:path';

const serve = serveStatic(path.resolve('test', 'functional', 'html'));

const log = logger.getLogger('TestHttpServer');

const PORT = 1234;

let server: http.Server | undefined;

export async function startHttpServer(port: number = PORT): Promise<number> {
  // start a simple http server to serve pages (so no interwebs needed)
  server = http.createServer(function requestHandler(req, res) {
    log.debug(`${req.method} ${req.url}`);
    serve(req, res, finalhandler(req, res));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      resolve();
    });
  });
  log.debug(`HTTP server listening on port '${port}'`);

  return port;
}

export function stopHttpServer(): void {
  if (server) {
    server.close();
  }
}
