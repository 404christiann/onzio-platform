import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { saveTicketsEditor } from "@/lib/tickets-editor";
import { emptyTicketsContent, type TicketsSaveRequest } from "@/lib/tickets-content";
afterEach(() => vi.unstubAllGlobals());
const request = (): TicketsSaveRequest => ({ operationId: randomUUID(), expectedRevision: "1", designRevision: "design", content: emptyTicketsContent(), retiredMediaAssetIds: [] });
describe("Tickets response-loss recovery", () => {
    it("reconciles a commit when the original response is lost", async () => {
        const r = request(), receipt = { revision: "2", designRevision: "design", content: r.content, media: [] };
        const fetcher = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(new Response(JSON.stringify({ operation: { status: "committed", receipt } }), { status: 200 }));
        vi.stubGlobal("fetch", fetcher);
        expect(await saveTicketsEditor(r)).toEqual({ status: "committed", snapshot: receipt });
        expect(fetcher.mock.calls[1][0]).toContain(r.operationId);
    });
    it("preserves the exact operation for safe retry when status cannot be confirmed", async () => {
        const r = request();
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
        const result = await saveTicketsEditor(r);
        expect(result.status).toBe("uncertain");
        if (result.status === "uncertain")
            expect(result.request).toBe(r);
    });
    it("keeps a confirmed non-commit as an exact retry without rebasing onto newer content", async () => {
        const r = request();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify({ revision: "3", operation: { status: "not-committed" } }), { status: 200 })));
        const result = await saveTicketsEditor(r);
        expect(result.status).toBe("uncertain");
        if (result.status === "uncertain") {
            expect(result.request.expectedRevision).toBe("1");
            expect(result.request.operationId).toBe(r.operationId);
        }
    });
    it("reports a known conflict without checking an unrelated receipt", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "TICKETS_CHANGED", message: "Review latest page" } }), { status: 409 }));
        vi.stubGlobal("fetch", fetcher);
        expect(await saveTicketsEditor(request())).toEqual({ status: "conflict", message: "Review latest page" });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
