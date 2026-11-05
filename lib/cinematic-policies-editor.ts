import { type CinematicPolicySave, type CinematicPolicySnapshot } from "@/lib/cinematic-policies-content";

export async function loadCinematicPolicyEditor(operationId?: string): Promise<CinematicPolicySnapshot> {
  const response = await fetch(`/api/admin/cinematic-policies${operationId ? `?operationId=${encodeURIComponent(operationId)}` : ""}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Unable to load the policy pages.");
  return data;
}

export async function saveCinematicPolicyEditor(request: CinematicPolicySave): Promise<
  { status: "committed"; snapshot: CinematicPolicySnapshot } |
  { status: "conflict" | "rejected"; message: string } |
  { status: "uncertain"; request: CinematicPolicySave; message: string }
> {
  try {
    const response = await fetch("/api/admin/cinematic-policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    const data = await response.json();
    if (response.ok) return { status: "committed", snapshot: data };
    if (response.status >= 500) throw new Error("Save status unknown");
    return { status: response.status === 409 ? "conflict" : "rejected", message: data.error?.message ?? "Unable to save the policy pages." };
  } catch {
    try {
      const loaded = await loadCinematicPolicyEditor(request.operationId);
      if (loaded.operation?.status === "committed") return { status: "committed", snapshot: loaded.operation.receipt };
    } catch {}
    return { status: "uncertain", request, message: "Save could not be confirmed. Retry the same save. Your draft is locked until then." };
  }
}
