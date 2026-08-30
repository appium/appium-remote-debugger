export const AUTOMATION_TARGET_TYPE = 'WIRTypeAutomation';
export const LISTING_EVENT = '_rpc_forwardGetListing:';
export const DEFAULT_SESSION_TIMEOUT_MS = 10000;
export const DEFAULT_PAGE_LOAD_TIMEOUT_MS = 300000;
export const DEFAULT_SCRIPT_TIMEOUT_MS = 30000;
/**
 * How long a single `Automation.*` command waits for WebKit's response. A command right after
 * `performInteractionSequence`/`cancelInteractionSequence` can go unanswered forever with no
 * error - https://bugs.webkit.org/show_bug.cgi?id=322937 - so every command needs a ceiling.
 */
export const DEFAULT_COMMAND_TIMEOUT_MS = 120000;
