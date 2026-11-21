import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSponsorUuid,
  LOGO_SEEN_DWELL_MS,
  LOGO_SEEN_FLUSH_MS,
  LOGO_SEEN_MAX_IDS,
  LOGO_SEEN_RATIO,
  startSponsorLogoSeen,
} from "@/components/telemetry/logo-seen";
import { attachSponsorLogoSeen } from "@/components/telemetry/useSponsorLogoSeen";
import type { TelemetryBody } from "@/components/telemetry/send";

// TELEMETRY-03: a sponsor logo is "seen" after one second at 50% or more while the tab is visible; each id once per
// page view; at most one beacon every two seconds; whatever is queued goes out immediately when the page hides.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

class FakeElement {
  constructor(private readonly id: string | null) {}
  getAttribute(name: string) { return name === "data-sponsor-id" ? this.id : null; }
}
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observed = new Set<unknown>();
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback, readonly options: IntersectionObserverInit) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(element: unknown) { this.observed.add(element); }
  unobserve(element: unknown) { this.observed.delete(element); }
  disconnect() { this.disconnected = true; this.observed.clear(); }
  /** Reports one element crossing to `ratio`; mirrors the browser's isIntersecting unless told otherwise. */
  report(element: unknown, ratio: number, isIntersecting = ratio > 0) {
    this.callback([{ target: element, intersectionRatio: ratio, isIntersecting } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}
class FakeDocument extends EventTarget { hidden = false; }
class FakeWindow extends EventTarget { location = { pathname: "/" }; }

let doc: FakeDocument;
let win: FakeWindow;
const bodies: TelemetryBody[] = [];
const send = (body: TelemetryBody) => { bodies.push(body); };
const at = (ms: number) => vi.advanceTimersByTime(ms);
const sentIds = () => bodies.flatMap((body) => (body.t === "logo_seen" ? body.s : []));

function mount(ids: Array<string | null>, opts: { path?: string; send?: (body: TelemetryBody) => void } = {}) {
  const elements = ids.map((id) => new FakeElement(id));
  const root = { querySelectorAll: (selector: string) => (selector === "[data-sponsor-id]" ? elements.filter((_, i) => ids[i] !== null) : []) };
  const stop = startSponsorLogoSeen(root as unknown as Element, { send, ...opts });
  const io = FakeIntersectionObserver.instances.at(-1);
  return { elements, io: io as FakeIntersectionObserver, stop };
}
const hide = () => { doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange")); };
const show = () => { doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange")); };

beforeEach(() => {
  bodies.length = 0;
  FakeIntersectionObserver.instances.length = 0;
  doc = new FakeDocument();
  win = new FakeWindow();
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("isSponsorUuid", () => {
  it("accepts only 8-4-4-4-12 hex, in either case", () => {
    expect(isSponsorUuid(uuid(1))).toBe(true);
    expect(isSponsorUuid("8F1C2A64-3D0E-4B57-9A11-5C2E7D9F0A31")).toBe(true);
    for (const bad of ["default-carousel-chronic", "", "logo-1", uuid(1) + "0", ` ${uuid(1)}`, "8f1c2a643d0e4b579a115c2e7d9f0a31", "8f1c2a64-3d0e-4b57-9a11-5c2e7d9f0a3g", null, undefined, 7]) {
      expect(isSponsorUuid(bad)).toBe(false);
    }
  });
});

describe("dwell: half visible for a full second", () => {
  it("observes with a 0.5 threshold and counts nothing before 1000 ms", () => {
    const { elements, io } = mount([uuid(1)]);
    expect(io.options).toEqual({ threshold: LOGO_SEEN_RATIO });
    io.report(elements[0], 0.5);
    at(LOGO_SEEN_DWELL_MS - 1);
    expect(bodies).toEqual([]);
    expect(sentIds()).toEqual([]);
    // Not counted yet, so no beacon is even scheduled behind the dwell timer.
    expect(vi.getTimerCount()).toBe(1);
  });

  it("counts at exactly 1000 ms, then sends only when the two second window closes", () => {
    const { elements, io } = mount([uuid(1)]);
    io.report(elements[0], 0.5);
    at(LOGO_SEEN_DWELL_MS);
    expect(bodies).toEqual([]);
    at(LOGO_SEEN_FLUSH_MS - 1);
    expect(bodies).toEqual([]);
    at(1);
    expect(bodies).toEqual([{ t: "logo_seen", p: "/", s: [uuid(1)] }]);
  });

  it("cancels when the logo drops below 50% before a second, and starts over when it returns", () => {
    const { elements, io } = mount([uuid(1)]);
    io.report(elements[0], 0.9);
    at(900);
    io.report(elements[0], 0.4);
    at(5_000);
    expect(bodies).toEqual([]);
    io.report(elements[0], 0.6);
    at(LOGO_SEEN_DWELL_MS - 1);
    io.report(elements[0], 0.2, true);
    at(5_000);
    expect(bodies).toEqual([]);
    io.report(elements[0], 1);
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS);
    expect(sentIds()).toEqual([uuid(1)]);
  });

  it("ignores ratios under 0.5 and entries that are not intersecting", () => {
    const { elements, io } = mount([uuid(1), uuid(2)]);
    io.report(elements[0], 0.49);
    io.report(elements[1], 0.9, false);
    at(10_000);
    expect(bodies).toEqual([]);
  });

  it("counts a logo once per tracker, even after it leaves and returns", () => {
    const { elements, io } = mount([uuid(1)]);
    io.report(elements[0], 1);
    at(LOGO_SEEN_DWELL_MS);
    io.report(elements[0], 0);
    io.report(elements[0], 1);
    at(LOGO_SEEN_DWELL_MS + 10_000);
    expect(sentIds()).toEqual([uuid(1)]);
  });

  it("counts a sponsor once however many copies of the track are showing it", () => {
    // The marquee renders every logo twice; both copies carry the id.
    const { elements, io } = mount([uuid(1), uuid(2), uuid(1), uuid(2)]);
    expect(io.observed.size).toBe(4);
    io.report(elements[0], 1);
    io.report(elements[2], 1);
    io.report(elements[1], 0.7);
    at(LOGO_SEEN_DWELL_MS);
    io.report(elements[3], 1);
    at(LOGO_SEEN_DWELL_MS + 10_000);
    expect(sentIds().sort()).toEqual([uuid(1), uuid(2)]);
    expect(bodies).toHaveLength(1);
  });

  it("an id counted by one copy stops its other copy from counting later", () => {
    const { elements, io } = mount([uuid(1), uuid(1)]);
    io.report(elements[0], 1);
    at(LOGO_SEEN_DWELL_MS);
    io.report(elements[1], 1);
    at(LOGO_SEEN_DWELL_MS + 10_000);
    expect(sentIds()).toEqual([uuid(1)]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("fallback and non-uuid ids", () => {
  it("never observes or sends them", () => {
    const { io } = mount(["default-carousel-chronic", "logo-1", uuid(5), "", null]);
    expect(io.observed.size).toBe(1);
    expect([...io.observed].map((el) => (el as FakeElement).getAttribute("data-sponsor-id"))).toEqual([uuid(5)]);
  });

  it("builds no observer and sends nothing when every logo is a fallback", () => {
    const { stop } = mount(["default-carousel-chronic", "default-carousel-modern", null]);
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    at(60_000);
    stop();
    expect(bodies).toEqual([]);
  });
});

describe("batching", () => {
  it("23 logos go out as 10, 10 and 3, each beacon at least two seconds after the last", () => {
    const ids = Array.from({ length: 23 }, (_, i) => uuid(i + 1));
    const times: number[] = [];
    const { elements, io } = mount(ids, { send: (body) => { send(body); times.push(Date.now()); } });
    const start = Date.now();
    for (const element of elements) io.report(element, 1);
    at(LOGO_SEEN_DWELL_MS);
    expect(times).toEqual([]);
    at(5 * LOGO_SEEN_FLUSH_MS);
    expect(bodies.map((body) => (body as { s: string[] }).s.length)).toEqual([10, 10, 3]);
    expect(sentIds()).toEqual(ids);
    expect(times.map((time) => time - start)).toEqual([3_000, 5_000, 7_000]);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(LOGO_SEEN_FLUSH_MS);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(LOGO_SEEN_FLUSH_MS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends the ids in the order they were seen", () => {
    const { elements, io } = mount([uuid(1), uuid(2), uuid(3)]);
    io.report(elements[2], 1);
    at(100);
    io.report(elements[0], 1);
    at(100);
    io.report(elements[1], 1);
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS);
    expect(sentIds()).toEqual([uuid(3), uuid(1), uuid(2)]);
  });

  it("starts a new two second window for a logo seen after a beacon went out", () => {
    const { elements, io } = mount([uuid(1), uuid(2)]);
    io.report(elements[0], 1);
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS);
    expect(bodies).toHaveLength(1);
    io.report(elements[1], 1);
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS - 1);
    expect(bodies).toHaveLength(1);
    at(1);
    expect(bodies).toEqual([{ t: "logo_seen", p: "/", s: [uuid(1)] }, { t: "logo_seen", p: "/", s: [uuid(2)] }]);
  });

  it("every body is exactly {t, p, s} with 1 to 10 distinct ids", () => {
    const ids = Array.from({ length: 12 }, (_, i) => uuid(i + 1));
    const { elements, io, stop } = mount([...ids, ...ids]);
    for (const element of elements) io.report(element, 1);
    at(LOGO_SEEN_DWELL_MS);
    stop();
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(Object.keys(body)).toEqual(["t", "p", "s"]);
      const { s } = body as { s: string[] };
      expect(s.length).toBeGreaterThanOrEqual(1);
      expect(s.length).toBeLessThanOrEqual(LOGO_SEEN_MAX_IDS);
      expect(new Set(s).size).toBe(s.length);
    }
    expect(sentIds().sort()).toEqual([...ids].sort());
  });

  it("reports the path the tracker started on, or the one it was given", () => {
    win.location.pathname = "/news";
    const first = mount([uuid(1)]);
    first.io.report(first.elements[0], 1);
    win.location.pathname = "/schedule";
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS);
    expect(bodies).toEqual([{ t: "logo_seen", p: "/news", s: [uuid(1)] }]);
    bodies.length = 0;
    const second = mount([uuid(2)], { path: "/explicit" });
    second.io.report(second.elements[0], 1);
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS);
    expect(bodies).toEqual([{ t: "logo_seen", p: "/explicit", s: [uuid(2)] }]);
  });
});

describe("final flush", () => {
  const seenMany = (count: number) => {
    const ids = Array.from({ length: count }, (_, i) => uuid(i + 1));
    const tracker = mount(ids);
    for (const element of tracker.elements) tracker.io.report(element, 1);
    at(LOGO_SEEN_DWELL_MS);
    return { ...tracker, ids };
  };

  it("sends everything queued the moment the page is hidden, ten ids to a beacon", () => {
    const { ids } = seenMany(23);
    expect(bodies).toEqual([]);
    hide();
    expect(bodies.map((body) => (body as { s: string[] }).s.length)).toEqual([10, 10, 3]);
    expect(sentIds()).toEqual(ids);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends everything queued on pagehide", () => {
    const { ids } = seenMany(11);
    win.dispatchEvent(new Event("pagehide"));
    expect(bodies.map((body) => (body as { s: string[] }).s.length)).toEqual([10, 1]);
    expect(sentIds()).toEqual(ids);
    win.dispatchEvent(new Event("pagehide"));
    expect(bodies).toHaveLength(2);
  });

  it("sends nothing when the queue is empty", () => {
    mount([uuid(1)]);
    hide();
    win.dispatchEvent(new Event("pagehide"));
    expect(bodies).toEqual([]);
  });

  it("keeps working after a hide: later sightings are batched again once visible", () => {
    const { elements, io } = mount([uuid(1), uuid(2)]);
    io.report(elements[0], 1);
    at(LOGO_SEEN_DWELL_MS);
    hide();
    expect(sentIds()).toEqual([uuid(1)]);
    show();
    io.report(elements[1], 1);
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS);
    expect(sentIds()).toEqual([uuid(1), uuid(2)]);
  });
});

describe("tab visibility", () => {
  it("hiding cancels a dwell in progress", () => {
    const { elements, io } = mount([uuid(1)]);
    io.report(elements[0], 1);
    at(LOGO_SEEN_DWELL_MS - 100);
    hide();
    expect(vi.getTimerCount()).toBe(0);
    at(60_000);
    expect(bodies).toEqual([]);
  });

  it("counts a logo only after a full second of visible time following a hide", () => {
    const { elements, io } = mount([uuid(1)]);
    io.report(elements[0], 1);
    at(LOGO_SEEN_DWELL_MS - 100);
    hide();
    at(10_000);
    show();
    expect(vi.getTimerCount()).toBe(1);
    at(LOGO_SEEN_DWELL_MS - 1);
    expect(vi.getTimerCount()).toBe(1);
    at(1);
    // Counted now; the beacon follows after the window.
    expect(vi.getTimerCount()).toBe(1);
    at(LOGO_SEEN_FLUSH_MS);
    expect(sentIds()).toEqual([uuid(1)]);
  });

  it("does not restart a dwell for a logo that left the screen while hidden", () => {
    const { elements, io } = mount([uuid(1), uuid(2)]);
    io.report(elements[0], 1);
    io.report(elements[1], 1);
    hide();
    io.report(elements[1], 0);
    show();
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS);
    expect(sentIds()).toEqual([uuid(1)]);
  });

  it("starts no dwell for a logo that becomes visible while the tab is hidden, until the tab shows", () => {
    const { elements, io } = mount([uuid(1)]);
    doc.hidden = true;
    io.report(elements[0], 1);
    at(60_000);
    expect(vi.getTimerCount()).toBe(0);
    show();
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS);
    expect(sentIds()).toEqual([uuid(1)]);
  });

  it("a tracker created while the tab is hidden waits for it to show", () => {
    doc.hidden = true;
    const { elements, io } = mount([uuid(1)]);
    io.report(elements[0], 1);
    at(30_000);
    expect(bodies).toEqual([]);
    show();
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS);
    expect(sentIds()).toEqual([uuid(1)]);
  });
});

describe("cleanup", () => {
  it("disconnects, clears every timer, removes the listeners and sends what was queued", () => {
    const ids = Array.from({ length: 13 }, (_, i) => uuid(i + 1));
    const { elements, io, stop } = mount(ids);
    for (const element of elements.slice(0, 12)) io.report(element, 1);
    at(LOGO_SEEN_DWELL_MS);
    io.report(elements[12], 1);
    expect(bodies).toEqual([]);
    stop();
    expect(io.disconnected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(bodies.map((body) => (body as { s: string[] }).s)).toEqual([ids.slice(0, 10), ids.slice(10, 12)]);
    // The dwell on the 13th logo never finished, so it is not reported.
    bodies.length = 0;
    hide();
    show();
    win.dispatchEvent(new Event("pagehide"));
    io.report(elements[12], 1);
    at(60_000);
    expect(bodies).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is safe to call twice", () => {
    const { elements, io, stop } = mount([uuid(1)]);
    io.report(elements[0], 1);
    at(LOGO_SEEN_DWELL_MS);
    stop();
    stop();
    expect(bodies).toHaveLength(1);
  });

  it("ignores observer callbacks that arrive after cleanup", () => {
    const { elements, io, stop } = mount([uuid(1)]);
    stop();
    io.report(elements[0], 1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("attachSponsorLogoSeen", () => {
  const root = { querySelectorAll: () => [new FakeElement(uuid(1))] } as unknown as Element;

  it("returns undefined and builds no observer when telemetry is off", () => {
    expect(attachSponsorLogoSeen(false, root)).toBeUndefined();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("returns undefined and builds no observer without a root", () => {
    expect(attachSponsorLogoSeen(true, null)).toBeUndefined();
    expect(attachSponsorLogoSeen(true, undefined)).toBeUndefined();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("returns undefined when the browser has no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    expect(attachSponsorLogoSeen(true, root)).toBeUndefined();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("starts a tracker and returns its cleanup when everything is in place", () => {
    const cleanup = attachSponsorLogoSeen(true, root, { send });
    expect(typeof cleanup).toBe("function");
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    cleanup?.();
    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true);
  });

  it("a pathname change is cleanup then a fresh tracker: the old path flushes, the new one counts again", () => {
    win.location.pathname = "/";
    const first = mount([uuid(1)]);
    first.io.report(first.elements[0], 1);
    at(LOGO_SEEN_DWELL_MS);
    win.location.pathname = "/news";
    first.stop();
    const second = mount([uuid(1)]);
    second.io.report(second.elements[0], 1);
    at(LOGO_SEEN_DWELL_MS + LOGO_SEEN_FLUSH_MS);
    expect(bodies).toEqual([
      { t: "logo_seen", p: "/", s: [uuid(1)] },
      { t: "logo_seen", p: "/news", s: [uuid(1)] },
    ]);
  });
});
