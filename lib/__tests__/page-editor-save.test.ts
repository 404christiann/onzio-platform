import { afterEach, describe, expect, it, vi } from "vitest";
import { submitPageSave } from "@/lib/page-editor-save";

const request = { operationId: "op-1", expectedRevision: "7", page: { title: "Draft" } };
const receipt = { revision: "8", page: request.page };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const send = () => fetch("/save", { method: "POST", body: JSON.stringify(request) });
afterEach(() => vi.unstubAllGlobals());

describe("public page save reconciliation", () => {
  it.each(["HTTP 500", "lost response"])("recovers a committed %s from its original operation receipt", async (failure) => {
    const fetcher = vi.fn()
      .mockImplementationOnce(() => failure === "HTTP 500" ? Promise.resolve(json({ error: { code: "DATABASE_OPERATION_FAILED" } }, 500)) : Promise.reject(new Error("network lost")))
      .mockResolvedValueOnce(json({ operation: { status: "committed", receipt } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await submitPageSave(send, "/status?operationId=op-1")).toEqual({ kind: "committed", snapshot: receipt });
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify(request));
    expect(fetcher.mock.calls[1][0]).toBe("/status?operationId=op-1");
  });

  it.each(["unavailable", "not-committed"])("keeps an exact retry required after a %s receipt lookup", async (status) => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("network lost"))
      .mockImplementationOnce(() => status === "unavailable" ? Promise.reject(new Error("offline")) : Promise.resolve(json({ operation: { status } })))
      .mockResolvedValueOnce(json(receipt));
    vi.stubGlobal("fetch", fetcher);
    const result = await submitPageSave(send, "/status?operationId=op-1");
    expect(result.kind).toBe("unconfirmed");
    expect(await submitPageSave(send, "/status?operationId=op-1")).toEqual({ kind: "committed", snapshot: receipt });
    expect(fetcher.mock.calls[2][1].body).toBe(fetcher.mock.calls[0][1].body);
  });

  it("returns a definite conflict for explicit review without pretending it committed", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ error: { code: "CONTENT_CHANGED", message: "Changed elsewhere" } }, 409));
    vi.stubGlobal("fetch", fetcher);
    expect(await submitPageSave(send, "/status?operationId=op-1")).toEqual({ kind: "rejected", status: 409, code: "CONTENT_CHANGED", message: "Changed elsewhere" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
