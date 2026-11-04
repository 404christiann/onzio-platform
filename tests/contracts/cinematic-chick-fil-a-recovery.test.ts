import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { saveVisitorPageEditor } from "@/lib/visitor-page-editor";
import { emptyChickFilAContent } from "@/lib/chick-fil-a-content";
afterEach(() => vi.unstubAllGlobals());
describe("Chick-fil-A operation recovery", () => {
  const request = () => ({ operationId: randomUUID(), expectedRevision: "7", designRevision: "cinematic@2", content: emptyChickFilAContent(), retiredMediaAssetIds: [] });
  it("reconciles only this page's exact committed operation when a save response disappears", async () => {
    const r = request(), receipt = { revision: "8", designRevision: "cinematic@2", content: r.content, media: [] };
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(new Response(JSON.stringify({ operation: { status: "committed", receipt } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await saveVisitorPageEditor("chick-fil-a", r)).toEqual({ status: "committed", snapshot: receipt });
    expect(fetcher.mock.calls[0][0]).toBe("/api/admin/visitor-pages/chick-fil-a"); expect(fetcher.mock.calls[1][0]).toBe(`/api/admin/visitor-pages/chick-fil-a?operationId=${r.operationId}`);
  });
  it("keeps the exact old revision and operation locked for retry when a newer page cannot confirm it", async () => {
    const r = request();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify({ revision: "12", operation: { status: "not-committed" } }), { status: 200 })));
    const result = await saveVisitorPageEditor("chick-fil-a", r);
    expect(result.status).toBe("uncertain"); if (result.status === "uncertain") expect(result.request).toBe(r);
  });
});
