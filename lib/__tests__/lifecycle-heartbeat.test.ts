import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signalLifecycleHeartbeat } from "@/lib/billing-lifecycle";

const BASE = "https://hc-ping.example.test/00000000-0000-4000-8000-000000000000";

describe("signalLifecycleHeartbeat", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("LIFECYCLE_CRON_HEARTBEAT_URL", BASE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts a success to the base URL with the status body", async () => {
    await signalLifecycleHeartbeat("success", "BILLING_LIFECYCLE_CLEAN");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(BASE);
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"status":"success","detail":"BILLING_LIFECYCLE_CLEAN"}');
  });

  it("posts a failure to <url>/fail so the monitor goes red", async () => {
    await signalLifecycleHeartbeat("failure", "RECONCILIATION_DIVERGENCE");
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(`${BASE}/fail`);
    expect(init.body).toBe('{"status":"failure","detail":"RECONCILIATION_DIVERGENCE"}');
  });

  it("does not double the slash when the configured URL ends with one", async () => {
    vi.stubEnv("LIFECYCLE_CRON_HEARTBEAT_URL", `${BASE}/`);
    await signalLifecycleHeartbeat("failure", "BILLING_LIFECYCLE_FAILED");
    expect((fetchMock.mock.calls[0][0] as URL).href).toBe(`${BASE}/fail`);
  });

  it("does not mutate a slug-style URL for success", async () => {
    vi.stubEnv("LIFECYCLE_CRON_HEARTBEAT_URL", "https://hc-ping.example.test/ping-key/lifecycle");
    await signalLifecycleHeartbeat("success", "BILLING_LIFECYCLE_CLEAN");
    expect((fetchMock.mock.calls[0][0] as URL).href).toBe("https://hc-ping.example.test/ping-key/lifecycle");
  });

  it("still rejects a missing, non-https or non-ok heartbeat", async () => {
    vi.stubEnv("LIFECYCLE_CRON_HEARTBEAT_URL", "http://hc-ping.example.test/x");
    await expect(signalLifecycleHeartbeat("success", "x")).rejects.toThrow();
    vi.stubEnv("LIFECYCLE_CRON_HEARTBEAT_URL", "");
    await expect(signalLifecycleHeartbeat("success", "x")).rejects.toThrow();
    vi.stubEnv("LIFECYCLE_CRON_HEARTBEAT_URL", BASE);
    fetchMock.mockResolvedValue(new Response("no", { status: 500 }));
    await expect(signalLifecycleHeartbeat("failure", "x")).rejects.toThrow("LIFECYCLE_HEARTBEAT_FAILED");
  });
});
