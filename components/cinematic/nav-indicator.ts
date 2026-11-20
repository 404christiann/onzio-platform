/**
 * RC-NAV: one red indicator in the cinematic desktop nav. It follows the tab under a mouse or pen, or the tab with
 * keyboard focus (`:focus-visible`), holds on an open drop-down's tab, and otherwise rests on the current page's tab.
 * Touch input never moves it. Returns `place` to re-measure after a render and `dispose` to detach everything.
 */
export function followNavIndicator(nav: HTMLElement, bar: HTMLElement): { place: () => void; dispose: () => void } {
  let hovered: HTMLElement | null = null;
  let focused: HTMLElement | null = null;
  const topItem = (node: EventTarget | null) => {
    const element = node as Element | null;
    if (!element?.closest || !nav.contains(element)) return null;
    return element.closest(".nav-group")?.querySelector<HTMLElement>(":scope > .nav-item") ?? element.closest<HTMLElement>(".nav-item");
  };
  const place = (snap = false) => {
    const target = hovered ?? focused
      ?? nav.querySelector<HTMLElement>(".nav-group.open > .nav-item")
      ?? nav.querySelector<HTMLElement>(".nav-item.active");
    if (!target) { bar.removeAttribute("data-visible"); return; }
    // Measure in the nav's own units so a scaled editor preview still lines up.
    const box = nav.getBoundingClientRect();
    const scale = nav.offsetWidth ? box.width / nav.offsetWidth : 1;
    const rect = target.getBoundingClientRect();
    // Appearing from nothing should not slide in from wherever the indicator last rested.
    if (snap || !bar.hasAttribute("data-visible")) bar.setAttribute("data-snap", "");
    bar.style.transform = `translateX(${(rect.left - box.left) / scale}px) scaleX(${rect.width / scale})`;
    bar.setAttribute("data-visible", "");
    if (bar.hasAttribute("data-snap")) { void bar.offsetWidth; bar.removeAttribute("data-snap"); }
  };
  const over = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const item = topItem(event.target);
    if (item && item !== hovered) { hovered = item; place(); }
  };
  const leave = () => { if (hovered) { hovered = null; place(); } };
  const focusIn = (event: FocusEvent) => {
    let visible = false;
    try { visible = (event.target as Element).matches(":focus-visible"); } catch { /* selector unsupported */ }
    focused = visible ? topItem(event.target) : null;
    place();
  };
  const focusOut = (event: FocusEvent) => {
    if (nav.contains(event.relatedTarget as Node | null)) return;
    focused = null;
    place();
  };
  const view = nav.ownerDocument.defaultView;
  const resize = view && "ResizeObserver" in view ? new view.ResizeObserver(() => place(true)) : null;
  resize?.observe(nav);
  nav.ownerDocument.fonts?.ready.then(() => place(true)).catch(() => {});
  nav.addEventListener("pointerover", over);
  nav.addEventListener("pointerleave", leave);
  nav.addEventListener("focusin", focusIn);
  nav.addEventListener("focusout", focusOut);
  place(true);
  nav.setAttribute("data-indicator-ready", "");
  return {
    place: () => place(),
    dispose: () => {
      resize?.disconnect();
      nav.removeEventListener("pointerover", over);
      nav.removeEventListener("pointerleave", leave);
      nav.removeEventListener("focusin", focusIn);
      nav.removeEventListener("focusout", focusOut);
      nav.removeAttribute("data-indicator-ready");
    },
  };
}
