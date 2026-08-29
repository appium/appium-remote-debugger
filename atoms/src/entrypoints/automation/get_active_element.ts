/** The document's currently focused element, or `null`/`<body>` if nothing has focus. */
export default function automationGetActiveElement(): Element | null {
  return document.activeElement;
}
