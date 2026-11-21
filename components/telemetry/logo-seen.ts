import { sendTelemetry, type TelemetryBody } from "./send";

// TELEMETRY-03: which sponsor logos a visitor actually saw. A logo counts once
// it has been at least half visible for a full second while the tab is
// visible; each sponsor counts at most once per tracker (one page view), even
// though the marquee renders every logo twice. Seen ids are batched so the
// site sends at most one logo_seen beacon every two seconds, and whatever is
// queued goes out immediately when the page hides or the tracker stops.

export const LOGO_SEEN_RATIO = 0.5;
export const LOGO_SEEN_DWELL_MS = 1_000;
export const LOGO_SEEN_FLUSH_MS = 2_000;
export const LOGO_SEEN_MAX_IDS = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Built-in fallback logos carry ids such as "default-carousel-chronic"; only real database rows are counted. */
export function isSponsorUuid(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}

type Timer = ReturnType<typeof setTimeout>;

export function startSponsorLogoSeen(
  root: Element,
  opts: { send?: (body: TelemetryBody) => void; path?: string } = {},
): () => void {
  const send = opts.send ?? sendTelemetry;
  const path = opts.path ?? window.location.pathname;

  const ids = new Map<Element, string>();
  for (const element of Array.from(root.querySelectorAll("[data-sponsor-id]"))) {
    const id = element.getAttribute("data-sponsor-id");
    if (isSponsorUuid(id)) ids.set(element, id);
  }
  // Nothing countable here (only fallback logos): no observer, no listeners.
  if (ids.size === 0) return () => undefined;

  const counted = new Set<string>();
  const queue: string[] = [];
  const visible = new Set<Element>();
  const dwelling = new Map<Element, Timer>();
  let flushTimer: Timer | null = null;
  let stopped = false;

  function sendBatch(): void {
    if (queue.length === 0) return;
    send({ t: "logo_seen", p: path, s: queue.splice(0, LOGO_SEEN_MAX_IDS) });
  }

  // At most one beacon per window on the timer path: the next batch waits a full window.
  function flushOnTimer(): void {
    flushTimer = null;
    sendBatch();
    if (queue.length > 0) flushTimer = setTimeout(flushOnTimer, LOGO_SEEN_FLUSH_MS);
  }

  // Hiding, unloading and stopping send everything now, ten ids to a beacon.
  function flushNow(): void {
    if (flushTimer !== null) clearTimeout(flushTimer);
    flushTimer = null;
    while (queue.length > 0) sendBatch();
  }

  function cancelDwell(element: Element): void {
    const timer = dwelling.get(element);
    if (timer === undefined) return;
    clearTimeout(timer);
    dwelling.delete(element);
  }

  function startDwell(element: Element): void {
    const id = ids.get(element);
    if (id === undefined || counted.has(id) || dwelling.has(element) || document.hidden) return;
    dwelling.set(
      element,
      setTimeout(() => {
        dwelling.delete(element);
        if (counted.has(id)) return;
        counted.add(id);
        queue.push(id);
        if (flushTimer === null) flushTimer = setTimeout(flushOnTimer, LOGO_SEEN_FLUSH_MS);
      }, LOGO_SEEN_DWELL_MS),
    );
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (stopped) return;
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= LOGO_SEEN_RATIO) {
          visible.add(entry.target);
          startDwell(entry.target);
        } else {
          visible.delete(entry.target);
          cancelDwell(entry.target);
        }
      }
    },
    { threshold: LOGO_SEEN_RATIO },
  );
  for (const element of ids.keys()) observer.observe(element);

  function onVisibilityChange(): void {
    if (document.hidden) {
      for (const element of Array.from(dwelling.keys())) cancelDwell(element);
      flushNow();
    } else {
      for (const element of visible) startDwell(element);
    }
  }
  function onPageHide(): void {
    flushNow();
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    for (const element of Array.from(dwelling.keys())) cancelDwell(element);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    flushNow();
  };
}
