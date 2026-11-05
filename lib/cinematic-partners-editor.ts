import { MAX_PARTNERS, type CinematicPartnersContent, type CinematicPartnersSave, type CinematicPartnersSnapshot } from "@/lib/cinematic-partners-content";

export function addPartner(content: CinematicPartnersContent): CinematicPartnersContent {
  if (content.partners.length >= MAX_PARTNERS) return content;
  return { ...content, partners: [...content.partners, { id: crypto.randomUUID(), name: "", role: "", logoAssetId: null, tone: "original" }] };
}

export function movePartner(content: CinematicPartnersContent, index: number, delta: -1 | 1): CinematicPartnersContent {
  const destination = index + delta;
  if (destination < 0 || destination >= content.partners.length) return content;
  const partners = [...content.partners];
  [partners[index], partners[destination]] = [partners[destination], partners[index]];
  return { ...content, partners };
}

export function removePartner(content: CinematicPartnersContent, index: number): CinematicPartnersContent {
  return { ...content, partners: content.partners.filter((_, position) => position !== index) };
}

/** Logos uploaded in this editing session that the draft no longer points at. */
export function unusedUploads(uploads: string[], content: CinematicPartnersContent): string[] {
  const used = new Set(content.partners.map(row => row.logoAssetId));
  return uploads.filter(id => !used.has(id));
}

export async function loadCinematicPartnersEditor(operationId?: string): Promise<CinematicPartnersSnapshot> {
  const response = await fetch(`/api/admin/cinematic-partners${operationId ? `?operationId=${encodeURIComponent(operationId)}` : ""}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Unable to load Partners.");
  return data;
}

export async function saveCinematicPartnersEditor(request: CinematicPartnersSave): Promise<
  { status: "committed"; snapshot: CinematicPartnersSnapshot } |
  { status: "conflict" | "rejected"; message: string } |
  { status: "uncertain"; request: CinematicPartnersSave; message: string }
> {
  try {
    const response = await fetch("/api/admin/cinematic-partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    const data = await response.json();
    if (response.ok) return { status: "committed", snapshot: data };
    if (response.status >= 500) throw new Error("Save status unknown");
    return { status: response.status === 409 ? "conflict" : "rejected", message: data.error?.message ?? "Unable to save Partners." };
  } catch {
    try {
      const loaded = await loadCinematicPartnersEditor(request.operationId);
      if (loaded.operation?.status === "committed") return { status: "committed", snapshot: loaded.operation.receipt };
    } catch {}
    return { status: "uncertain", request, message: "Save could not be confirmed. Retry the same save. Your draft is locked until then." };
  }
}
