import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BEACON_URL, sendTelemetry, type TelemetryBody } from "@/components/telemetry/send";
import { createHeartbeat, HEARTBEAT_MAX_PIECE_MS, HEARTBEAT_MIN_PIECE_MS } from "@/components/telemetry/heartbeat";
import { LOGO_SEEN_MAX_IDS } from "@/components/telemetry/logo-seen";
import {
  beaconBodySchema,
  ENGAGED_MS_MAX,
  ENGAGED_MS_MIN,
  MAX_BEACON_BYTES,
  MAX_LOGO_IDS,
} from "@/lib/telemetry/beacon-contract";

// TELEMETRY-03: every public telemetry beacon leaves through this one function.
const view: TelemetryBody = { t: "view", p: "/news", r: "https://example.test/", q: "?utm_source=x" };
const heartbeat: TelemetryBody = { t: "heartbeat", p: "/news", e: 12_000 };
const logoSeen: TelemetryBody = { t: "logo_seen", p: "/", s: ["8f1c2a64-3d0e-4b57-9a11-5c2e7d9f0a31"] };

const sendBeacon = vi.fn<(url: string, body: string) => boolean>();
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>();

beforeEach(() => {
  sendBeacon.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({});
  vi.stubGlobal("navigator", { sendBeacon });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("sendTelemetry", () => {
  it("posts to the beacon route", () => {
    expect(BEACON_URL).toBe("/api/t");
  });

  it.each([view, heartbeat, logoSeen])("uses sendBeacon with the JSON body when it accepts the payload (%j)", (body) => {
    sendBeacon.mockReturnValue(true);
    sendTelemetry(body);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith("/api/t", JSON.stringify(body));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to a keepalive same-origin text/plain fetch when sendBeacon declines the payload", () => {
    sendBeacon.mockReturnValue(false);
    sendTelemetry(heartbeat);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/t", {
      method: "POST",
      body: JSON.stringify(heartbeat),
      keepalive: true,
      credentials: "same-origin",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    });
  });

  it("falls back to fetch when sendBeacon does not exist", () => {
    vi.stubGlobal("navigator", {});
    sendTelemetry(logoSeen);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(logoSeen));
  });

  it("adds no cookie, storage or identifier of its own", () => {
    sendBeacon.mockReturnValue(false);
    sendTelemetry(view);
    const init = fetchMock.mock.calls[0][1];
    expect(Object.keys(init.headers as object)).toEqual(["Content-Type"]);
    expect(JSON.parse(init.body as string)).toEqual(view);
  });

  it("never throws: sendBeacon throwing, fetch throwing, a rejected fetch, or no browser at all", async () => {
    sendBeacon.mockImplementation(() => { throw new Error("blocked"); });
    expect(() => sendTelemetry(view)).not.toThrow();

    sendBeacon.mockReturnValue(false);
    fetchMock.mockImplementation(() => { throw new Error("offline"); });
    expect(() => sendTelemetry(view)).not.toThrow();

    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    expect(() => sendTelemetry(view)).not.toThrow();
    await Promise.resolve();

    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", undefined);
    expect(() => sendTelemetry(view)).not.toThrow();
  });
});

describe("main's /api/t wire contract (lib/telemetry/beacon-contract)", () => {
  it("shares its limits: 10 logo ids, heartbeat pieces of 1000-60000 ms", () => {
    expect(LOGO_SEEN_MAX_IDS).toBe(MAX_LOGO_IDS);
    expect(HEARTBEAT_MIN_PIECE_MS).toBe(ENGAGED_MS_MIN);
    expect(HEARTBEAT_MAX_PIECE_MS).toBe(ENGAGED_MS_MAX);
  });

  it.each([view, heartbeat, logoSeen])("accepts the body %j", (body) => {
    expect(beaconBodySchema.safeParse(body).success).toBe(true);
  });

  it("accepts every heartbeat a 40 minute visible read with a hide and a route change produces", () => {
    vi.useFakeTimers();
    try {
      const sent: TelemetryBody[] = [];
      const beat = createHeartbeat({ send: (body) => sent.push(body) });
      beat.startView("/news");
      vi.advanceTimersByTime(10 * 60_000 + 4_321);
      beat.setHidden(true);
      vi.advanceTimersByTime(5 * 60_000);
      beat.setHidden(false);
      vi.advanceTimersByTime(30 * 60_000 + 777);
      beat.startView("/schedule");
      vi.advanceTimersByTime(65_000);
      beat.stop();
      expect(sent.length).toBeGreaterThan(30);
      for (const body of sent) {
        expect(beaconBodySchema.safeParse(body).success).toBe(true);
        expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(MAX_BEACON_BYTES);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
