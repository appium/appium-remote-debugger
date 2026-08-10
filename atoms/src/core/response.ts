import {BotError, type ErrorCode} from './error.js';

/**
 * A response object, as defined by the JSON wire protocol.
 * @see https://github.com/SeleniumHQ/selenium/wiki/JsonWireProtocol#responses
 */
export interface ResponseObject {
  status: ErrorCode;
  value: unknown;
}

/** Whether the given value is a well-formed response object. */
export function isResponseObject(value: unknown): value is ResponseObject {
  return isObject(value) && typeof value.status === 'number';
}

/**
 * Creates a new success response object with the provided value.
 */
export function createResponse(value: unknown): ResponseObject {
  if (isResponseObject(value)) {
    return value;
  }
  return {status: 0 as ErrorCode, value};
}

/**
 * Converts an error value into its JSON representation as defined by the
 * WebDriver wire protocol.
 */
export function createErrorResponse(error: unknown): ResponseObject {
  if (isResponseObject(error)) {
    return error;
  }

  const err = error as {code?: unknown; message?: unknown} | null | undefined;
  const statusCode = err && typeof err.code === 'number' ? (err.code as ErrorCode) : (13 as ErrorCode);
  return {
    status: statusCode,
    value: {
      message: `${(err && err.message) || error}`,
    },
  };
}

/**
 * Checks that a response object does not specify an error as defined by the
 * WebDriver wire protocol. If the response object defines an error, it will
 * be thrown. Otherwise, the response will be returned as is.
 * @throws {BotError} If the response describes an error.
 * @see https://github.com/SeleniumHQ/selenium/wiki/JsonWireProtocol#failed-commands
 */
export function checkResponse(responseObj: ResponseObject): ResponseObject {
  let status = responseObj.status;
  if (status === 0) {
    return responseObj;
  }

  status = status || (13 as ErrorCode);

  const value = responseObj.value;
  if (!value || !isObject(value)) {
    throw new BotError(status, `${value}`);
  }

  throw new BotError(status, `${value.message}`);
}

function isObject(val: unknown): val is Record<string, unknown> {
  return (typeof val === 'object' && val !== null) || typeof val === 'function';
}
