import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telemetry/rollup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telemetry/rollup")>()),
  runTelemetryRollup: vi.fn(),
}));
vi.mock("@/lib/supabase-service-role", () => ({ createServiceRoleClient: vi.fn() }));

import { GET } from "@/app/api/cron/telemetry-rollup/route";
import { ROLLUP_DAYS_PER_RUN, runTelemetryRollup } from "@/lib/telemetry/rollup";

const rollup = vi.mocked(runTelemetryRollup);
const original = process.env.CRON_SECRET;
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
});
const request = (authorization?: string) =>
  new Request("https://onzio.example/api/cron/telemetry-rollup", { headers: authorization ? { authorization } : undefined });

const RESULT = { clubs: 2, days: 3, rowsWritten: 14 };

describe("telemetry rollup cron", () => {
  it("is scheduled once daily at 10:35 UTC, before the retention run, and leaves the other crons alone", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { crons: Array<{ path: string; schedule: string }> };
    expect(config.crons.filter((cron) => cron.path === "/api/cron/telemetry-rollup")).toEqual([
      { path: "/api/cron/telemetry-rollup", schedule: "35 10 * * *" },
    ]);
    expect(config.crons).toContainEqual({ path: "/api/cron/media-cleanup", schedule: "0 10 * * *" });
    expect(config.crons).toContainEqual({ path: "/api/cron/hero-video", schedule: "15 10 * * *" });
    expect(config.crons).toContainEqual({ path: "/api/cron/media-orphan-sweep", schedule: "30 10 * * *" });
    expect(config.crons).toContainEqual({ path: "/api/cron/telemetry-retention", schedule: "45 10 * * *" });
    expect(config.crons).toContainEqual({ path: "/api/cron/lifecycle", schedule: "0 9 * * *" });
    expect(config.crons).toContainEqual({ path: "/api/cron/registration-expiry", schedule: "0 11 * * *" });
    expect(config.crons).toHaveLength(7);
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
    expect(rollup).not.toHaveBeenCalled();
  });

  it("runs the rollup for the right secret and returns what it wrote", async () => {
    process.env.CRON_SECRET = "secret";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    rollup.mockResolvedValueOnce(RESULT);
    const ok = await GET(request("Bearer secret"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ data: RESULT, error: null });
    expect(rollup).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual({ event: "telemetry.rollup_run", ...RESULT });
  });

  it("reports a failed rollup as 500 with a fixed code and no database detail", async () => {
    process.env.CRON_SECRET = "secret";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    rollup.mockRejectedValueOnce(new Error("permission denied for table page_events at 10.0.0.5"));
    const failed = await GET(request("Bearer secret"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: { code: "TELEMETRY_ROLLUP_FAILED" } });
    expect(JSON.stringify(error.mock.calls)).not.toContain("permission denied");
    expect(JSON.stringify(error.mock.calls)).toContain("telemetry.rollup_failed");
  });

  it("is a dynamic Node route with a bounded duration", () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/cron/telemetry-rollup/route.ts"), "utf8");
    expect(source).toContain('export const runtime = "nodejs";');
    expect(source).toContain('export const dynamic = "force-dynamic";');
    expect(source).toContain("export const maxDuration = 60;");
  });
});

describe("runTelemetryRollup", () => {
  const actual = async () => (await vi.importActual<typeof import("@/lib/telemetry/rollup")>("@/lib/telemetry/rollup")).runTelemetryRollup;
  function service(result: { data: unknown; error: { message: string } | null }) {
    const rpc = vi.fn().mockResolvedValue(result);
    const schema = vi.fn().mockReturnValue({ rpc });
    return { service: { schema } as never, rpc, schema };
  }

  it("calls onzio.rollup_page_telemetry with the default of three days", async () => {
    const run = await actual();
    const fake = service({ data: RESULT, error: null });
    expect(ROLLUP_DAYS_PER_RUN).toBe(3);
    await expect(run({ service: fake.service })).resolves.toEqual(RESULT);
    expect(fake.schema).toHaveBeenCalledWith("onzio");
    expect(fake.rpc).toHaveBeenCalledWith("rollup_page_telemetry", { p_days: 3 });
  });

  it("passes an explicit day count", async () => {
    const run = await actual();
    const fake = service({ data: RESULT, error: null });
    await run({ service: fake.service, days: 7 });
    expect(fake.rpc).toHaveBeenCalledWith("rollup_page_telemetry", { p_days: 7 });
  });

  it.each([
    ["an rpc error", { data: null, error: { message: "boom" } }],
    ["an empty result", { data: null, error: null }],
    ["an array", { data: [], error: null }],
    ["a missing field", { data: { clubs: 1, days: 3 }, error: null }],
    ["a negative count", { data: { clubs: -1, days: 3, rowsWritten: 0 }, error: null }],
    ["a fractional count", { data: { clubs: 1, days: 3.5, rowsWritten: 0 }, error: null }],
    ["a string count", { data: { clubs: 1, days: 3, rowsWritten: "4" }, error: null }],
  ])("rejects %s", async (_label, result) => {
    const run = await actual();
    await expect(run({ service: service(result).service })).rejects.toThrow();
  });
});
