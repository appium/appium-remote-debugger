import { RemoteDebuggerServer } from './remote-debugger-server';


function withConnectedServer (rds, fn) {
  // `rds` is a hack to allow us to
  return () => {
    let server = new RemoteDebuggerServer();

    beforeEach(async () => {
      await server.start();
      let rd = rds[0];
      await rd.connect();

      // simulate selecting app and page
      rd.appIdKey = 1;
      rd.pageIdKey = 1;

      // set a really low page load timeout,
      // so we don't wait around too much
      rd.pageLoadMs = 10;
    });
    afterEach(async () => {
      await server.stop();
    });
    fn(server);
  };
}

function withUnconnectedServer (fn) {
  return () => {
    let server = new RemoteDebuggerServer();

    beforeEach(async () => {
      await server.start();
    });
    afterEach(async () => {
      await server.stop();
    });
    fn(server);
  };
}

export { withConnectedServer, withUnconnectedServer };
