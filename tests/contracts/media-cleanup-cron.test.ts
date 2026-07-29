import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/media-cleanup", () => ({
  cleanupAbandonedStagingMedia: vi.fn(),
}));

import { GET } from "@/app/api/cron/media-cleanup/route";
import { cleanupAbandonedStagingMedia } from "@/lib/media-cleanup";

const originalCronSecret = process.env.CRON_SECRET;
const cleanup = vi.mocked(cleanupAbandonedStagingMedia);

afterEach(() => {
  vi.clearAllMocks();
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalCronSecret;
  }
});

function request(authorization?: string): Request {
  return new Request("https://onzio.example/api/cron/media-cleanup", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("abandoned media cleanup cron", () => {
  it("is scheduled once daily in Vercel", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toContainEqual({
      path: "/api/cron/media-cleanup",
      schedule: "0 10 * * *",
    });
  });

  it("keeps the cron entrypoint independent from sharp", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "app/api/cron/media-cleanup/route.ts"),
      "utf8",
    );
    const cleanupSource = readFileSync(
      resolve(process.cwd(), "lib/media-cleanup.ts"),
      "utf8",
    );

    expect(routeSource).toContain('from "@/lib/media-cleanup"');
    expect(routeSource).not.toContain('from "@/lib/media-processing"');
    expect(cleanupSource).not.toMatch(/from ["']sharp["']/);
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    process.env.CRON_SECRET = "local-cron-secret";

    const response = await GET(request("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("removes abandoned staging media for an authorized invocation", async () => {
    process.env.CRON_SECRET = "local-cron-secret";
    cleanup.mockResolvedValue({ inspected: 4, removed: 2, failed: 0 });

    const response = await GET(request("Bearer local-cron-secret"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { inspected: 4, removed: 2, failed: 0 },
      error: null,
    });
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("returns a failure for incomplete cleanup so Vercel can alert", async () => {
    process.env.CRON_SECRET = "local-cron-secret";
    cleanup.mockResolvedValue({ inspected: 4, removed: 1, failed: 1 });

    const response = await GET(request("Bearer local-cron-secret"));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "MEDIA_STAGING_CLEANUP_INCOMPLETE" },
    });
  });

  it("does not expose provider errors", async () => {
    process.env.CRON_SECRET = "local-cron-secret";
    cleanup.mockRejectedValue(new Error("sensitive provider detail"));

    const response = await GET(request("Bearer local-cron-secret"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "MEDIA_STAGING_CLEANUP_FAILED" },
    });
  });
});
