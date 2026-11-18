import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { saveVisitorPageEditor, type VisitorPageKey, type VisitorPageSaveRequest } from "@/lib/visitor-page-editor";
afterEach(() => vi.unstubAllGlobals());
const request = (): VisitorPageSaveRequest<{ title: string }> => ({ operationId: randomUUID(), expectedRevision: "1", designRevision: "design", content: { title: "Current page" }, retiredMediaAssetIds: [] });
describe.each<VisitorPageKey>(["chick-fil-a", "stadium"])("%s response loss", page => {
  it("reconciles the actor receipt after the original save response is lost", async () => {
    const r = request(), receipt = { revision: "2", designRevision: "design", content: r.content, media: [] };
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(new Response(JSON.stringify({ operation: { status: "committed", receipt } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await saveVisitorPageEditor(page, r)).toEqual({ status: "committed", snapshot: receipt });
    expect(fetcher.mock.calls[0][0]).toBe(`/api/admin/visitor-pages/${page}`);
    expect(fetcher.mock.calls[1][0]).toBe(`/api/admin/visitor-pages/${page}?operationId=${r.operationId}`);
  });
  it("keeps the exact original request locked when confirmation cannot be obtained", async () => {
    const r = request();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const result = await saveVisitorPageEditor(page, r);
    expect(result.status).toBe("uncertain");
    if (result.status === "uncertain") expect(result.request).toBe(r);
  });
  it("does not rebase an uncertain operation onto a newer revision", async () => {
    const r = request();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify({ revision: "3", operation: { status: "not-committed" } }), { status: 200 })));
    const result = await saveVisitorPageEditor(page, r);
    expect(result.status).toBe("uncertain");
    if (result.status === "uncertain") expect(result.request).toBe(r);
  });
  it("reports confirmed conflicts without checking a different operation", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "VISITOR_PAGE_CHANGED", message: "Reload the latest page" } }), { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await saveVisitorPageEditor(page, request())).toEqual({ status: "conflict", message: "Reload the latest page" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
