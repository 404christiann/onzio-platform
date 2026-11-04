import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { saveVisitorPageEditor } from "@/lib/visitor-page-editor";
import { emptyStadiumContent, type StadiumSaveRequest } from "@/lib/stadium-content";

afterEach(() => vi.unstubAllGlobals());
const request = (): StadiumSaveRequest => ({ operationId: randomUUID(), expectedRevision: "1", designRevision: "design", content: emptyStadiumContent(), retiredMediaAssetIds: [] });
describe("Independent Stadium save recovery", () => {
  it("reconciles a lost response with the Stadium operation receipt", async () => {
    const save = request(), receipt = { revision: "2", designRevision: "design", content: save.content, media: [] };
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(new Response(JSON.stringify({ operation: { status: "committed", receipt } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await saveVisitorPageEditor("stadium", save)).toEqual({ status: "committed", snapshot: receipt });
    expect(fetcher.mock.calls[1][0]).toBe(`/api/admin/visitor-pages/stadium?operationId=${save.operationId}`);
  });
  it("locks the exact original revision/body/operation when a commit is uncertain", async () => {
    const save = request();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify({ revision: "8", operation: { status: "not-committed" } }), { status: 200 })));
    const result = await saveVisitorPageEditor("stadium", save);
    expect(result.status).toBe("uncertain");
    if (result.status === "uncertain") expect(result.request).toBe(save);
  });
});
