import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHeartbeat,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MAX_PIECE_MS,
  HEARTBEAT_MAX_VIEW_MS,
  HEARTBEAT_MIN_PIECE_MS,
} from "@/components/telemetry/heartbeat";
import type { TelemetryBody } from "@/components/telemetry/send";

// TELEMETRY-03: time on page. Pieces of visible time, in whole milliseconds,
// 1000 to 60000 each, never more than 30 minutes per page view.
const sent: TelemetryBody[] = [];
const send = (body: TelemetryBody) => { sent.push(body); };
const beat = (options: { hidden?: boolean } = {}) => createHeartbeat({ send, ...options });
const at = (ms: number) => vi.advanceTimersByTime(ms);

beforeEach(() => {
  sent.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
});
afterEach(() => vi.useRealTimers());

describe("heartbeat constants", () => {
  it("match the wire contract", () => {
    expect([HEARTBEAT_INTERVAL_MS, HEARTBEAT_MIN_PIECE_MS, HEARTBEAT_MAX_PIECE_MS, HEARTBEAT_MAX_VIEW_MS]).toEqual([60_000, 1_000, 60_000, 1_800_000]);
  });
});

describe("visible time", () => {
  it("reports one 60 s piece after a minute of continuous visibility, then every minute", () => {
    const hb = beat();
    hb.startView("/club");
    at(59_999);
    expect(sent).toEqual([]);
    at(1);
    expect(sent).toEqual([{ t: "heartbeat", p: "/club", e: 60_000 }]);
    at(60_000);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ t: "heartbeat", p: "/club", e: 60_000 });
    hb.stop();
  });

  it("reports the visible remainder when the tab hides and nothing for the time spent hidden", () => {
    const hb = beat();
    hb.startView("/club");
    at(20_000);
    hb.setHidden(true);
    expect(sent).toEqual([{ t: "heartbeat", p: "/club", e: 20_000 }]);
    at(10 * 60_000);
    expect(sent).toHaveLength(1);
    hb.stop();
    expect(sent).toHaveLength(1);
  });

  it("resumes timing when the tab shows again, with a fresh 60 s timer", () => {
    const hb = beat();
    hb.startView("/club");
    at(5_000);
    hb.setHidden(true);
    at(120_000);
    hb.setHidden(false);
    at(59_999);
    expect(sent).toHaveLength(1);
    at(1);
    expect(sent.map((body) => (body as { e: number }).e)).toEqual([5_000, 60_000]);
    hb.stop();
  });

  it("restarts the 60 s timer after a flush", () => {
    const hb = beat();
    hb.startView("/club");
    at(40_000);
    hb.flush();
    expect(sent).toEqual([{ t: "heartbeat", p: "/club", e: 40_000 }]);
    at(59_999);
    expect(sent).toHaveLength(1);
    at(1);
    expect(sent).toHaveLength(2);
    expect((sent[1] as { e: number }).e).toBe(60_000);
    hb.stop();
  });

  it("flush reports the pending piece without ending the view", () => {
    const hb = beat();
    hb.startView("/club");
    at(7_000);
    hb.flush();
    at(3_000);
    hb.stop();
    expect(sent.map((body) => (body as { e: number }).e)).toEqual([7_000, 3_000]);
  });

  it("stop reports the pending piece, clears the timer and is idempotent", () => {
    const hb = beat();
    hb.startView("/club");
    at(15_000);
    hb.stop();
    hb.stop();
    expect(sent).toEqual([{ t: "heartbeat", p: "/club", e: 15_000 }]);
    expect(vi.getTimerCount()).toBe(0);
    at(10 * 60_000);
    expect(sent).toHaveLength(1);
    hb.setHidden(true);
    hb.setHidden(false);
    at(10 * 60_000);
    expect(sent).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer while hidden", () => {
    const hb = beat();
    hb.startView("/club");
    expect(vi.getTimerCount()).toBe(1);
    at(10_000);
    hb.setHidden(true);
    expect(vi.getTimerCount()).toBe(0);
    hb.setHidden(false);
    expect(vi.getTimerCount()).toBe(1);
    hb.stop();
  });

  it("ignores a repeated visibility state", () => {
    const hb = beat();
    hb.startView("/club");
    at(10_000);
    hb.setHidden(false);
    at(10_000);
    hb.stop();
    expect(sent).toEqual([{ t: "heartbeat", p: "/club", e: 20_000 }]);
  });
});

describe("piece limits", () => {
  it("drops pieces under one second and does not carry them forward", () => {
    const hb = beat();
    hb.startView("/club");
    at(999);
    hb.setHidden(true);
    expect(sent).toEqual([]);
    hb.setHidden(false);
    at(999);
    hb.setHidden(true);
    expect(sent).toEqual([]);
    hb.setHidden(false);
    at(1_000);
    hb.stop();
    expect(sent).toEqual([{ t: "heartbeat", p: "/club", e: 1_000 }]);
  });

  it("caps a piece at 60 s when the clock jumps (sleep, a throttled timer)", () => {
    const hb = beat();
    hb.startView("/club");
    vi.setSystemTime(Date.now() + 6 * 3_600_000);
    hb.flush();
    expect(sent).toEqual([{ t: "heartbeat", p: "/club", e: 60_000 }]);
    hb.stop();
  });

  it("always sends integer milliseconds", () => {
    const hb = beat();
    hb.startView("/club");
    vi.setSystemTime(Date.now() + 2_345.9);
    hb.flush();
    vi.setSystemTime(Date.now() + 1_000.4);
    hb.stop();
    for (const body of sent) {
      const e = (body as { e: number }).e;
      expect(Number.isInteger(e)).toBe(true);
      expect(e).toBeGreaterThanOrEqual(1_000);
      expect(e).toBeLessThanOrEqual(60_000);
    }
    expect(sent.length).toBeGreaterThan(0);
  });

  it("sends exactly the bodies the server accepts: {t, p, e}", () => {
    const hb = beat();
    hb.startView("/club/schedule");
    at(30_000);
    hb.stop();
    expect(Object.keys(sent[0])).toEqual(["t", "p", "e"]);
  });
});

describe("30 minute cap per view", () => {
  it("sends 30 full pieces, then nothing more and no timer", () => {
    const hb = beat();
    hb.startView("/club");
    at(HEARTBEAT_MAX_VIEW_MS);
    expect(sent).toHaveLength(30);
    expect(sent.reduce((sum, body) => sum + (body as { e: number }).e, 0)).toBe(HEARTBEAT_MAX_VIEW_MS);
    expect(vi.getTimerCount()).toBe(0);
    at(2 * 3_600_000);
    hb.setHidden(true);
    hb.setHidden(false);
    at(2 * 3_600_000);
    hb.stop();
    expect(sent).toHaveLength(30);
  });

  it("clips the last piece to the remaining budget and then goes silent", () => {
    const hb = beat();
    hb.startView("/club");
    // 59 s pieces: 30 of them reach 1_770_000, leaving 30 s of budget.
    for (let i = 0; i < 40; i += 1) {
      at(59_000);
      hb.flush();
    }
    const pieces = sent.map((body) => (body as { e: number }).e);
    expect(pieces.slice(0, 30)).toEqual(Array(30).fill(59_000));
    expect(pieces[30]).toBe(30_000);
    expect(pieces).toHaveLength(31);
    expect(pieces.reduce((a, b) => a + b, 0)).toBe(HEARTBEAT_MAX_VIEW_MS);
    hb.stop();
  });

  it("stops when the remaining budget is under the one second minimum", () => {
    const hb = beat();
    hb.startView("/club");
    for (let i = 0; i < 59; i += 1) {
      at(30_000);
      hb.flush();
    }
    // 59 x 30 s = 1_770_000; one 29.5 s piece leaves 500 ms, which cannot be a valid piece.
    at(29_500);
    hb.flush();
    expect(vi.getTimerCount()).toBe(0);
    const count = sent.length;
    at(60_000);
    hb.flush();
    hb.stop();
    expect(sent).toHaveLength(count);
    expect(sent.reduce((sum, body) => sum + (body as { e: number }).e, 0)).toBeLessThan(HEARTBEAT_MAX_VIEW_MS);
  });

  it("gives every page view its own budget", () => {
    const hb = beat();
    hb.startView("/a");
    at(HEARTBEAT_MAX_VIEW_MS + 60_000);
    expect(sent).toHaveLength(30);
    hb.startView("/b");
    at(60_000);
    expect(sent).toHaveLength(31);
    expect(sent[30]).toEqual({ t: "heartbeat", p: "/b", e: 60_000 });
    hb.stop();
  });
});

describe("route changes", () => {
  it("sends the old path's piece before the next view starts timing", () => {
    const hb = beat();
    hb.startView("/club");
    at(12_000);
    hb.startView("/club/schedule");
    expect(sent).toEqual([{ t: "heartbeat", p: "/club", e: 12_000 }]);
    at(8_000);
    hb.stop();
    expect(sent).toEqual([
      { t: "heartbeat", p: "/club", e: 12_000 },
      { t: "heartbeat", p: "/club/schedule", e: 8_000 },
    ]);
  });

  it("restarts the 60 s timer for the new view", () => {
    const hb = beat();
    hb.startView("/a");
    at(50_000);
    hb.startView("/b");
    at(59_999);
    expect(sent.map((body) => body.p)).toEqual(["/a"]);
    at(1);
    expect(sent[1]).toEqual({ t: "heartbeat", p: "/b", e: 60_000 });
    hb.stop();
  });

  it("drops a sub-second piece from the old view without leaking it into the new one", () => {
    const hb = beat();
    hb.startView("/a");
    at(500);
    hb.startView("/b");
    at(3_000);
    hb.stop();
    expect(sent).toEqual([{ t: "heartbeat", p: "/b", e: 3_000 }]);
  });

  it("a route change while hidden reports the old piece once and starts the new view hidden", () => {
    const hb = beat();
    hb.startView("/a");
    at(4_000);
    hb.setHidden(true);
    hb.startView("/b");
    at(60_000);
    expect(sent).toEqual([{ t: "heartbeat", p: "/a", e: 4_000 }]);
    hb.setHidden(false);
    at(2_000);
    hb.stop();
    expect(sent[1]).toEqual({ t: "heartbeat", p: "/b", e: 2_000 });
  });
});

describe("views that start hidden", () => {
  it("accrue nothing until the tab is visible", () => {
    const hb = beat({ hidden: true });
    hb.startView("/club");
    expect(vi.getTimerCount()).toBe(0);
    at(5 * 60_000);
    hb.stop();
    expect(sent).toEqual([]);
  });

  it("start timing from the moment the tab becomes visible", () => {
    const hb = beat({ hidden: true });
    hb.startView("/club");
    at(5 * 60_000);
    hb.setHidden(false);
    at(9_000);
    hb.stop();
    expect(sent).toEqual([{ t: "heartbeat", p: "/club", e: 9_000 }]);
  });

  it("a later view started while hidden accrues nothing too", () => {
    const hb = beat();
    hb.setHidden(true);
    hb.startView("/club");
    at(2 * 60_000);
    hb.stop();
    expect(sent).toEqual([]);
  });
});

describe("without a view", () => {
  it("does nothing before the first startView", () => {
    const hb = beat();
    hb.setHidden(true);
    hb.setHidden(false);
    hb.flush();
    hb.stop();
    at(120_000);
    expect(sent).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
