import * as rd from './lib/remote-debugger';
import * as wrd from './lib/webkit-remote-debugger';


const { RemoteDebugger, DEBUGGER_TYPES, REMOTE_DEBUGGER_PORT } = rd;
const { WebKitRemoteDebugger } = wrd;

export { RemoteDebugger, DEBUGGER_TYPES, REMOTE_DEBUGGER_PORT, WebKitRemoteDebugger };
