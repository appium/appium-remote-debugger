import {getOwnerDocument} from '../dom-core.js';
import {BotError, ErrorCode} from '../error.js';

enum XPathResultType {
  ORDERED_NODE_SNAPSHOT_TYPE = 7,
  FIRST_ORDERED_NODE_TYPE = 9,
}

const DEFAULT_NAMESPACES: Record<string, string> = {svg: 'http://www.w3.org/2000/svg'};
function defaultResolver(prefix: string | null): string | null {
  return (prefix && DEFAULT_NAMESPACES[prefix]) || null;
}

/**
 * Evaluates an XPath expression using the document's XPathEvaluator.
 * @return The XPathResult, or null if the root's ownerDocument isn't loaded yet.
 */
function evaluateXPath(node: Document | Element, path: string, resultType: XPathResultType): XPathResult | null {
  const doc = getOwnerDocument(node);

  if (!doc.documentElement) {
    // Document is not loaded yet.
    return null;
  }

  try {
    // Build a resolver from the namespaces actually present in the document, rather than relying
    // on `doc.createNSResolver`, since it can't resolve a prefix that isn't declared anywhere the
    // resolver itself can see (e.g. an SVG namespace only declared on a descendant element).
    const reversedNamespaces = new Map<string, string>();
    const allNodes = doc.getElementsByTagName('*');
    for (const n of allNodes) {
      const ns = n.namespaceURI;
      if (ns && !reversedNamespaces.has(ns)) {
        let prefix = n.lookupPrefix(ns);
        if (!prefix) {
          const m = ns.match(/.*\/(\w+)\/?$/);
          prefix = m ? m[1] : 'xhtml';
        }
        reversedNamespaces.set(ns, prefix);
      }
    }
    const namespaces = new Map<string, string>();
    for (const [ns, prefix] of reversedNamespaces) {
      namespaces.set(prefix, ns);
    }
    let resolver: XPathNSResolver = (prefix: string | null): string | null =>
      (prefix && namespaces.get(prefix)) || null;

    try {
      return doc.evaluate(path, node, resolver, resultType, null);
    } catch (te) {
      if (te instanceof TypeError) {
        // Fall back to a simplified implementation.
        resolver = doc.createNSResolver ? doc.createNSResolver(doc.documentElement) : defaultResolver;
        return doc.evaluate(path, node, resolver, resultType, null);
      }
      throw te;
    }
  } catch (ex) {
    throw new BotError(
      ErrorCode.INVALID_SELECTOR_ERROR,
      `Unable to locate an element with the xpath expression ${path} because of the following error:\n${ex}`,
    );
  }
}

function checkElement(node: Node | null | undefined, path: string): void {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    throw new BotError(
      ErrorCode.INVALID_SELECTOR_ERROR,
      `The result of the xpath expression "${path}" is: ${node}. It should be an element.`,
    );
  }
}

/** Finds an element using an XPath expression. */
export function single(target: string, root: Document | Element): Element | null {
  const result = evaluateXPath(root, target, XPathResultType.FIRST_ORDERED_NODE_TYPE);
  const node = result ? result.singleNodeValue : null;

  if (node !== null) {
    checkElement(node, target);
  }
  return node as Element | null;
}

/** Finds elements using an XPath expression. */
export function many(target: string, root: Document | Element): Element[] {
  const result = evaluateXPath(root, target, XPathResultType.ORDERED_NODE_SNAPSHOT_TYPE);
  const nodes: Node[] = [];
  if (result) {
    for (let i = 0; i < result.snapshotLength; i++) {
      const item = result.snapshotItem(i);
      if (item) {
        nodes.push(item);
      }
    }
  }

  for (const n of nodes) {
    checkElement(n, target);
  }
  // checkElement above throws for any non-Element result, so every node here is an Element.
  return nodes as Element[];
}
