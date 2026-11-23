import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { guardPreviewBody, installPreviewLinkGuard } from "@/components/admin/ui/editor-kit";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";

/**
 * The guard against a minimal DOM: real selectors over real markup (static-dom) plus a W3C-ordered event dispatcher
 * (capture root to target, then bubble back), so what is proven here is propagation order, which is the whole design:
 * React listens for a portal on its container with one native capture and one native bubble listener.
 */
type Listener = { fn: (event: FakeEvent) => void; capture: boolean };
type FakeEvent = { type: string; target: StaticElement; defaultPrevented: boolean; preventDefault(): void; stopPropagation(): void; stopImmediatePropagation(): void };
const listeners = new WeakMap<StaticElement, Map<string, Listener[]>>();

function listen(node: StaticElement, type: string, fn: (event: FakeEvent) => void, capture: boolean) {
  const byType = listeners.get(node) ?? new Map<string, Listener[]>();
  listeners.set(node, byType);
  byType.set(type, [...(byType.get(type) ?? []), { fn, capture }]);
}
function unlisten(node: StaticElement, type: string, fn: (event: FakeEvent) => void, capture: boolean) {
  const byType = listeners.get(node);
  byType?.set(type, (byType.get(type) ?? []).filter(entry => !(entry.fn === fn && entry.capture === capture)));
}
const captureOf = (options?: boolean | { capture?: boolean }) => typeof options === "object" ? !!options?.capture : !!options;

function makeBody(markup: string) {
  const body = parseStaticMarkup(`<body>${markup}</body>`).children[0];
  const win = { open: vi.fn(() => ({ opened: true })) as unknown as (...args: never[]) => unknown };
  const original = win.open;
  Object.assign(body, {
    ownerDocument: { defaultView: win },
    addEventListener: (type: string, fn: (event: FakeEvent) => void, options?: boolean | { capture?: boolean }) => listen(body, type, fn, captureOf(options)),
    removeEventListener: (type: string, fn: (event: FakeEvent) => void, options?: boolean | { capture?: boolean }) => unlisten(body, type, fn, captureOf(options)),
  });
  return { body: body as StaticElement & Parameters<typeof guardPreviewBody>[0], win, original };
}

/** Dispatch like a browser: capture down, target, bubble up; stopPropagation ends it after the current node, immediate ends it now. */
function dispatch(target: StaticElement, type: string) {
  let stopped = false;
  let immediate = false;
  const event: FakeEvent = {
    type, target, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { stopped = true; },
    stopImmediatePropagation() { stopped = true; immediate = true; },
  };
  const path: StaticElement[] = [];
  for (let node: StaticElement | null = target; node; node = node.parentElement) path.unshift(node);
  const run = (node: StaticElement, phase: "capture" | "target" | "bubble") => {
    for (const entry of [...(listeners.get(node)?.get(type) ?? [])]) {
      if (phase === "capture" && !entry.capture) continue;
      if (phase === "bubble" && entry.capture) continue;
      entry.fn(event);
      if (immediate) return;
    }
  };
  for (const node of path.slice(0, -1)) { run(node, "capture"); if (stopped) return event; }
  run(target, "target");
  if (stopped) return event;
  for (const node of path.slice(0, -1).reverse()) { run(node, "bubble"); if (stopped) return event; }
  return event;
}

const MARKUP = `
  <a id="link" href="/shop"><span id="inside"><b id="deep">Buy</b></span></a>
  <a id="bare">no href</a>
  <map><area id="area" href="/map"></map>
  <div id="between"><button id="plain" type="button">Front</button><p id="text">copy</p></div>
  <form id="form"><button id="submit">Go</button><button id="submit2" type="submit">Go</button><input id="image" type="image"><input id="field" type="text"><button id="reset" type="button">x</button></form>
  <button id="loose">outside a form</button>`;
const at = (body: StaticElement, id: string) => body.querySelectorAll(`[id="${id}"]`)[0];

describe("the preview link guard", () => {
  it.each([
    ["a link", "link"], ["an element nested inside a link", "deep"], ["an area with an href", "area"],
    ["a submit button (no type)", "submit"], ["a submit button (type=submit)", "submit2"], ["an image input", "image"],
  ])("cancels and halts a click on %s", (_label, id) => {
    const { body } = makeBody(MARKUP);
    guardPreviewBody(body);
    const bubble = vi.fn();
    listen(body, "click", bubble, false);
    const event = dispatch(at(body, id), "click");
    expect(event.defaultPrevented).toBe(true);
    expect(bubble).not.toHaveBeenCalled();
  });

  it("cancels and halts auxclick on a link, and any submit event", () => {
    const { body } = makeBody(MARKUP);
    guardPreviewBody(body);
    const bubble = vi.fn();
    listen(body, "auxclick", bubble, false);
    listen(body, "submit", bubble, false);
    expect(dispatch(at(body, "deep"), "auxclick").defaultPrevented).toBe(true);
    expect(dispatch(at(body, "form"), "submit").defaultPrevented).toBe(true);
    expect(dispatch(at(body, "field"), "submit").defaultPrevented).toBe(true);
    expect(bubble).not.toHaveBeenCalled();
  });

  it("leaves every other click alone: no preventDefault, and propagation continues", () => {
    const { body } = makeBody(MARKUP);
    guardPreviewBody(body);
    const bubble = vi.fn();
    listen(body, "click", bubble, false);
    for (const id of ["plain", "text", "bare", "field", "reset", "loose"]) {
      const event = dispatch(at(body, id), "click");
      expect(event.defaultPrevented, id).toBe(false);
    }
    expect(bubble).toHaveBeenCalledTimes(6);
  });

  it("still runs capture listeners on the body itself (React's whole onClickCapture dispatch) and they see the cancelled click, while bubble listeners below and on the body never run", () => {
    for (const guardFirst of [true, false]) {
      const { body } = makeBody(`<div id="mid"><a id="link" href="/x"><i id="icon">i</i></a></div>`);
      const reactCapture = vi.fn((event: FakeEvent) => event.defaultPrevented);
      const midCapture = vi.fn();
      const reactBubble = vi.fn();
      const linkBubble = vi.fn();
      if (!guardFirst) listen(body, "click", reactCapture, true);
      guardPreviewBody(body);
      if (guardFirst) listen(body, "click", reactCapture, true);
      listen(body, "click", reactBubble, false);
      listen(at(body, "mid"), "click", midCapture, true);
      listen(at(body, "link"), "click", linkBubble, false);
      const event = dispatch(at(body, "icon"), "click");
      expect(reactCapture, `guardFirst=${guardFirst}`).toHaveBeenCalledTimes(1);
      // Only the body is guaranteed: a native capture listener on a node BELOW the body comes after the guard's halt. React has none there.
      expect(midCapture).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      // The listener on the same node is not skipped, so it ran regardless of order; it saw the click only if the guard ran first.
      expect(reactCapture.mock.results[0].value).toBe(guardFirst);
      expect(reactBubble).not.toHaveBeenCalled();
      expect(linkBubble).not.toHaveBeenCalled();
    }
  });

  it("does not use stopImmediatePropagation (a later listener on the same body still runs)", () => {
    const { body } = makeBody(MARKUP);
    guardPreviewBody(body);
    const later = vi.fn();
    listen(body, "click", later, true);
    dispatch(at(body, "link"), "click");
    expect(later).toHaveBeenCalledTimes(1);
  });

  it("blocks window.open while installed and restores the original on cleanup", () => {
    const { body, win, original } = makeBody(MARKUP);
    const undo = guardPreviewBody(body);
    expect(win.open).not.toBe(original);
    expect((win.open as () => unknown)()).toBeNull();
    expect(original).not.toHaveBeenCalled();
    undo();
    expect(win.open).toBe(original);
  });

  it("removes its listeners on cleanup", () => {
    const { body } = makeBody(MARKUP);
    const undo = guardPreviewBody(body);
    undo();
    expect(dispatch(at(body, "link"), "click").defaultPrevented).toBe(false);
    expect(dispatch(at(body, "form"), "submit").defaultPrevented).toBe(false);
  });

  it("installs on the iframe body, re-installs on load for the new document, and cleans up on unmount", () => {
    const first = makeBody(MARKUP);
    const second = makeBody(MARKUP);
    const frameListeners = new Set<() => void>();
    const frame = {
      contentDocument: { body: first.body } as { body: StaticElement | null },
      addEventListener: (_type: "load", fn: () => void) => frameListeners.add(fn),
      removeEventListener: (_type: "load", fn: () => void) => frameListeners.delete(fn),
    };
    const uninstall = installPreviewLinkGuard(frame as never);
    expect(dispatch(at(first.body, "link"), "click").defaultPrevented).toBe(true);
    frame.contentDocument = { body: second.body };
    frameListeners.forEach(fn => fn());
    expect(first.win.open).toBe(first.original);
    expect(dispatch(at(second.body, "link"), "click").defaultPrevented).toBe(true);
    expect(second.win.open).not.toBe(second.original);
    uninstall();
    expect(frameListeners.size).toBe(0);
    expect(dispatch(at(second.body, "link"), "click").defaultPrevented).toBe(false);
    expect(second.win.open).toBe(second.original);
  });

  it("does nothing, and does not throw, before the iframe has a body", () => {
    const frame = { contentDocument: null, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    expect(() => installPreviewLinkGuard(frame as never)()).not.toThrow();
  });
});

describe("window.open in a preview", () => {
  // The guard swaps `open` on the iframe's own window only. A portal preview's handlers run in the admin's JS context, so a
  // public component calling `window.open` would use the admin window's `open`, which the guard never touches. Nothing calls
  // it today; this fails the day something does, so that call gets its own guard instead of slipping past this one.
  const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
  it("no component or lib module calls window.open (outside the guard itself)", () => {
    const callers = [...sources("components"), ...sources("lib")]
      .filter(path => !path.endsWith("previewLinkGuard.ts"))
      .filter(path => /\bwindow\s*\.\s*open\s*\(|\bglobalThis\s*\.\s*open\s*\(/.test(readFileSync(path, "utf8")));
    expect(callers).toEqual([]);
  });
});
