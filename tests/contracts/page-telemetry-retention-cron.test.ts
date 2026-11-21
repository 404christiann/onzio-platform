import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telemetry/retention", () => ({ runTelemetryRetention: vi.fn() }));

import { GET } from "@/app/api/cron/telemetry-retention/route";
import { runTelemetryRetention } from "@/lib/telemetry/retention";

const retention = vi.mocked(runTelemetryRetention);
const original = process.env.CRON_SECRET;
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
});
const request = (authorization?: string) =>
  new Request("https://onzio.example/api/cron/telemetry-retention", { headers: authorization ? { authorization } : undefined });

const RESULT = {
  maxEvents: 100000,
  eventsDeleted: 12,
  saltsDeleted: 3,
  rateWindowsDeleted: 40,
  dropCountsDeleted: 1,
  moreEventsRemain: false,
};

describe("telemetry retention cron", () => {
  it("is scheduled once daily in the 10:00 UTC hour, after the media crons (Hobby may fire any time in the hour; nothing depends on the order)", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { crons: Array<{ path: string; schedule: string }> };
    expect(config.crons.filter((cron) => cron.path === "/api/cron/telemetry-retention")).toEqual([
      { path: "/api/cron/telemetry-retention", schedule: "45 10 * * *" },
    ]);
    // The existing crons are untouched.
    expect(config.crons).toContainEqual({ path: "/api/cron/media-cleanup", schedule: "0 10 * * *" });
    expect(config.crons).toContainEqual({ path: "/api/cron/media-orphan-sweep", schedule: "30 10 * * *" });
    expect(config.crons).toContainEqual({ path: "/api/cron/lifecycle", schedule: "0 9 * * *" });
  });

  it("fails closed without CRON_SECRET or with the wrong secret, and never touches the database", async () => {
    delete process.env.CRON_SECRET;
    const noSecret = await GET(request("Bearer x"));
    expect(noSecret.status).toBe(401);
    expect(await noSecret.json()).toEqual({ error: { code: "CRON_AUTHENTICATION_REQUIRED" } });
    process.env.CRON_SECRET = "secret";
    expect((await GET(request())).status).toBe(401);
    const wrong = await GET(request("Bearer other"));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: { code: "CRON_AUTHENTICATION_REQUIRED" } });
    expect((await GET(request("secret"))).status).toBe(401);
    expect(retention).not.toHaveBeenCalled();
  });

  it("runs the retention sweep for the right secret and returns what it deleted", async () => {
    process.env.CRON_SECRET = "secret";
    vi.spyOn(console, "log").mockImplementation(() => {});
    retention.mockResolvedValueOnce(RESULT);
    const ok = await GET(request("Bearer secret"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ data: RESULT, error: null });
    expect(retention).toHaveBeenCalledTimes(1);
  });

  it("answers 200 with moreEventsRemain when a backlog is left for the next run, and logs it", async () => {
    process.env.CRON_SECRET = "secret";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    retention.mockResolvedValueOnce({ ...RESULT, eventsDeleted: 100000, moreEventsRemain: true });
    const response = await GET(request("Bearer secret"));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ eventsDeleted: 100000, moreEventsRemain: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("telemetry.retention_backlog"));
  });

  it("reports a failed sweep as 500 with a fixed code and no database detail", async () => {
    process.env.CRON_SECRET = "secret";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    retention.mockRejectedValueOnce(new Error("permission denied for table page_events at 10.0.0.5"));
    const failed = await GET(request("Bearer secret"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: { code: "TELEMETRY_RETENTION_FAILED" } });
    expect(JSON.stringify(error.mock.calls)).not.toContain("permission denied");
    expect(JSON.stringify(error.mock.calls)).toContain("telemetry.retention_failed");
  });

  it("is a dynamic Node route with a bounded duration", () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/cron/telemetry-retention/route.ts"), "utf8");
    expect(source).toContain('export const runtime = "nodejs";');
    expect(source).toContain('export const dynamic = "force-dynamic";');
    expect(source).toContain("export const maxDuration = 60;");
  });
});
