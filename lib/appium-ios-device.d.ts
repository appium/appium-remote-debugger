declare module 'appium-ios-device' {
  export const services: {
    startWebInspectorService(
      udid: string,
      opts: Record<string, unknown>,
    ): Promise<{
      listenMessage: (handler: (data: Buffer) => void) => void;
      sendMessage: (cmd: Buffer) => void;
      close?: () => void | Promise<void>;
    }>;
  };
}
