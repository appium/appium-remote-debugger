import {errorFromMJSONWPStatusCode} from '@appium/base-driver';
import {util} from '@appium/support';

export const RESPONSE_LOG_LENGTH = 100;

/**
 * Converts a value to a best-effort JSON string for logging, removing noisy
 * function properties from cloneable objects when possible.
 *
 * Falls back to `String(value)` when JSON serialization returns `undefined`
 * or throws (for example, for functions, symbols, or circular structures).
 *
 * @param value - The value to stringify.
 * @param multiline - If true, formats JSON output with indentation. Defaults to false.
 * @returns A string representation suitable for logging.
 */
export function simpleStringify(value: any, multiline: boolean = false): string {
  const stringify = (val: any): string => {
    try {
      return multiline
        ? (JSON.stringify(val, null, 2) ?? String(val))
        : (JSON.stringify(val) ?? String(val));
    } catch {
      return String(val);
    }
  };

  if (!value) {
    return stringify(value);
  }

  let cleanValue = value;
  if (typeof value === 'object' && value !== null) {
    try {
      cleanValue = removeNoisyProperties(structuredClone(value));
    } catch {
      // Fall back to the original value when cloning fails (e.g., non-cloneable graph entries).
      cleanValue = value;
    }
  }
  return stringify(cleanValue);
}

/**
 * Converts the result from a JavaScript evaluation in the remote debugger
 * into a usable format. Handles errors, serialization, and cleans up noisy
 * function properties.
 *
 * @param res - The raw result from the remote debugger's JavaScript evaluation.
 * @returns The cleaned and converted result value.
 * @throws Error if the result is undefined, has an unexpected type, or contains
 *               an error status code.
 */
export function convertJavascriptEvaluationResult(res: any): any {
  if (res === undefined) {
    throw new Error(
      `Did not get OK result from remote debugger. Result was: ${util.truncateString(simpleStringify(res), RESPONSE_LOG_LENGTH)}`,
    );
  } else if (typeof res === 'string') {
    try {
      res = JSON.parse(res);
    } catch {
      // we might get a serialized object, but we might not
      // if we get here, it is just a value
    }
  } else if ((typeof res !== 'object' && typeof res !== 'function') || res === null) {
    throw new Error(`Result has unexpected type: (${typeof res}).`);
  }

  if (Object.hasOwn(res, 'status') && res.status !== 0) {
    // we got some form of error.
    throw errorFromMJSONWPStatusCode(res.status, res.value.message || res.value);
  }

  // with either have an object with a `value` property (even if `null`),
  // or a plain object
  const value = Object.hasOwn(res, 'value') ? res.value : res;
  return removeNoisyProperties(value);
}

function removeNoisyProperties<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    for (const property of ['ceil', 'clone', 'floor', 'round', 'scale', 'toString']) {
      delete record[property];
    }
  }
  return obj;
}
