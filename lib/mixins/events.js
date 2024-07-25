// event emitted publically
export const events = {
  EVENT_PAGE_CHANGE: 'remote_debugger_page_change',
  EVENT_FRAMES_DETACHED: 'remote_debugger_frames_detached',
  EVENT_DISCONNECT: 'remote_debugger_disconnect',
};

/**
 * Keep track of the client event listeners so they can be removed
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string} eventName
 * @param {(event: import('@appium/types').StringRecord) => any} listener
 * @returns {void}
 */
export function addClientEventListener (eventName, listener) {
  this._clientEventListeners[eventName] ??= [];
  this._clientEventListeners[eventName].push(listener);
  this.requireRpcClient().on(eventName, listener);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string} eventName
 * @returns {void}
 */
export function removeClientEventListener (eventName) {
  for (const listener of (this._clientEventListeners[eventName] || [])) {
    this.requireRpcClient().off(eventName, listener);
  }
}

export default events;
