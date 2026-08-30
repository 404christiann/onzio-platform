import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing-lifecycle", () => ({
  runBillingLifecycle: vi.fn(),
  signalLifecycleHeartbeat: vi.fn(),
}));

import { GET } from "@/app/api/cron/lifecycle/route";
import {
  runBillingLifecycle,
  signalLifecycleHeartbeat,
} from "@/lib/billing-lifecycle";

const run = vi.mocked(runBillingLifecycle);
const heartbeat = vi.mocked(signalLifecycleHeartbeat);
const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  vi.clearAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

function request(token?: string): Request {
  return new Request("https://onzio.example/api/cron/lifecycle", {
    headers: token ? { authorization: token } : undefined,
  });
}

describe("PLAT-102 lifecycle cron", () => {
  it("adds only the lifecycle heartbeat schedule", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(config.crons).toContainEqual({
      path: "/api/cron/lifecycle",
      schedule: "0 9 * * *",
    });
    const mediaRoute = readFileSync(
      resolve(process.cwd(), "app/api/cron/media-cleanup/route.ts"),
      "utf8",
    );
    expect(mediaRoute).not.toContain("Heartbeat");
    expect(mediaRoute).not.toContain("heartbeat");
  });

  it("fails closed without the Vercel cron bearer", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request())).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns 200 and pings success on a clean run", async () => {
    process.env.CRON_SECRET = "local-cron-secret";
    run.mockResolvedValue({ warnings: 1, suspensions: 0, divergences: 0 });
    const response = await GET(request("Bearer local-cron-secret"));
    expect(response.status).toBe(200);
    expect(heartbeat).toHaveBeenCalledWith("success", "BILLING_LIFECYCLE_CLEAN");
  });

  it("returns non-200 and explicitly signals reconciliation drift", async () => {
    process.env.CRON_SECRET = "local-cron-secret";
    run.mockResolvedValue({ warnings: 0, suspensions: 0, divergences: 1 });
    const response = await GET(request("Bearer local-cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "RECONCILIATION_DIVERGENCE" },
    });
    expect(heartbeat).toHaveBeenCalledWith("failure", "RECONCILIATION_DIVERGENCE");
  });

  it("sanitizes failures while attempting a failure heartbeat", async () => {
    process.env.CRON_SECRET = "local-cron-secret";
    run.mockRejectedValue(new Error("private database detail"));
    const response = await GET(request("Bearer local-cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "BILLING_LIFECYCLE_FAILED" },
    });
    expect(heartbeat).toHaveBeenCalledWith("failure", "BILLING_LIFECYCLE_FAILED");
  });
});
