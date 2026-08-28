import type {StringRecord} from '@appium/types';

import type {AutomationSession} from './session.js';

/** Low-level pointer primitive: moves to/clicks a page-relative position. iOS has no real pointing device - not implemented there. */
export async function performMouseInteraction(
  this: AutomationSession,
  x: number,
  y: number,
  button: 'None' | 'Left' | 'Middle' | 'Right',
  interaction: 'Move' | 'Down' | 'Up' | 'SingleClick' | 'DoubleClick',
  modifiers: string[] = [],
): Promise<void> {
  await this.callAutomation('performMouseInteraction', {
    handle: this.requireTopLevelHandle(),
    position: {x, y},
    button,
    interaction,
    modifiers,
  });
}

/** Low-level keyboard primitive: dispatches a sequence of key press/release/insert interactions. */
export async function performKeyboardInteractions(
  this: AutomationSession,
  interactions: StringRecord[],
): Promise<void> {
  await this.callAutomation('performKeyboardInteractions', {handle: this.requireTopLevelHandle(), interactions});
}

/** Low-level primitive underlying the W3C Actions API: dispatches a raw per-tick interaction sequence. */
export async function performInteractionSequence(
  this: AutomationSession,
  inputSources: StringRecord[],
  steps: StringRecord[],
): Promise<void> {
  const params = this.withFrameHandle({handle: this.requireTopLevelHandle(), inputSources, steps});
  await this.callAutomation('performInteractionSequence', params);
}
