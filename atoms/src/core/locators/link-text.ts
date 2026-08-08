import {getVisibleText} from '../dom.js';
import * as cssLocator from './css.js';

function findLinks(target: string, root: Document | Element, isPartial: boolean): Element[] {
  const elements = cssLocator.many('a', root);

  return [...elements].filter((element) => {
    let text = getVisibleText(element);
    // getVisibleText replaces non-breaking spaces with plain spaces, so if these are present at
    // the beginning or end of the link text, trim the regular spaces off to be spec-compliant
    // when matching on link text.
    text = text.replace(/^[\s]+|[\s]+$/g, '');
    return (isPartial && text.includes(target)) || text === target;
  });
}

export const linkText = {
  single(target: string, root: Document | Element): Element | null {
    return findLinks(target, root, false)[0] ?? null;
  },
  many(target: string, root: Document | Element): Element[] {
    return findLinks(target, root, false);
  },
};

export const partialLinkText = {
  single(target: string, root: Document | Element): Element | null {
    return findLinks(target, root, true)[0] ?? null;
  },
  many(target: string, root: Document | Element): Element[] {
    return findLinks(target, root, true);
  },
};
