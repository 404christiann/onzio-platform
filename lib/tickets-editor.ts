import type { TicketsSaveRequest, TicketsSnapshot } from "@/lib/tickets-content";
export async function loadTicketsEditor(operationId?: string): Promise<TicketsSnapshot> {
    const response = await fetch("/api/admin/tickets-editor" + (operationId ? "?operationId=" + encodeURIComponent(operationId) : ""), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.error?.message ?? "Unable to load Tickets.");
    return data;
}
export type TicketsSaveOutcome = {
    status: "committed";
    snapshot: TicketsSnapshot;
} | {
    status: "conflict" | "rejected";
    message: string;
} | {
    status: "uncertain";
    request: TicketsSaveRequest;
    message: string;
};
export async function saveTicketsEditor(request: TicketsSaveRequest): Promise<TicketsSaveOutcome> {
    try {
        const response = await fetch("/api/admin/tickets-editor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
        const data = await response.json();
        if (response.ok)
            return { status: "committed", snapshot: data };
        if (response.status >= 500)
            throw new Error("Unknown status");
        return { status: response.status === 409 ? "conflict" : "rejected", message: data.error?.message ?? "Unable to save Tickets." };
    }
    catch {
        try {
            const data = await loadTicketsEditor(request.operationId);
            if (data.operation?.status === "committed")
                return { status: "committed", snapshot: data.operation.receipt };
        }
        catch { }
        return { status: "uncertain", request, message: "Save could not be confirmed. Retry the same save. Your draft is locked until then." };
    }
}
