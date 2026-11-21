import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TELEMETRY-03: PageBeacon sends one "view" per pathname and feeds the time-on-page heartbeat. The component is run as a
// plain function with useEffect/useRef/usePathname replaced, so the test owns the effect lifecycle: route changes,
// React's development double effects (StrictMode) and unmount.
type Effect = { effect: () => unknown; deps?: readonly unknown[] };
const host = vi.hoisted(() => ({ pathname: "/" as string | null, refs: [] as Array<{ current: unknown }>, refIndex: 0, effects: [] as Array<{ effect: () => unknown; deps?: readonly unknown[] }> }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => unknown, deps?: readonly unknown[]) => { host.effects.push({ effect, deps }); },
    useRef: (initial: unknown) => (host.refs[host.refIndex++] ??= { current: initial }),
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => host.pathname }));

import PageBeacon from "@/components/telemetry/PageBeacon";

type Body = { t: string; p: string; e?: number; r?: string; q?: string };
const bodies: Body[] = [];
const sendBeacon = vi.fn<(url: string, body: string) => boolean>();

class FakeWindow extends EventTarget {
  location = { pathname: "/", href: "https://club.example/", search: "" };
}
class FakeDocument extends EventTarget {
  hidden = false;
  referrer = "https://search.example/?q=club";
}
let win: FakeWindow;
let doc: FakeDocument;

/** A minimal React: effects run after render, cleanups first, and only when their dependencies changed. */
function mountBeacon() {
  host.refs.length = 0;
  let previous: Array<readonly unknown[] | undefined> = [];
  let cleanups: Array<(() => void) | undefined> = [];
  let mounted = false;
  const render = (): Effect[] => {
    host.refIndex = 0;
    host.effects = [];
    PageBeacon();
    return [...host.effects];
  };
  const commit = () => {
    const effects = render();
    const changed = effects.map(({ deps }, i) => !mounted || !deps || !previous[i] || deps.length !== previous[i]!.length || deps.some((dep, j) => !Object.is(dep, previous[i]![j])));
    effects.forEach((_, i) => { if (changed[i]) cleanups[i]?.(); });
    effects.forEach(({ effect, deps }, i) => {
      if (!changed[i]) return;
      const cleanup = effect();
      cleanups[i] = typeof cleanup === "function" ? (cleanup as () => void) : undefined;
      previous[i] = deps;
    });
    mounted = true;
  };
  commit();
  return {
    rerender: commit,
    /** React development mode: run every cleanup, then every effect again, with refs kept. */
    strictRemount() {
      cleanups.forEach((cleanup) => cleanup?.());
      cleanups = [];
      previous = [];
      mounted = false;
      commit();
    },
    unmount() { cleanups.forEach((cleanup) => cleanup?.()); cleanups = []; },
  };
}
function navigate(path: string, search = "") {
  win.location.pathname = path;
  win.location.search = search;
  win.location.href = `https://club.example${path}${search}`;
  host.pathname = path;
}
const at = (ms: number) => vi.advanceTimersByTime(ms);
const hide = () => { doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange")); };
const show = () => { doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange")); };
const views = () => bodies.filter((body) => body.t === "view");
const beats = () => bodies.filter((body) => body.t === "heartbeat");

beforeEach(() => {
  bodies.length = 0;
  sendBeacon.mockReset();
  sendBeacon.mockImplementation((_, body) => { bodies.push(JSON.parse(body)); return true; });
  win = new FakeWindow();
  doc = new FakeDocument();
  host.pathname = "/";
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", { sendBeacon });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PageBeacon views", () => {
  it("sends one view with the real referrer and query on first load", () => {
    win.location.search = "?utm_source=flyer";
    mountBeacon();
    expect(bodies).toEqual([{ t: "view", p: "/", r: "https://search.example/?q=club", q: "?utm_source=flyer" }]);
    expect(Object.keys(bodies[0])).toEqual(["t", "p", "r", "q"]);
  });

  it("sends nothing until the pathname is known, and nothing for a re-render on the same path", () => {
    host.pathname = null;
    const beacon = mountBeacon();
    expect(bodies).toEqual([]);
    host.pathname = "/";
    beacon.rerender();
    beacon.rerender();
    expect(views()).toHaveLength(1);
  });

  it("reports the previous page as the referrer of a client-side navigation", () => {
    const beacon = mountBeacon();
    navigate("/schedule", "?week=3");
    beacon.rerender();
    expect(views()).toEqual([
      { t: "view", p: "/", r: "https://search.example/?q=club", q: "" },
      { t: "view", p: "/schedule", r: "https://club.example/", q: "?week=3" },
    ]);
  });
});

describe("PageBeacon time on page", () => {
  it("sends the old path's last piece before the new view's beacon", () => {
    const beacon = mountBeacon();
    at(12_000);
    navigate("/news");
    beacon.rerender();
    expect(bodies.map((body) => [body.t, body.p, body.e])).toEqual([
      ["view", "/", undefined],
      ["heartbeat", "/", 12_000],
      ["view", "/news", undefined],
    ]);
    at(8_000);
    hide();
    expect(beats()).toEqual([{ t: "heartbeat", p: "/", e: 12_000 }, { t: "heartbeat", p: "/news", e: 8_000 }]);
  });

  it("reports a piece every minute while visible", () => {
    mountBeacon();
    at(120_000);
    expect(beats()).toEqual([{ t: "heartbeat", p: "/", e: 60_000 }, { t: "heartbeat", p: "/", e: 60_000 }]);
  });

  it("reports the visible piece when the tab hides, counts nothing while hidden and resumes when it shows", () => {
    mountBeacon();
    at(20_000);
    hide();
    expect(beats()).toEqual([{ t: "heartbeat", p: "/", e: 20_000 }]);
    at(600_000);
    expect(beats()).toHaveLength(1);
    show();
    at(30_000);
    hide();
    expect(beats().map((body) => body.e)).toEqual([20_000, 30_000]);
  });

  it("a page opened in a background tab accrues nothing until it is shown", () => {
    doc.hidden = true;
    mountBeacon();
    expect(views()).toHaveLength(1);
    at(300_000);
    expect(beats()).toEqual([]);
    show();
    at(10_000);
    hide();
    expect(beats()).toEqual([{ t: "heartbeat", p: "/", e: 10_000 }]);
  });

  it("pagehide reports the pending piece once; a restore from the back/forward cache resumes timing", () => {
    mountBeacon();
    at(15_000);
    win.dispatchEvent(new Event("pagehide"));
    expect(beats()).toEqual([{ t: "heartbeat", p: "/", e: 15_000 }]);
    at(300_000);
    expect(beats()).toHaveLength(1);
    win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    at(300_000);
    expect(beats()).toHaveLength(1);
    win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    at(5_000);
    win.dispatchEvent(new Event("pagehide"));
    expect(beats().map((body) => body.e)).toEqual([15_000, 5_000]);
  });

  it("does not resume on pageshow when the restored page is still hidden", () => {
    mountBeacon();
    at(15_000);
    win.dispatchEvent(new Event("pagehide"));
    doc.hidden = true;
    win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    at(300_000);
    expect(beats()).toHaveLength(1);
  });

  it("unmounting reports the pending piece, clears the timer and removes the listeners", () => {
    const beacon = mountBeacon();
    at(9_000);
    beacon.unmount();
    expect(beats()).toEqual([{ t: "heartbeat", p: "/", e: 9_000 }]);
    expect(vi.getTimerCount()).toBe(0);
    hide();
    show();
    win.dispatchEvent(new Event("pagehide"));
    at(300_000);
    expect(beats()).toHaveLength(1);
  });
});

describe("PageBeacon under React development double effects", () => {
  it("sends one view, keeps timing, and does not double report", () => {
    const beacon = mountBeacon();
    beacon.strictRemount();
    expect(views()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    at(60_000);
    expect(beats()).toEqual([{ t: "heartbeat", p: "/", e: 60_000 }]);
    hide();
    expect(beats()).toHaveLength(1);
  });

  it("registers each listener once, so a hide reports one piece", () => {
    const beacon = mountBeacon();
    beacon.strictRemount();
    at(10_000);
    hide();
    expect(beats()).toEqual([{ t: "heartbeat", p: "/", e: 10_000 }]);
  });

  it("still sends one view per new pathname afterwards, with the old piece first", () => {
    const beacon = mountBeacon();
    beacon.strictRemount();
    at(7_000);
    navigate("/news");
    beacon.rerender();
    expect(bodies.map((body) => [body.t, body.p])).toEqual([["view", "/"], ["heartbeat", "/"], ["view", "/news"]]);
  });
});
