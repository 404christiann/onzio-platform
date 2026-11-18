/**
 * Make everything outside a modal popup inert, and undo it on cleanup. Walks up
 * from the popup to <body> and marks each sibling that is not on the path, so
 * assistive tech and the keyboard cannot reach the page behind. Focus guards and
 * elements listed in `keep` (the backdrop) are left alone, and an element that was
 * already inert is not touched, so nesting with another modal is safe.
 */
export function applyInertOutside(popup: HTMLElement, keep: (element: Element) => boolean = () => false): () => void {
  const changed: HTMLElement[] = [];
  let node: HTMLElement | null = popup;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      if (sibling.inert || keep(sibling) || sibling.hasAttribute("data-base-ui-focus-guard") || sibling.matches("script, style, link")) continue;
      sibling.inert = true;
      changed.push(sibling);
    }
    node = parent;
  }
  return () => {
    for (const element of changed) element.inert = false;
  };
}

const TABBABLE = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[tabindex]",
  "[contenteditable='true']",
].join(",");

/** The elements Tab can reach inside a container, in DOM order. */
export function tabbablesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter((element) => {
    if (element.tabIndex < 0 || element.matches(":disabled") || element.inert || element.closest("[inert]")) return false;
    return element.getClientRects().length > 0;
  });
}

/** Where Tab should go instead of leaving the container, or null to let the browser move focus normally. */
export function wrapTarget(tabbables: readonly HTMLElement[], active: Element | null, backwards: boolean, container: HTMLElement): HTMLElement | null {
  if (tabbables.length === 0) return container;
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];
  if (backwards && (active === first || active === container || !container.contains(active))) return last;
  if (!backwards && (active === last || !container.contains(active))) return first;
  return null;
}
