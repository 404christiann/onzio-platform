const marker = "data-page-editor-focus-target";
const identityAttributes = ["data-program-editor-section", "data-tryouts-editor-target", "data-about-editor-section", "aria-label"] as const;

/** Keep the selection identity when preview decoration temporarily blurs it. */
export function markPageEditorFocusTarget(target: HTMLElement) {
  target.ownerDocument.querySelectorAll(`[${marker}]`).forEach(element => element.removeAttribute(marker));
  target.setAttribute(marker, "true");
  target.focus({ preventScroll: true });
}

/** Resolve a fresh preview node after React commits/decorates replacement DOM. */
export function capturePageEditorFocus(document: Document): () => void {
  let frame: HTMLIFrameElement | null = document.activeElement?.tagName === "IFRAME" ? document.activeElement as HTMLIFrameElement : null;
  let previous = (frame?.contentDocument?.activeElement ?? document.activeElement) as HTMLElement | null;
  if (!previous || previous.tagName === "BODY" || previous.tagName === "HTML") {
    for (const candidate of Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe"))) {
      const marked = candidate.contentDocument?.querySelector<HTMLElement>(`[${marker}]`);
      if (marked) { frame = candidate; previous = marked; break; }
    }
  } else if (frame) {
    previous = frame.contentDocument?.querySelector<HTMLElement>(`[${marker}]`) ?? previous;
  }
  const identity = identityAttributes.map(attribute => [attribute, previous?.getAttribute(attribute)] as const)
    .find(([, value]) => value !== null && value !== undefined);
  return () => {
    if (frame && !frame.isConnected) return;
    const owner = frame?.contentDocument ?? previous?.ownerDocument;
    const replacement = identity && owner ? Array.from(owner.querySelectorAll<HTMLElement>(`[${identity[0]}]`))
      .find(candidate => candidate.getAttribute(identity[0]) === identity[1]) : null;
    const target = replacement ?? (previous?.isConnected ? previous : null);
    target?.focus({ preventScroll: true });
  };
}
