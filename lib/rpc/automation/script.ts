import type {AutomationSession} from './session.js';

/** Synchronously executes a script body (WebDriver `execute` semantics: use `return` to produce a result). */
export async function executeScript<R = any>(this: AutomationSession, script: string, args: any[] = []): Promise<R> {
  return await this.evaluateJavaScriptFunction<R>(`function(){\n${script}\n}`, args);
}

/** Executes a script body with an implicit trailing `callback` argument (WebDriver `execute_async` semantics). */
export async function executeAsyncScript<R = any>(
  this: AutomationSession,
  script: string,
  args: any[] = [],
): Promise<R> {
  return await this.evaluateJavaScriptFunction<R>(`function(){\n${script}\n}`, args, {
    implicitCallback: true,
    callbackTimeoutMs: this.scriptTimeoutMs,
  });
}
