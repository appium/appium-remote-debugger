import type {AutomationSession} from './session.js';

/** Whether a JavaScript dialog (alert/confirm/prompt) is currently showing. */
export async function isShowingJavaScriptDialog(this: AutomationSession): Promise<boolean> {
  const response = await this.callAutomation('isShowingJavaScriptDialog', {
    browsingContextHandle: this.requireTopLevelHandle(),
  });
  return !!unwrapAutomationResult<boolean>(response, 'result');
}

/** Returns the message of the currently showing JavaScript dialog. */
export async function getDialogMessage(this: AutomationSession): Promise<string> {
  const response = await this.callAutomation('messageOfCurrentJavaScriptDialog', {
    browsingContextHandle: this.requireTopLevelHandle(),
  });
  return String(unwrapAutomationResult<string>(response, 'message') ?? '');
}

/** Accepts (OK/confirm) the currently showing JavaScript dialog. */
export async function acceptDialog(this: AutomationSession): Promise<void> {
  await this.callAutomation('acceptCurrentJavaScriptDialog', {browsingContextHandle: this.requireTopLevelHandle()});
}

/** Dismisses (cancel) the currently showing JavaScript dialog. */
export async function dismissDialog(this: AutomationSession): Promise<void> {
  await this.callAutomation('dismissCurrentJavaScriptDialog', {browsingContextHandle: this.requireTopLevelHandle()});
}

/** Sets the text input of the currently showing JavaScript prompt dialog. */
export async function setDialogUserInput(this: AutomationSession, userInput: string): Promise<void> {
  await this.callAutomation('setUserInputForCurrentJavaScriptPrompt', {
    browsingContextHandle: this.requireTopLevelHandle(),
    userInput,
  });
}

function unwrapAutomationResult<T>(response: any, key: string): T | undefined {
  return response && typeof response === 'object' && key in response ? response[key] : response;
}
