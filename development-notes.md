## Development notes

### Protocol and documentation

The protocol is largely undocumented. Once connected, it follows the [WebKit](https://webkit.org/)
inspector protocol. The JSON protocol definitions live in the WebKit tree:
[Source/JavaScriptCore/inspector/protocol/](https://github.com/WebKit/WebKit/tree/main/Source/JavaScriptCore/inspector/protocol).

Chrome DevTools protocol documentation is a useful reference:
[Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/).
Although the WebKit inspector protocol is similar to CDP, there are a couple of important
differences that are not documented; they can only be found by reading the WebKit source
code at [github.com/WebKit/WebKit](https://github.com/WebKit/WebKit).

### Codebase overview

- **Language / build**: TypeScript; compile with `npm run build` (watch: `npm run dev`).
- **Entry**: `index.ts` exports `createRemoteDebugger()`, `RemoteDebugger`, `RemoteDebuggerRealDevice`, and `REMOTE_DEBUGGER_PORT`.
- **Simulator vs real device**: Use `RemoteDebugger` (simulator) or `RemoteDebuggerRealDevice` (real device via `appium-ios-device`). Both extend the same base; the real-device class wires in `RpcClientRealDevice` instead of `RpcClientSimulator`.
- **RPC layer** (`lib/rpc/`): `RpcClient` (base), `RpcClientSimulator`, `RpcClientRealDevice`; `RemoteMessages` builds Web Inspector commands; `RpcMessageHandler` processes responses.
- **Protocol** (`lib/protocol/`): Maps Web Inspector domain/method names to parameter definitions used when building RPC commands.
- **Mixins** (`lib/mixins/`): Connect, execute, navigate, cookies, screenshot, events, message-handlers, misc, property-accessors.
- **Events**: `RemoteDebugger.EVENT_PAGE_CHANGE`, `RemoteDebugger.EVENT_DISCONNECT`, `RemoteDebugger.EVENT_FRAMES_DETACHED` (see README for usage).
- **Tests**: `npm test` (unit), `npm run e2e-test` (functional). Lint: `npm run lint` / `npm run lint:fix`.
- **Atoms**: Selenium atoms live in `atoms/` and are built with `npm run build:atoms`. See README and `atoms-notes.md` for Selenium branch, bazel/bazelisk, and Appium-specific patches.

### Inspecting the communication (socat)

To inspect traffic between Safari’s Web Inspector and the simulator, use a Unix socket proxy with [socat](https://linux.die.net/man/1/socat) (on macOS: `brew install socat`):

1. Get the simulator’s Web Inspector socket path (see below).
2. Move the real socket aside and run socat so it listens where the socket was and forwards to the moved one:

```shell
# Move the real socket aside
sudo mv /path/to/unix-domain.socket /path/to/unix-domain.socket.original

# Proxy: listen on original path, connect to .original
sudo socat -t100 -x -v UNIX-LISTEN:/path/to/unix-domain.socket,mode=777,reuseaddr,fork UNIX-CONNECT:/path/to/unix-domain.socket.original
```

Then open Safari → Develop menu and attach to the simulator’s Web Inspector; the proxied traffic will appear in the terminal.

To get the socket path for a **booted** simulator, run:

```bash
npm run get-web-inspector-socket -- <simulator-udid>
```

The script prints the actual socket path for the given Simulator UDID (it uses `getWebInspectorSocket()` from [appium-ios-simulator](https://github.com/appium/appium-ios-simulator))

### Inspect-Safari utility

A small utility runs the socat proxy for a given simulator UDID:

```bash
npm run inspect-safari -- <udid>
```

**Prerequisites**: [socat](https://linux.die.net/man/1/socat) (e.g. `brew install socat`).

**Steps**:

1. Run once: the script prints the simulator’s Web Inspector socket path, then starts socat. Socat expects the **real** socket to be at `<path>.original`.
2. So **before** (or the first time you use this for a given simulator): move the real socket aside, e.g.
   `mv /path/to/com.apple.webinspectord_sim.socket /path/to/com.apple.webinspectord_sim.socket.original`
   (use the path printed by the script; you may need to locate it via `lsof -aUc launchd_sim` or similar if the script fails to connect).
3. Run `npm run inspect-safari -- <udid>` again. It will start socat: it listens on the normal socket path and forwards to `.original`. Open Safari’s Web Inspector to the simulator; JSON-formatted communication will appear in the terminal.

**Example (simulator)**:

```bash
# Get socket path for your booted simulator
npm run get-web-inspector-socket -- 8442C4CD-77B5-4764-A1F9-AABC7AD26209
# e.g. prints: /private/tmp/com.apple.launchd.xxx/com.apple.webinspectord_sim.socket

# Move real socket aside (use the path from above)
mv /private/tmp/.../com.apple.webinspectord_sim.socket /private/tmp/.../com.apple.webinspectord_sim.socket.original

# Start proxy and open Safari → Develop → simulator
npm run inspect-safari -- 8442C4CD-77B5-4764-A1F9-AABC7AD26209
```
