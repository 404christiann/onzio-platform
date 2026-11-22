import { sendTelemetry, type TelemetryBody } from "./send";

// TELEMETRY-03: time on page. Visible time is measured with the clock, never
// with a per-second timer, and reported in pieces: one when the tab hides, one
// when the page unloads or the route changes, and one every minute while the
// tab stays visible. Hidden time is never counted. The wire contract is
// {t:"heartbeat", p, e} with e an integer of 1000 to 60000 visible
// milliseconds, so shorter pieces are dropped and longer ones are capped here.

export const HEARTBEAT_INTERVAL_MS = 60_000;
export const HEARTBEAT_MIN_PIECE_MS = 1_000;
export const HEARTBEAT_MAX_PIECE_MS = 60_000;
/** Most visible time one page view can report: 30 minutes. */
export const HEARTBEAT_MAX_VIEW_MS = 1_800_000;

export type Heartbeat = {
  /** Reports the previous view's pending piece, then starts timing `path`. */
  startView: (path: string) => void;
  /** Visibility changed. Hiding reports the pending piece and pauses; showing resumes. */
  setHidden: (hidden: boolean) => void;
  /** Reports the pending piece now (pagehide). Timing continues if the tab is visible. */
  flush: () => void;
  /** Reports the pending piece and ends the view. Safe to call again. */
  stop: () => void;
};

export function createHeartbeat(
  options: { send?: (body: TelemetryBody) => void; hidden?: boolean } = {},
): Heartbeat {
  const send = options.send ?? sendTelemetry;
  let hidden = options.hidden ?? false;
  let path: string | null = null;
  /** When the current visible stretch began; null while hidden, capped or without a view. */
  let since: number | null = null;
  let sentTotal = 0;
  let capped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(): void {
    clearTimer();
    if (path === null || since === null || capped) return;
    timer = setTimeout(() => {
      timer = null;
      report();
      schedule();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** Closes the current piece (sent or dropped) and starts the next from now. */
  function report(): void {
    if (path === null || since === null) return;
    const now = Date.now();
    const elapsed = now - since;
    since = now;
    if (capped) return;
    let ms = Math.floor(Math.min(elapsed, HEARTBEAT_MAX_PIECE_MS));
    if (ms < HEARTBEAT_MIN_PIECE_MS) return;
    ms = Math.min(ms, HEARTBEAT_MAX_VIEW_MS - sentTotal);
    if (ms < HEARTBEAT_MIN_PIECE_MS) {
      capped = true;
      return;
    }
    sentTotal += ms;
    send({ t: "heartbeat", p: path, e: ms });
    if (HEARTBEAT_MAX_VIEW_MS - sentTotal < HEARTBEAT_MIN_PIECE_MS) capped = true;
  }

  return {
    startView(next) {
      report();
      path = next;
      sentTotal = 0;
      capped = false;
      since = hidden ? null : Date.now();
      schedule();
    },
    setHidden(next) {
      if (next === hidden) return;
      hidden = next;
      if (path === null) return;
      if (hidden) {
        report();
        since = null;
      } else {
        since = Date.now();
      }
      schedule();
    },
    flush() {
      report();
      schedule();
    },
    stop() {
      report();
      since = null;
      path = null;
      clearTimer();
    },
  };
}
