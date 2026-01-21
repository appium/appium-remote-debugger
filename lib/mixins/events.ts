import {
  getClientEventListeners,
} from './property-accessors';
import type { RemoteDebugger } from '../remote-debugger';
import type { EventListener } from '../types';

// event emitted publically
export const events = {
  EVENT_PAGE_CHANGE: 'remote_debugger_page_change',
  EVENT_FRAMES_DETACHED: 'remote_debugger_frames_detached',
  EVENT_DISCONNECT: 'remote_debugger_disconnect',
} as const;

/**
 * Adds a client event listener to the RPC client and tracks it for later removal.
 * The listener will be called when the specified event is emitted by the remote debugger.
 *
 * @param eventName - The name of the event to listen for.
 * @param listener - The event listener function to call when the event is emitted.
 */
export function addClientEventListener(
  this: RemoteDebugger,
  eventName: string,
  listener: EventListener
): void {
  getClientEventListeners(this)[eventName] ??= [];
  getClientEventListeners(this)[eventName].push(listener);
  this.requireRpcClient().on(eventName, listener);
}

/**
 * Removes all client event listeners for the specified event name from the RPC client.
 * This will stop listening for the event and clean up the tracked listeners.
 *
 * @param eventName - The name of the event to stop listening for.
 */
export function removeClientEventListener(
  this: RemoteDebugger,
  eventName: string
): void {
  for (const listener of (getClientEventListeners(this)[eventName] || [])) {
    this.requireRpcClient().off(eventName, listener);
  }
}

/**
 * Starts listening for JavaScript console messages by registering listeners
 * for Console.messageAdded and Console.messageRepeatCountUpdated events.
 *
 * @param listener - The event listener function to call when console messages are received.
 */
export function startConsole(
  this: RemoteDebugger,
  listener: EventListener
): void {
  this.log.debug('Starting to listen for JavaScript console');
  this.addClientEventListener('Console.messageAdded', listener);
  this.addClientEventListener('Console.messageRepeatCountUpdated', listener);
}

/**
 * Stops listening for JavaScript console messages by removing listeners
 * for Console.messageAdded and Console.messageRepeatCountUpdated events.
 */
export function stopConsole(this: RemoteDebugger): void {
  this.log.debug('Stopping to listen for JavaScript console');
  this.removeClientEventListener('Console.messageAdded');
  this.removeClientEventListener('Console.messageRepeatCountUpdated');
}

/**
 * Starts listening for network events by registering a listener for NetworkEvent.
 * This aggregates all Network.* events into a single NetworkEvent.
 *
 * @param listener - The event listener function to call when network events are received.
 */
export function startNetwork(
  this: RemoteDebugger,
  listener: EventListener
): void {
  this.log.debug('Starting to listen for network events');
  this.addClientEventListener('NetworkEvent', listener);
}

/**
 * Stops listening for network events by removing the listener for NetworkEvent.
 */
export function stopNetwork(this: RemoteDebugger): void {
  this.log.debug('Stopping to listen for network events');
  this.removeClientEventListener('NetworkEvent');
}
