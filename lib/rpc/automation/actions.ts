import {errors} from '@appium/base-driver';
import type {ActionSequence, KeyAction, NullAction, PointerAction, WheelAction, StringRecord} from '@appium/types';

import {VIRTUAL_KEYS} from './keys.js';
import type {AutomationSession} from './session.js';
import type {AutomationElement} from './types.js';

const BUTTON_NAMES: StringRecord<'Left' | 'Middle' | 'Right'> = {0: 'Left', 1: 'Middle', 2: 'Right'};

/** Per-source "currently held" state, tracked on `AutomationSession` across `performW3CActions` calls. */
export interface PointerRunningState {
  pressedButton?: 'Left' | 'Middle' | 'Right';
  location?: {x: number; y: number};
  origin?: 'Viewport' | 'Pointer' | 'Element';
  nodeHandle?: string;
}

/** Per-source "currently held" state, tracked on `AutomationSession` across `performW3CActions` calls. */
export interface KeyRunningState {
  pressedCharKey?: string;
  pressedVirtualKeys: Set<string>;
}

/**
 * Translates a W3C Actions API payload (`POST /session/:id/actions`) into WebKit's
 * `performInteractionSequence` ticks and performs it. WebKit splits W3C's single
 * `pointer` source type by `parameters.pointerType` into Mouse/Touch/Pen, and its
 * per-tick state is declarative ("what's pressed right now") rather than W3C's
 * imperative per-action verbs - held buttons/keys are re-asserted on every tick until
 * an explicit up, rather than relying on WebKit's own "sustained if unmentioned"
 * default (under-specified for how it interacts with partial state updates).
 *
 * Held state (`pointerInputState`/`keyInputState`) lives on the session, not this call,
 * so buttons/keys pressed by one Actions call and not yet released stay held across a
 * later one - matching the W3C "input state" model. `releaseActions()` clears it.
 */
export async function performW3CActions(this: AutomationSession, actions: ActionSequence[]): Promise<void> {
  const maxTicks = actions.reduce((max, seq) => Math.max(max, seq.actions.length), 0);
  const inputSources = actions.map((seq) => ({sourceId: seq.id, sourceType: toW3cSourceType(seq)}));

  const steps: StringRecord[] = [];
  for (let tick = 0; tick < maxTicks; tick++) {
    const states: StringRecord[] = [];
    for (const seq of actions) {
      let state: StringRecord | null;
      if (seq.type === 'key') {
        state = buildKeyTickState(seq.id, seq.actions[tick], this.keyInputState);
      } else if (seq.type === 'pointer') {
        state = buildPointerTickState(this, seq.id, seq.actions[tick], this.pointerInputState);
      } else if (seq.type === 'wheel') {
        state = buildWheelTickState(this, seq.id, seq.actions[tick]);
      } else {
        state = buildNoneTickState(seq.id, seq.actions[tick]);
      }
      if (state) {
        states.push(state);
      }
    }
    steps.push({states});
  }

  await this.performInteractionSequence(inputSources, steps);
}

/** WebDriver `releaseActions`: cancels any in-progress sequence and forgets all held keys/buttons. */
export async function releaseActions(this: AutomationSession): Promise<void> {
  if (this.pointerInputState.size === 0 && this.keyInputState.size === 0) {
    return;
  }
  try {
    await this.cancelInteractionSequence();
  } finally {
    this.pointerInputState.clear();
    this.keyInputState.clear();
  }
}

function toW3cSourceType(seq: ActionSequence): 'Null' | 'Keyboard' | 'Mouse' | 'Touch' | 'Pen' | 'Wheel' {
  switch (seq.type) {
    case 'key':
      return 'Keyboard';
    case 'wheel':
      return 'Wheel';
    case 'pointer': {
      const pointerType = seq.parameters?.pointerType ?? 'mouse';
      if (pointerType === 'touch') {
        return 'Touch';
      }
      return pointerType === 'pen' ? 'Pen' : 'Mouse';
    }
    default:
      return 'Null';
  }
}

function buildKeyTickState(
  sourceId: string,
  action: KeyAction | undefined,
  running: Map<string, KeyRunningState>,
): StringRecord | null {
  const state = running.get(sourceId) ?? {pressedVirtualKeys: new Set<string>()};
  running.set(sourceId, state);

  if (action?.type === 'keyDown' || action?.type === 'keyUp') {
    const virtualKey = VIRTUAL_KEYS[action.value]?.[0];
    if (virtualKey) {
      if (action.type === 'keyDown') {
        state.pressedVirtualKeys.add(virtualKey);
      } else {
        state.pressedVirtualKeys.delete(virtualKey);
      }
    } else if (action.type === 'keyDown') {
      state.pressedCharKey = action.value;
    } else if (state.pressedCharKey === action.value) {
      state.pressedCharKey = undefined;
    }
  }

  // A zero-length pause carries nothing worth sending - only a real (non-zero) one needs
  // to reach WebKit, since its sole purpose is to extend the tick's wait.
  const pauseDuration = action?.type === 'pause' && action.duration ? action.duration : undefined;
  if (!state.pressedCharKey && state.pressedVirtualKeys.size === 0) {
    running.delete(sourceId);
    return pauseDuration === undefined ? null : {sourceId, duration: pauseDuration};
  }
  const result: StringRecord = {sourceId};
  if (state.pressedCharKey) {
    result.pressedCharKey = state.pressedCharKey;
  }
  if (state.pressedVirtualKeys.size > 0) {
    result.pressedVirtualKeys = Array.from(state.pressedVirtualKeys);
  }
  if (pauseDuration !== undefined) {
    result.duration = pauseDuration;
  }
  return result;
}

function buildPointerTickState(
  session: AutomationSession,
  sourceId: string,
  action: PointerAction | undefined,
  running: Map<string, PointerRunningState>,
): StringRecord | null {
  const state = running.get(sourceId) ?? {};
  running.set(sourceId, state);

  if (action?.type === 'pointerUp') {
    running.delete(sourceId);
    return null;
  }
  if (action?.type === 'pointerDown') {
    state.pressedButton = resolveButton(action.button);
  } else if (action?.type === 'pointerMove') {
    const {origin, nodeHandle} = resolveOrigin(session, action.origin);
    state.location = {x: action.x, y: action.y};
    state.origin = origin;
    state.nodeHandle = nodeHandle;
  }

  let duration: number | undefined;
  if (action?.type === 'pointerMove') {
    duration = action.duration;
  } else if (action?.type === 'pause' && action.duration) {
    // Same zero-length-pause-is-a-no-op reasoning as buildKeyTickState.
    duration = action.duration;
  }
  if (!state.location && !state.pressedButton) {
    return duration === undefined ? null : {sourceId, duration};
  }
  const result: StringRecord = {sourceId};
  if (state.location) {
    result.location = state.location;
    result.origin = state.origin;
    if (state.nodeHandle) {
      result.nodeHandle = state.nodeHandle;
    }
  }
  if (state.pressedButton) {
    result.pressedButton = state.pressedButton;
  }
  if (duration !== undefined) {
    result.duration = duration;
  }
  return result;
}

function buildWheelTickState(
  session: AutomationSession,
  sourceId: string,
  action: WheelAction | undefined,
): StringRecord | null {
  if (action?.type === 'pause') {
    return action.duration ? {sourceId, duration: action.duration} : null;
  }
  if (action?.type !== 'scroll') {
    return null;
  }
  const {origin, nodeHandle} = resolveOrigin(session, action.origin);
  const result: StringRecord = {
    sourceId,
    location: {x: action.x, y: action.y},
    delta: {width: action.deltaX, height: action.deltaY},
    origin,
  };
  if (nodeHandle) {
    result.nodeHandle = nodeHandle;
  }
  if (action.duration !== undefined) {
    result.duration = action.duration;
  }
  return result;
}

// A 'none' source (InputSourceType 'Null' in WebKit's own terms) only ever pauses - its
// sole purpose is to extend a tick's wait without touching any other source's state.
function buildNoneTickState(sourceId: string, action: NullAction | undefined): StringRecord | null {
  return action?.duration ? {sourceId, duration: action.duration} : null;
}

function resolveButton(button: number): 'Left' | 'Middle' | 'Right' {
  const name = BUTTON_NAMES[button];
  if (!name) {
    throw new errors.InvalidArgumentError(
      `Unsupported W3C pointer button '${button}' - only left (0), middle (1), and right (2) are supported`,
    );
  }
  return name;
}

function resolveOrigin(
  session: AutomationSession,
  origin: 'viewport' | 'pointer' | AutomationElement | Record<string, any> | undefined,
): {origin: 'Viewport' | 'Pointer' | 'Element'; nodeHandle?: string} {
  if (!origin || origin === 'viewport') {
    return {origin: 'Viewport'};
  }
  if (origin === 'pointer') {
    return {origin: 'Pointer'};
  }
  return {origin: 'Element', nodeHandle: session.unwrapElement(origin as AutomationElement)};
}
