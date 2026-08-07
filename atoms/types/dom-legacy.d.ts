// Ambient declarations for browser APIs the vendored atoms rely on that current TypeScript DOM
// lib no longer ships: the WebSQL API (`atoms/src/atoms/html5/database.js`) was removed from
// lib.dom.d.ts entirely, and Closure's `IArrayLike<T>` / `GeolocationPositionOptions` are Closure's
// own names for lib.dom.d.ts's `ArrayLike<T>` / `PositionOptions`.

// Default type param: Closure treats a bare `{IArrayLike}` (no <T>) as implicitly `IArrayLike<?>`,
// but TS's JSDoc type-reference resolution requires an explicit argument unless one is defaulted.
type IArrayLike<T = any> = ArrayLike<T>;
type GeolocationPositionOptions = PositionOptions;
// Closure's own name for the ES6 iterator-protocol result shape ({done, value}). Deliberately
// untyped rather than a generic interface: combined with `@template VALUE` (each function's own
// template parameter is a structurally distinct type variable to tsc), a generic
// `IIterableResult<T>` produces "two different types with this name exist, but they are
// unrelated" errors across call sites — not worth chasing for this deep, internal-only iterator
// plumbing that no atom-authored code touches.
type IIterableResult<T> = any;
type IteratorIterable<T> = Iterator<T> & Iterable<T>;
// Alias for the pre-ES5 `arguments` object's type; Closure calls it `Arguments`, TS calls it
// `IArguments`.
type Arguments = IArguments;
// Closure's name for the global object type (`goog.global`, typed `{!Global}` in base.js) — same
// shape as goog.d.ts's `goog.global` declaration (indexable, since this codebase reads/writes
// arbitrary global properties off of it).
type Global = typeof globalThis & Record<string, any>;

// Legacy IE-only text range API (document.body.createTextRange()), predates Selection/Range.
interface TextRange {
  moveToElementText(element: Element): void;
  select(): void;
  getBoundingClientRect?(): DOMRect;
  [key: string]: any;
}

// User-Agent Client Hints API (navigator.userAgentData) — present in current Chromium/WebKit but
// not yet part of TS's bundled lib.dom.d.ts.
interface NavigatorUABrandVersion {
  readonly brand: string;
  readonly version: string;
}
interface NavigatorUAData {
  readonly brands: NavigatorUABrandVersion[];
  readonly mobile: boolean;
  readonly platform: string;
  getHighEntropyValues(hints: string[]): Promise<Record<string, any>>;
}
interface Navigator {
  readonly userAgentData?: NavigatorUAData;
}

// Trusted Types API (window.trustedTypes) — present in current Chromium/WebKit but not yet part
// of TS's bundled lib.dom.d.ts.
interface TrustedHTML {}
interface TrustedScript {}
interface TrustedScriptURL {}
interface TrustedTypePolicy {
  createHTML(input: string): TrustedHTML;
  createScript(input: string): TrustedScript;
  createScriptURL(input: string): TrustedScriptURL;
}
interface TrustedTypePolicyFactory {
  createPolicy(name: string, rules?: object): TrustedTypePolicy;
  readonly emptyHTML: TrustedHTML;
  readonly emptyScript: TrustedScript;
}
interface Window {
  readonly trustedTypes?: TrustedTypePolicyFactory;
}

interface SQLResultSetRowList {
  readonly length: number;
  item(index: number): any;
}

interface SQLResultSet {
  readonly insertId: number;
  readonly rowsAffected: number;
  readonly rows: SQLResultSetRowList;
}

interface SQLError {
  readonly code: number;
  readonly message: string;
}

interface SQLTransaction {
  executeSql(
    sqlStatement: string,
    args?: any[],
    callback?: (transaction: SQLTransaction, resultSet: SQLResultSet) => void,
    errorCallback?: (transaction: SQLTransaction, error: SQLError) => void,
  ): void;
}

interface Database {
  transaction(
    callback: (transaction: SQLTransaction) => void,
    errorCallback?: (error: SQLError) => void,
    successCallback?: () => void,
  ): void;
}

interface Window {
  openDatabase(name: string, version: string, displayName: string, estimatedSize: number): Database;
}

// This codebase treats `Element`/`HTMLElement` as the common duck-typed shape of "any DOM element
// we were handed", then defensively probes it for members that only exist on specific subtypes
// (form controls, anchors, iframes, shadow roots, ...) or that are legacy/nonstandard IE APIs.
// Rather than narrowing every call site to the exact concrete subtype — which the calling code
// often can't know statically either, hence the probing — these are declared loosely here to match
// that intent.
interface HTMLElement {
  // Legacy IE only. currentStyle/runtimeStyle predate getComputedStyle; createTextRange predates
  // Selection/Range; sourceIndex predates any standard document-order comparison; removeNode
  // predates ChildNode.remove().
  currentStyle?: CSSStyleDeclaration;
  runtimeStyle?: CSSStyleDeclaration;
  createTextRange?(): any;
  removeNode?(deep?: boolean): Node;
  // Pre-standard shadow DOM (Shadow DOM v0).
  getDestinationInsertionPoints?(): Node[];
  // Read directly without a presence guard elsewhere in this codebase (it already knows, via
  // bot.dom.isElement()-style checks, that the concrete element has these) — left non-optional so
  // reads don't require re-proving what the caller already established.
  sourceIndex: number;
  value: string;
  type: string;
  checked: boolean;
  selected: boolean;
  disabled: boolean;
  multiple: boolean;
  min: string;
  max: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  // HTMLAnchorElement/HTMLAreaElement/HTMLLabelElement/HTMLLinkElement.
  href: string;
  target: string;
  htmlFor: string;
  shape: string;
  coords: string;
  // HTMLIFrameElement/HTMLFrameElement.
  contentWindow: Window | null;
  contentDocument: Document | null;
  // Old contentDocument alias some browsers exposed on the element itself.
  document: Document;
  // HTMLDetailsElement.
  open: boolean;
  // HTMLInputElement/HTMLFormElement.
  name: string;
}

// goog.events.BrowserEvent.init() patches a raw browser event into a normalized cross-browser
// shape and is written to accept a plain `Event`, then defensively read whichever of
// MouseEvent/KeyboardEvent/TouchEvent/PointerEvent/PopStateEvent's fields are actually present at
// runtime — the same duck-typing intent as the HTMLElement extension above.
interface Event {
  // MouseEvent (also read on other event kinds for legacy fallback purposes).
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  pageX: number;
  pageY: number;
  button: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  relatedTarget: EventTarget | null;
  // Legacy IE-only equivalents of relatedTarget, and non-standard (but broadly implemented)
  // layer-relative coordinates predating offsetX/offsetY standardization.
  fromElement: Node | null;
  toElement: Node | null;
  layerX: number;
  layerY: number;
  offsetX: number;
  offsetY: number;
  // KeyboardEvent (legacy numeric fields; modern code should prefer .key/.code).
  keyCode: number;
  charCode: number;
  key: string;
  // PointerEvent / legacy MSPointerEvent.
  pointerId: number;
  pointerType: string;
  initPointerEvent?(...args: any[]): void;
  // TouchEvent.
  changedTouches: Touch[];
  // Legacy IE MSGestureEvent init method (no current DOM lib declares this event type at all).
  initGestureEvent?(...args: any[]): void;
  // PopStateEvent.
  state: any;
}

// Legacy IE-only document.createStyleSheet, predates document.styleSheets/CSSStyleSheet.
interface Document {
  createStyleSheet?(): CSSStyleSheet;
}

// V8/Node-specific (also present in Safari/JSC as of recent versions); not in lib.es5's
// ErrorConstructor.
interface ErrorConstructor {
  captureStackTrace?(targetObject: object, constructorOpt?: Function): void;
}

// IE10/Windows Phone-only navigator flag (bot.events.SUPPORTS_MSPOINTER_EVENTS).
interface Navigator {
  msPointerEnabled?: boolean;
}

// Legacy IE10/Windows Phone pointer-event type constants (bot.Touchscreen/bot.Mouse's MSPointer*
// event paths); not part of any current DOM lib.
declare const MSPointerEvent: {
  MSPOINTER_TYPE_TOUCH: number;
  MSPOINTER_TYPE_MOUSE: number;
};

// This codebase (goog.style) frequently indexes CSSStyleDeclaration by a dynamically-computed
// camelCase property name (`element.style[camelStyle]`) — valid at runtime in every browser, but
// not modeled by lib.dom.d.ts's CSSStyleDeclaration, which only declares numeric indexing.
interface CSSStyleDeclaration {
  [propertyName: string]: any;
}
