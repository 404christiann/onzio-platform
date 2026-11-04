import { type CinematicContactSave, type CinematicContactSnapshot } from "@/lib/cinematic-contact-content";

export async function loadCinematicContactEditor(operationId?: string): Promise<CinematicContactSnapshot> {
  const response = await fetch(`/api/admin/cinematic-contact${operationId ? `?operationId=${encodeURIComponent(operationId)}` : ""}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Unable to load Contact.");
  return data;
}

export async function saveCinematicContactEditor(request: CinematicContactSave): Promise<
  { status: "committed"; snapshot: CinematicContactSnapshot } |
  { status: "conflict" | "rejected"; message: string } |
  { status: "uncertain"; request: CinematicContactSave; message: string }
> {
  try {
    const response = await fetch("/api/admin/cinematic-contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    const data = await response.json();
    if (response.ok) return { status: "committed", snapshot: data };
    if (response.status >= 500) throw new Error("Save status unknown");
    return { status: response.status === 409 ? "conflict" : "rejected", message: data.error?.message ?? "Unable to save Contact." };
  } catch {
    try {
      const loaded = await loadCinematicContactEditor(request.operationId);
      if (loaded.operation?.status === "committed") return { status: "committed", snapshot: loaded.operation.receipt };
    } catch {}
    return { status: "uncertain", request, message: "Save could not be confirmed. Retry the same save. Your draft is locked until then." };
  }
}
