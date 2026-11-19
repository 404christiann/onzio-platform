// Deterministic "has it finished?" signals for the verify spec. Pure decisions live here so verify.test.mjs pins them;
// the spec only supplies the browser reads. Added in RC-ADMIN-4-0a after two flakes: gate 6 compared Diverse City pages that
// were still loading (a fixed 2 s sleep lost to a slow fetch), and gate 3 "saved" sampled the Save button's colour in the
// middle of its 220 ms background transition.

/** Anything that says "this part of the page is still loading". The admin's own markers, nothing guessed from the clock.
 *  The spec counts only the ones that are showing (checkVisibility): a page may keep its hidden skeleton in the DOM. */
export const BUSY_SELECTOR = [
  '[aria-busy="true"]',
  '[data-admin-loading-region]:not([data-phase="content"])',
  "[data-admin-skeleton-layer]",
  "[data-admin-shimmer]",
  "[data-slot=skeleton]",
  '[role=status][aria-label^="Loading"]',
].join(", ");

/** A live region that says it is loading ("Loading About page", "Loading content"): matched on its text, not its label. Counted even
 *  when visually hidden (sr-only): it is the page announcing that it is not ready. Added after gate 6 compared About mid-load (4b-0). */
export const LOADING_TEXT = /^\s*Loading\b/i;

export const SETTLE_TIMEOUT_MS = 20_000;
export const SETTLE_INTERVAL_MS = 100;
export const SETTLE_STABLE_READS = 3;

/**
 * One read of a page. `ready`: the document finished loading. `busy`: loading markers on the page (BUSY_SELECTOR).
 * `running`: finite animations or transitions still playing. `key`: whatever must stop changing (the main aria snapshot).
 */
export function readIsQuiet(read) {
  return !!read && read.ready === true && read.busy === 0 && read.running === 0;
}

/** Settled = the last `stable` reads are all quiet and carry the same key. Fewer reads than that is never settled. */
export function isSettled(reads, stable = SETTLE_STABLE_READS) {
  if (reads.length < stable) return false;
  const tail = reads.slice(-stable);
  return tail.every(readIsQuiet) && tail.every((r) => r.key === tail[0].key);
}

/** Why a read is not quiet, for the failure message ("3 loading markers, 1 animation running"). */
export function describeBusy(read) {
  if (!read) return "no read";
  const parts = [];
  if (read.ready !== true) parts.push("document not loaded");
  if (read.busy) parts.push(`${read.busy} loading marker${read.busy === 1 ? "" : "s"}`);
  if (read.running) parts.push(`${read.running} animation${read.running === 1 ? "" : "s"} running`);
  return parts.length ? parts.join(", ") : "content still changing";
}

/**
 * Poll `read()` until `isSettled`. Resolves { settled: true, reads } or, at the timeout, { settled: false, reads, why }.
 * `sleep` and `now` are injected so the test runs without a clock.
 */
export async function waitUntilSettled(read, {
  timeoutMs = SETTLE_TIMEOUT_MS,
  intervalMs = SETTLE_INTERVAL_MS,
  stable = SETTLE_STABLE_READS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  const reads = [];
  const deadline = now() + timeoutMs;
  for (;;) {
    reads.push(await read());
    if (isSettled(reads, stable)) return { settled: true, reads };
    if (now() >= deadline) {
      const last = reads[reads.length - 1];
      return { settled: false, reads, why: readIsQuiet(last) ? "content kept changing" : describeBusy(last) };
    }
    await sleep(intervalMs);
  }
}

/**
 * Gate 3 "saved": the verdict on the Save button after its transitions ended.
 * `seen`: { state, colour, running } read once every animation and transition on the button had finished.
 * Returns the problems (empty = pass). A colour is only judged once nothing is moving, so a sample taken
 * partway through the 220 ms fade (rgb(52, 199, 90)) can no longer fail a correct button.
 */
export function savedColourProblems(seen, greens) {
  const problems = [];
  if (seen.running > 0) problems.push(`the Save button was still animating after the wait (${seen.running} running), so its colour was not read`);
  else if (seen.state !== "saved") problems.push(`the Save button left "saved" (now "${seen.state}") before its colour could be read`);
  else if (!greens.includes(seen.colour)) problems.push(`the settled "saved" colour is ${seen.colour}, expected one of ${greens.join(" or ")}`);
  return problems;
}

/**
 * Console errors that come from the local run, not from the page under test: Vercel's analytics script is requested
 * late on every page and 404s on `next start`, so it showed on one build and not yet on the other (gate 6, 2026-11-19).
 * Judged by the failing resource's URL (ConsoleMessage.location().url), never by message text alone.
 */
export const ENVIRONMENT_NOISE = [/\/_vercel\/(speed-)?insights\/script\.js$/];
export function isEnvironmentNoise(url) {
  const path = String(url ?? "").replace(/[?#].*$/, "");
  return ENVIRONMENT_NOISE.some((re) => re.test(path));
}
