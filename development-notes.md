## Development notes

The protocol is largely undocumented. Once connected, it follows the [WebKit](https://webkit.org/)
protocol documented [here](https://github.com/WebKit/webkit/tree/master/Source/JavaScriptCore/inspector/protocol).

To sneak a look at what is going on, one can use [socat](https://linux.die.net/man/1/socat)
(on mac, `brew install socat`):
```shell
sudo mv /path/to/unix-domain.socket /path/to/unix-domain.socket.original
sudo socat -t100 -x -v UNIX-LISTEN:/path/to/unix-domain.socket,mode=777,reuseaddr,fork UNIX-CONNECT:/path/to/unix-domain.socket.original
```

To get the path to the socket, follow the procedure used in [appium-ios-simulator#getWebInspectorSocket](https://github.com/appium/appium-ios-simulator/blob/master/lib/simulator-xcode-9.3.js#L18-L49).

Then open Safari and the "Develop" menu, to begin communication with the Web
Inspector on the device. You should begin to see the dump of the chatter.


## Inspecting the communication

In order to look at what Safari is doing, there is a small utility that can
be run using
```
npm run inspect-safari <udid>
```

This depends on [socat](https://linux.die.net/man/1/socat) which can be installed
through [brew](https://brew.sh/) using `brew install socat`.

The first time running the utility it will exit after printing a socket. This
is the web inspector Unix Domain socket for the simulator, which needs to be moved
to a file with the same name, but the added `.original` suffix.

Running the utility again will use `socat` to catch the communication between
the Safari Web Inspector and the simulator, and print it to standard output.

## Example for a simulator

```
$ lsof -aUc launchd_sim # to find a path of com.apple.webinspectord_sim.socket.
# e.g. "/private/tmp/com.apple.launchd.7J8c2aiVxG/com.apple.webinspectord_sim.socket" was found
$ mv /private/tmp/com.apple.launchd.7J8c2aiVxG/com.apple.webinspectord_sim.socket /private/tmp/com.apple.launchd.7J8c2aiVxG/com.apple.webinspectord_sim.socket.original
$ socat -t100 -x -v UNIX-LISTEN:/private/tmp/com.apple.launchd.7J8c2aiVxG/com.apple.webinspectord_sim.socket,mode=777,reuseaddr,fork UNIX-CONNECT:/private/tmp/com.apple.launchd.7J8c2aiVxG/com.apple.webinspectord_sim.socket.original
# Open Safari and its Web Inspector with a simulator's web page.
# Then, the communication protocol appears
```

```
$ npm run inspect-safari 8442C4CD-77B5-4764-A1F9-AABC7AD26209
# Open Safari and its Web Inspector. Then, JSON formatted communication appears.
```
