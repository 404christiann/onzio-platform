/**
 * Shared set-up for the classic admin's same-origin preview frames (the Overview's PageFrame, HomepagePreviewFrame,
 * ShopScaledFrame). A preview frame is scaled down and clipped by its box, so the browser's lazy loading treats most of
 * the page as off screen: pictures below (or, in the Overview's second column, above) the visible slice never load, the
 * section stays blank or zero-height, and two frames of the same page end up laid out differently. Inside a preview
 * everything is loaded now and every entrance effect is shown in its final state. Only the preview's own document is
 * touched (`html[data-preview="true"]`); the public site is unchanged.
 */

export const PREVIEW_DOCUMENT_ATTRIBUTE = "data-preview";

/**
 * Scoped to the preview document. Entrance effects (scroll reveals that start at opacity 0 and slide in, inline styles
 * left by an animation library) are shown as they end; crossfade stacks (slides with opacity 0 and no transform) keep
 * their own opacity so only the current slide shows.
 */
export const PREVIEW_DOCUMENT_STYLE = `
  html[data-preview="true"] *, html[data-preview="true"] *::before, html[data-preview="true"] *::after { animation: none !important; transition: none !important; }
  html[data-preview="true"] [style*="opacity: 0"][style*="transform"],
  html[data-preview="true"] [style*="opacity:0"][style*="transform"],
  html[data-preview="true"] [style*="opacity: 0"][style*="visibility: hidden"] { opacity: 1 !important; transform: none !important; visibility: visible !important; }
`;

const LAZY = 'img[loading="lazy"],iframe[loading="lazy"]';

/** Starts every lazy picture or embed in `scope` (and `scope` itself) loading now. */
export function loadPreviewMediaNow(scope: Element | Document): number {
  let count = 0;
  const eager = (element: Element) => { element.setAttribute("loading", "eager"); count++; };
  // Frame nodes belong to another realm, so `instanceof Element` is false for them: test for the method instead.
  if ("matches" in scope && scope.matches(LAZY)) eager(scope);
  scope.querySelectorAll(LAZY).forEach(eager);
  return count;
}

/**
 * Marks `doc` as a preview document, adds the preview style and keeps every picture loading eagerly as the page renders.
 * Returns a cleanup that undoes all three. Safe to call again after cleanup (a frame's document is replaced on load).
 */
export function preparePreviewDocument(doc: Document): () => void {
  const root = doc.documentElement;
  root.setAttribute(PREVIEW_DOCUMENT_ATTRIBUTE, "true");
  const style = doc.createElement("style");
  style.setAttribute("data-preview-document", "true");
  style.textContent = PREVIEW_DOCUMENT_STYLE;
  (doc.head ?? root).appendChild(style);
  loadPreviewMediaNow(doc);
  const View = doc.defaultView;
  const Observer = View?.MutationObserver ?? (typeof MutationObserver === "undefined" ? undefined : MutationObserver);
  const observer = Observer ? new Observer(records => {
    for (const record of records) {
      if (record.type === "attributes") { if ((record.target as Element).matches?.(LAZY)) loadPreviewMediaNow(record.target as Element); continue; }
      record.addedNodes.forEach(node => { if (node.nodeType === 1) loadPreviewMediaNow(node as Element); });
    }
  }) : undefined;
  observer?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["loading"] });
  return () => { observer?.disconnect(); style.remove(); root.removeAttribute(PREVIEW_DOCUMENT_ATTRIBUTE); };
}
