// WebKit's prefixed Fullscreen API predates the standard one and isn't in TS's DOM lib types.
interface WebKitFullscreenDocument extends Document {
  webkitFullscreenEnabled?: boolean;
  webkitIsFullScreen?: boolean;
}

interface WebKitFullscreenElement extends Element {
  webkitRequestFullscreen(): void;
}

/**
 * Requests fullscreen on the document element, invoking `callback` once the request settles
 * (accepted or rejected) rather than returning synchronously - fullscreen requests are async.
 */
export default function automationEnterFullscreen(callback: (result: boolean) => void): void {
  const doc = document as WebKitFullscreenDocument;
  const docElement = document.documentElement as unknown as WebKitFullscreenElement;

  if (!doc.webkitFullscreenEnabled) {
    callback(false);
    return;
  }
  if (doc.webkitIsFullScreen) {
    callback(true);
    return;
  }

  const onChange = (event: Event): void => {
    if (event.target !== docElement || !doc.webkitIsFullScreen) {
      return;
    }
    settle(true);
  };
  const onError = (event: Event): void => {
    if (event.target !== docElement) {
      return;
    }
    settle(!!doc.webkitIsFullScreen);
  };
  function settle(result: boolean): void {
    document.removeEventListener('webkitfullscreenchange', onChange);
    docElement.removeEventListener('webkitfullscreenerror', onError);
    callback(result);
  }

  document.addEventListener('webkitfullscreenchange', onChange);
  docElement.addEventListener('webkitfullscreenerror', onError);
  docElement.webkitRequestFullscreen();
}
