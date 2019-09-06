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
