import http from 'http';
import B from 'bluebird';
import { logger } from 'appium-support';


const log = logger.getLogger('TestHttpServer');

const PORT = 1234;

const PAGE_TITLE = 'Remote debugger test page';
const PAGE = `<html>
  <head>
    <title>${PAGE_TITLE}</title>
  </head>
  <body>
    Tests for appium-remote-debugger
  </body>
</html>
`;

let server;

async function startHttpServer (port = PORT) {
  // start a simple http server to serve pages (so no interwebs needed)
  server = http.createServer(function requestHandler (request, response) {
    response.end(PAGE);
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

export { startHttpServer, stopHttpServer, PAGE_TITLE };
