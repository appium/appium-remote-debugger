// Ambient declaration for the Closure Library bootstrap API defined in
// `atoms/src/third_party/closure/goog/base.js`.
//
// `tsc --checkJs` does not reliably merge `goog.<member> = ...` assignments made directly on the
// `goog` object (as opposed to on a namespace `goog.provide()`s, e.g. `goog.array`, `goog.dom`,
// `bot`, `webdriver`, ...) across files the way plain expando-property inference normally works
// for global scripts — see the investigation notes in docs/update-atoms.md. Namespaces created via
// `goog.provide('some.namespace')` and populated with nested assignments (`some.namespace.fn = ...`)
// are unaffected and continue to be inferred normally from their defining `.js` file; only the
// members declared directly on `goog` itself need to be listed here, once, so every file that
// consumes them (almost all of them, via `goog.require`/`goog.provide`) resolves consistently.
//
// This file intentionally does not attempt to precisely type base.js's internal-only helpers
// (trailing-underscore members, module-loader plumbing) that nothing outside base.js consumes —
// those are typed loosely since nothing depends on their shape.

declare var COMPILED: boolean;

// `tsc`'s CommonJS-module heuristic for allowJs recognizes `exports.foo = ...` (property
// assignment) as module-establishing syntax, but not a bare `exports = SomeClass;` whole-module
// reassignment — several `goog.module(...)` files in this tree use the latter as a "default
// export" of a single class/function. Declaring it loosely here (rather than per-file) avoids each
// of those files' distinct assignment conflicting under `var` redeclaration rules.
declare var exports: any;

declare namespace goog {
  function provide(name: string): void;
  function require(namespace: string): any;
  function requireType(namespace: string): any;
  function module(name: string): void;
  namespace module {
    function get(name: string): any;
    function declareLegacyNamespace(): void;
  }
  function scope(fn: () => void): void;
  function define<T>(name: string, defaultValue: T): T;
  function forwardDeclare(name: string): void;
  function declareModuleId(namespace: string): void;
  function setTestOnly(opt_message?: string): void;
  function addDependency(relPath: string, provides: string[], requires: string[], opt_loadFlags?: any): void;

  const global: typeof globalThis & Record<string, any>;
  const basePath: string;

  const DEBUG: boolean;
  const LOCALE: string;
  const TRUSTED_SITE: boolean;
  const TRUSTED_TYPES_POLICY_NAME: string;
  const FEATURESET_YEAR: number;
  const NATIVE_ARRAY_PROTOTYPES: boolean;
  const DEPENDENCIES_ENABLED: boolean;
  const ENABLE_DEBUG_LOADER: boolean;
  const ENABLE_CHROME_APP_SAFE_SCRIPT_LOADING: boolean;
  const DISALLOW_TEST_ONLY_CODE: boolean;
  const LOAD_MODULE_USING_EVAL: boolean;
  const SEAL_MODULE_EXPORTS: boolean;
  const TRANSPILE: string;
  const ASSUME_ES_MODULES_TRANSPILED: boolean;

  function getObjectByName(name: string, opt_obj?: object): any;
  function getUid(obj: object): number;
  function hasUid(obj: object): boolean;
  function removeUid(obj: object): void;
  function exportSymbol(publicPath: string, object: any, opt_objectToExportTo?: object): void;
  function exportProperty(object: any, publicName: string, symbol: any): void;
  function typeOf(value: any): string;
  function isArrayLike(val: any): boolean;
  function isDateLike(val: any): boolean;
  function isObject(val: any): boolean;
  function now(): number;
  function addSingletonGetter(ctor: Function): void;
  function bind(fn: Function, selfObj?: any, ...var_args: any[]): Function;
  function partial(fn: Function, ...var_args: any[]): Function;
  function inherits(childCtor: Function, parentCtor: Function): void;
  function cloneObject(obj: any): any;
  function globalEval(script: string): void;
  function createTrustedTypesPolicy(name: string): any;
  function getCssName(className: string, opt_modifier?: string): string;
  function setCssNameMapping(mapping: object, opt_style?: string): void;
  function getMsg(str: string, opt_values?: object, opt_options?: any): string;
  function getMsgWithFallback(a: string, b: string): string;

  const Disposable: any;
  const ModuleType: any;
  const GetMsgOptions: any;

  // Namespaces implemented as `goog.module(...)` + `declareLegacyNamespace()` elsewhere in the
  // vendored tree (goog.array, goog.asserts, ...): their real exports are locally scoped to their
  // own module and only bridged onto the `goog.<name>` global at runtime by Closure's module
  // loader, which `tsc` has no static visibility into. Consumers that reach them via
  // `goog.require('x.y.z')`'s return value already get real (if untyped) values since `require`
  // returns `any`; these entries only cover the legacy global-namespace access path.
  const array: any;
  const asserts: any;
  const labs: any;
  const dispose: any;
  const collections: any;
  const object: any;

  // base.js-internal-only helpers (no cross-file consumers) — kept loosely typed.
  const abstractMethod: any;
  const defineClass: any;
  const exportPath_: any;
  const constructNamespace_: any;
  const getScriptNonce_: any;
  const hasBadLetScoping: any;
  const identity_: any;
  const instantiatedSingletons_: any;
  const isInEs6ModuleLoader_: any;
  const isInGoogModuleLoader_: any;
  const isInModuleLoader_: any;
  const loadedModules_: any;
  const loadFileSync_: any;
  const loadModule: any;
  const loadModuleFromSource_: any;
  const logToConsole_: any;
  const moduleLoaderState_: any;
  const NONCE_PATTERN_: any;
  const normalizePath_: any;
  const UID_PROPERTY_: any;
  const uidCounter_: any;
  const VALID_MODULE_RE_: any;
  const bindJs_: any;
  const bindNative_: any;
}

// Same goog.module()/declareLegacyNamespace() gap as above, but for nested namespaces that are
// otherwise populated normally via goog.provide() elsewhere (goog.html.SafeUrl, goog.iter.*,
// goog.events.*) — only the specific goog.module()-based members need bridging here.
declare namespace goog.html {
  const SafeHtml: any;
  const SafeScript: any;
  const SafeStyle: any;
  const SafeStyleSheet: any;
}
declare namespace goog.iter {
  const es6: any;
}
declare namespace goog.events {
  const BrowserFeature: any;
}
