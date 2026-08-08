/**
 * Error codes from the Selenium WebDriver protocol:
 * https://github.com/SeleniumHQ/selenium/wiki/JsonWireProtocol#response-status-codes
 */
export enum ErrorCode {
  SUCCESS = 0,

  NO_SUCH_ELEMENT = 7,
  NO_SUCH_FRAME = 8,
  // The JSON Wire Protocol spec overloads code 9 for both UNKNOWN_COMMAND and
  // UNSUPPORTED_OPERATION; kept as an intentional duplicate to match the real protocol.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  UNKNOWN_COMMAND = 9,
  UNSUPPORTED_OPERATION = 9,
  STALE_ELEMENT_REFERENCE = 10,
  ELEMENT_NOT_VISIBLE = 11,
  INVALID_ELEMENT_STATE = 12,
  UNKNOWN_ERROR = 13,
  ELEMENT_NOT_SELECTABLE = 15,
  JAVASCRIPT_ERROR = 17,
  XPATH_LOOKUP_ERROR = 19,
  TIMEOUT = 21,
  NO_SUCH_WINDOW = 23,
  INVALID_COOKIE_DOMAIN = 24,
  UNABLE_TO_SET_COOKIE = 25,
  UNEXPECTED_ALERT_OPEN = 26,
  NO_SUCH_ALERT = 27,
  SCRIPT_TIMEOUT = 28,
  INVALID_ELEMENT_COORDINATES = 29,
  IME_NOT_AVAILABLE = 30,
  IME_ENGINE_ACTIVATION_FAILED = 31,
  INVALID_SELECTOR_ERROR = 32,
  SESSION_NOT_CREATED = 33,
  MOVE_TARGET_OUT_OF_BOUNDS = 34,
  SQL_DATABASE_ERROR = 35,
  INVALID_XPATH_SELECTOR = 51,
  INVALID_XPATH_SELECTOR_RETURN_TYPE = 52,
  INVALID_ARGUMENT = 61,
  // The following error codes are derived straight from HTTP return codes.
  METHOD_NOT_ALLOWED = 405,
}

/**
 * Status strings enumerated in the W3C WebDriver protocol.
 * @see https://w3c.github.io/webdriver/#errors
 */
export enum ErrorState {
  ELEMENT_NOT_SELECTABLE = 'element not selectable',
  ELEMENT_NOT_VISIBLE = 'element not visible',
  INVALID_ARGUMENT = 'invalid argument',
  INVALID_COOKIE_DOMAIN = 'invalid cookie domain',
  INVALID_ELEMENT_COORDINATES = 'invalid coordinates',
  INVALID_ELEMENT_STATE = 'invalid element state',
  INVALID_SELECTOR = 'invalid selector',
  INVALID_SESSION_ID = 'invalid session id',
  JAVASCRIPT_ERROR = 'javascript error',
  MOVE_TARGET_OUT_OF_BOUNDS = 'move target out of bounds',
  NO_SUCH_ALERT = 'no such alert',
  NO_SUCH_ELEMENT = 'no such element',
  NO_SUCH_FRAME = 'no such frame',
  NO_SUCH_WINDOW = 'no such window',
  SCRIPT_TIMEOUT = 'script timeout',
  SESSION_NOT_CREATED = 'session not created',
  STALE_ELEMENT_REFERENCE = 'stale element reference',
  TIMEOUT = 'timeout',
  UNABLE_TO_SET_COOKIE = 'unable to set cookie',
  UNEXPECTED_ALERT_OPEN = 'unexpected alert open',
  UNKNOWN_COMMAND = 'unknown command',
  UNKNOWN_ERROR = 'unknown error',
  UNKNOWN_METHOD = 'unknown method',
  UNSUPPORTED_OPERATION = 'unsupported operation',
}

const CODE_TO_STATE: Partial<Record<ErrorCode, ErrorState>> = {
  [ErrorCode.ELEMENT_NOT_SELECTABLE]: ErrorState.ELEMENT_NOT_SELECTABLE,
  [ErrorCode.ELEMENT_NOT_VISIBLE]: ErrorState.ELEMENT_NOT_VISIBLE,
  [ErrorCode.IME_ENGINE_ACTIVATION_FAILED]: ErrorState.UNSUPPORTED_OPERATION,
  [ErrorCode.IME_NOT_AVAILABLE]: ErrorState.UNSUPPORTED_OPERATION,
  [ErrorCode.INVALID_COOKIE_DOMAIN]: ErrorState.INVALID_COOKIE_DOMAIN,
  [ErrorCode.INVALID_ELEMENT_COORDINATES]: ErrorState.INVALID_ELEMENT_COORDINATES,
  [ErrorCode.INVALID_ELEMENT_STATE]: ErrorState.INVALID_ELEMENT_STATE,
  [ErrorCode.INVALID_SELECTOR_ERROR]: ErrorState.INVALID_SELECTOR,
  [ErrorCode.INVALID_XPATH_SELECTOR]: ErrorState.INVALID_SELECTOR,
  [ErrorCode.INVALID_XPATH_SELECTOR_RETURN_TYPE]: ErrorState.INVALID_SELECTOR,
  [ErrorCode.JAVASCRIPT_ERROR]: ErrorState.JAVASCRIPT_ERROR,
  [ErrorCode.METHOD_NOT_ALLOWED]: ErrorState.UNKNOWN_METHOD,
  [ErrorCode.MOVE_TARGET_OUT_OF_BOUNDS]: ErrorState.MOVE_TARGET_OUT_OF_BOUNDS,
  [ErrorCode.NO_SUCH_ALERT]: ErrorState.NO_SUCH_ALERT,
  [ErrorCode.NO_SUCH_ELEMENT]: ErrorState.NO_SUCH_ELEMENT,
  [ErrorCode.NO_SUCH_FRAME]: ErrorState.NO_SUCH_FRAME,
  [ErrorCode.NO_SUCH_WINDOW]: ErrorState.NO_SUCH_WINDOW,
  [ErrorCode.SCRIPT_TIMEOUT]: ErrorState.SCRIPT_TIMEOUT,
  [ErrorCode.SESSION_NOT_CREATED]: ErrorState.SESSION_NOT_CREATED,
  [ErrorCode.STALE_ELEMENT_REFERENCE]: ErrorState.STALE_ELEMENT_REFERENCE,
  [ErrorCode.TIMEOUT]: ErrorState.TIMEOUT,
  [ErrorCode.UNABLE_TO_SET_COOKIE]: ErrorState.UNABLE_TO_SET_COOKIE,
  [ErrorCode.UNEXPECTED_ALERT_OPEN]: ErrorState.UNEXPECTED_ALERT_OPEN,
  [ErrorCode.UNKNOWN_ERROR]: ErrorState.UNKNOWN_ERROR,
  [ErrorCode.UNSUPPORTED_OPERATION]: ErrorState.UNKNOWN_COMMAND,
};

/**
 * Looks up the W3C WebDriver status string for a legacy error code, for
 * callers that need to report an error using both the legacy numeric code
 * and its W3C string equivalent.
 * @see https://w3c.github.io/webdriver/#errors
 */
export function stateForCode(code: ErrorCode): ErrorState {
  return CODE_TO_STATE[code] ?? ErrorState.UNKNOWN_ERROR;
}

/**
 * Represents an error returned from a WebDriver command request.
 */
export class BotError extends Error {
  code: ErrorCode;
  state: ErrorState;
  /** Duck-typing flag: an Error thrown in one realm and reported to another fails `instanceof`. */
  isAutomationError = true;

  constructor(code: ErrorCode, message: string = '') {
    super(message);
    this.code = code;
    this.state = stateForCode(code);

    const name = this.state.replace(/(^|\s+)[a-z]/g, (str) => str.toUpperCase().trimStart()).replace(/\s+/g, '');
    this.name = /Error$/.test(name) ? name : `${name}Error`;

    const template = new Error(this.message);
    template.name = this.name;
    this.stack = template.stack || '';
  }
}
