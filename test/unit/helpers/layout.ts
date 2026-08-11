type LayoutWindow = Pick<typeof globalThis, 'Element' | 'HTMLElement'> & {getComputedStyle: typeof getComputedStyle};

// jsdom reports zero-size layout for every element, which makes the atoms' visibility checks treat
// everything as clipped/not-shown. Gives elements a plausible fixed box instead (still zero for
// display:none/visibility:hidden). Defaults to the ambient `window`; pass one explicitly for a
// separate jsdom realm (e.g. atoms.spec.ts's own per-test `JSDOM` instance).
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
