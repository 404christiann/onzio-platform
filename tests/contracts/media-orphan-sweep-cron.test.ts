import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/media-orphan-sweep", () => ({ runMediaOrphanSweep: vi.fn() }));

import { GET } from "@/app/api/cron/media-orphan-sweep/route";
import { runMediaOrphanSweep } from "@/lib/media-orphan-sweep";

const sweep = vi.mocked(runMediaOrphanSweep);
const original = process.env.CRON_SECRET;
afterEach(() => {
  vi.clearAllMocks();
  if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
});
const request = (authorization?: string) =>
  new Request("https://onzio.example/api/cron/media-orphan-sweep", { headers: authorization ? { authorization } : undefined });

describe("orphan media sweep cron", () => {
  it("is scheduled once daily, after the staging cleanup", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { crons: Array<{ path: string; schedule: string }> };
    expect(config.crons).toContainEqual({ path: "/api/cron/media-orphan-sweep", schedule: "30 10 * * *" });
  });

  it("fails closed without CRON_SECRET or with the wrong secret", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request("Bearer x"))).status).toBe(401);
    process.env.CRON_SECRET = "secret";
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer other"))).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("runs the sweep for the right secret and reports an incomplete run as 500", async () => {
    process.env.CRON_SECRET = "secret";
    sweep.mockResolvedValueOnce({ mode: "dry-run", failed: 0 } as never);
    const ok = await GET(request("Bearer secret"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ data: { mode: "dry-run", failed: 0 }, error: null });

    vi.spyOn(console, "error").mockImplementation(() => {});
    sweep.mockResolvedValueOnce({ mode: "enforce", failed: 2 } as never);
    expect((await GET(request("Bearer secret"))).status).toBe(500);
    sweep.mockRejectedValueOnce(new Error("db"));
    const failed = await GET(request("Bearer secret"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: { code: "MEDIA_ORPHAN_SWEEP_FAILED" } });
  });
});
