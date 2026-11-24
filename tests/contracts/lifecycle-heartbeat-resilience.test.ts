import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing-drift", () => ({ runBillingDriftAlert: vi.fn() }));
vi.mock("@/lib/billing-lifecycle", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/billing-lifecycle")>()),
  runBillingLifecycle: vi.fn(),
}));

import { GET, maxDuration } from "@/app/api/cron/lifecycle/route";
import { runBillingDriftAlert } from "@/lib/billing-drift";
import { runBillingLifecycle } from "@/lib/billing-lifecycle";

const BASE = "https://hc-ping.example.test/00000000-0000-4000-8000-000000000000";
const fetchMock = vi.fn();
const clean = { warnings: 0, suspensions: 0, divergences: 0 };

function request(): Request {
  return new Request("https://onzio.example/api/cron/lifecycle", {
    headers: { authorization: "Bearer local-cron-secret" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("OK", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("CRON_SECRET", "local-cron-secret");
  vi.stubEnv("LIFECYCLE_CRON_HEARTBEAT_URL", BASE);
  vi.mocked(runBillingDriftAlert).mockResolvedValue(0);
  vi.mocked(runBillingLifecycle).mockResolvedValue(clean);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("lifecycle cron stays correct when the heartbeat monitor misbehaves", () => {
  it("returns 200 with the lifecycle result when the heartbeat times out", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: clean, error: null });
  });

  it("does not flip to 500 when the heartbeat answers 5xx", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 503 }));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: clean, error: null });
  });

  it("does not flip to 500 when the heartbeat URL is not configured", async () => {
    vi.stubEnv("LIFECYCLE_CRON_HEARTBEAT_URL", "");
    expect((await GET(request())).status).toBe(200);
  });

  it("still reports a failed run when the failure heartbeat itself fails", async () => {
    vi.mocked(runBillingLifecycle).mockRejectedValue(new Error("private detail"));
    fetchMock.mockRejectedValue(new Error("network down"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "BILLING_LIFECYCLE_FAILED" } });
  });

  it("sends /fail when the drift alert throws, instead of going silent", async () => {
    vi.mocked(runBillingDriftAlert).mockRejectedValue(new Error("drift crashed"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(`${BASE}/fail`);
    expect(init.body).toBe('{"status":"failure","detail":"BILLING_LIFECYCLE_FAILED"}');
  });

  it("pings success on the base URL after a clean run", async () => {
    await GET(request());
    expect((fetchMock.mock.calls[0][0] as URL).href).toBe(BASE);
  });

  it("declares maxDuration like the other crons", () => {
    expect(maxDuration).toBe(60);
    const source = readFileSync(resolve(process.cwd(), "app/api/cron/lifecycle/route.ts"), "utf8");
    expect(source).toMatch(/export const maxDuration = 60;/);
  });
});
