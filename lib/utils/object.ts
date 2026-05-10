import {util} from '@appium/support';
import {isDeepStrictEqual} from 'node:util';
import type {StringRecord} from '@appium/types';

/**
 * Creates a shallow object where undefined keys from `target` are filled
 * from `defaultsObj`.
 *
 * @param target - The object with priority values.
 * @param defaultsObj - The object providing fallback values.
 * @returns A new object containing merged defaulted values.
 */
export function defaults<T extends Record<string, any>, U extends Record<string, any>>(
  target: T,
  defaultsObj: U,
): T & U {
  const result = {...target} as T & U;
  for (const [key, value] of Object.entries(defaultsObj)) {
    if (result[key as keyof (T & U)] === undefined) {
      (result as any)[key] = value;
    }
  }
  return result;
}

/**
 * Performs deep strict equality comparison.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns True when both values are deeply equal.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(a, b);
}

/**
 * Validates that all parameters in the provided object have non-nil values.
 * Throws an error if any parameters are missing (null or undefined).
 *
 * @template T - The type of the parameters object.
 * @param params - An object containing parameters to validate.
 * @returns The same parameters object if all values are valid.
 * @throws Error if any parameters are missing, listing all missing parameter names.
 */
export function checkParams<T extends StringRecord>(params: T): T {
  // check if all parameters have a value
  const errors = Object.entries(params)
    .filter(([, value]) => value == null)
    .map(([param]) => param);
  if (errors.length) {
    throw new Error(`Missing ${util.pluralize('parameter', errors.length)}: ${errors.join(', ')}`);
  }
  return params;
}
