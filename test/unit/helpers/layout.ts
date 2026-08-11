type LayoutWindow = Pick<typeof globalThis, 'Element' | 'HTMLElement'> & {getComputedStyle: typeof getComputedStyle};

// jsdom does not implement real CSS layout: every element reports a zero-size
// getBoundingClientRect/offset*/scroll* regardless of its actual visibility, which makes the
// atoms' visibility/interactability checks (bot.dom.isShown, getOverflowState, ...) treat every
// element as clipped and not shown. Give elements a plausible fixed box (matching computed
// display:none/visibility:hidden so genuinely hidden elements still report zero size) so the
// atoms' real algorithms run their normal path instead of always hitting the "not shown" case.
//
// Defaults to the ambient `window` global installed by `installDomGlobals()`; pass a JSDOM
// instance's own `window` explicitly when patching a separate jsdom realm (e.g. atoms.spec.ts,
// which creates a fresh `JSDOM` per test rather than using the shared ambient globals).
export function patchLayout(win: LayoutWindow = (globalThis as unknown as {window: LayoutWindow}).window): void {
  win.Element.prototype.getBoundingClientRect = function (this: Element) {
    const style = win.getComputedStyle(this);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return {x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0} as DOMRect;
    }
    return {x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20} as DOMRect;
  };
  for (const prop of ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight', 'offsetWidth', 'offsetHeight']) {
    Object.defineProperty(win.HTMLElement.prototype, prop, {
      configurable: true,
      get(): number {
        return prop.includes('Width') ? 100 : 20;
      },
    });
  }
}
