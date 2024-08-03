// event emitted publically
export const events = {
  EVENT_PAGE_CHANGE: 'remote_debugger_page_change',
  EVENT_FRAMES_DETACHED: 'remote_debugger_frames_detached',
  EVENT_DISCONNECT: 'remote_debugger_disconnect',
};

/**
 * Keep track of the client event listeners so they can be removed
 *
 * @this {RemoteDebugger}
 * @param {string} eventName
 * @param {import('../types').EventListener} listener
 * @returns {void}
 */
export function addClientEventListener (eventName, listener) {
  this._clientEventListeners[eventName] ??= [];
  this._clientEventListeners[eventName].push(listener);
  this.requireRpcClient().on(eventName, listener);
}

/**
 * @this {RemoteDebugger}
 * @param {string} eventName
 * @returns {void}
 */
export function removeClientEventListener (eventName) {
  for (const listener of (this._clientEventListeners[eventName] || [])) {
    this.requireRpcClient().off(eventName, listener);
  }
}

/**
 * @this {RemoteDebugger}
 * @param {import('../types').EventListener} listener
 * @returns {void}
 */
export function startConsole (listener) {
  this.log.debug('Starting to listen for JavaScript console');
  this.addClientEventListener('Console.messageAdded', listener);
  this.addClientEventListener('Console.messageRepeatCountUpdated', listener);
}

/**
 * @this {RemoteDebugger}
 * @returns {void}
 */
export function stopConsole () {
  this.log.debug('Stopping to listen for JavaScript console');
  this.removeClientEventListener('Console.messageAdded');
  this.removeClientEventListener('Console.messageRepeatCountUpdated');
}

/**
 * @this {RemoteDebugger}
 * @param {import('../types').EventListener} listener
 * @returns {void}
 */
export function startNetwork (listener) {
  this.log.debug('Starting to listen for network events');
  this.addClientEventListener('NetworkEvent', listener);
}

/**
 * @this {RemoteDebugger}
 * @returns {void}
 */
export function stopNetwork () {
  this.log.debug('Stopping to listen for network events');
  this.removeClientEventListener('NetworkEvent');
}

export default events;

/**
 * @typedef {Object} HasEventsRelatedProperties
 * @property {import('@appium/types').StringRecord<import('../types').EventListener[]>} _clientEventListeners:
 */

/**
 * @typedef {import('../remote-debugger').RemoteDebugger & HasEventsRelatedProperties} RemoteDebugger
 */
