/** Independent page revisions using the established atomic content Save contract. */
export type VisitorPageKey = "chick-fil-a" | "stadium" | "robinson";
export type VisitorPageMedia = { id: string; storage_bucket: string; storage_path: string; width: number; height: number };
export type VisitorPageSnapshot<T> = {
  revision: string;
  designRevision: string;
  content: T | null;
  media: VisitorPageMedia[];
  retiredMediaAssetIds?: string[];
  cleanupPending?: boolean;
  operation?: { status: "not-committed" } | { status: "committed"; receipt: VisitorPageSnapshot<T> };
};
export type VisitorPageSaveRequest<T> = {
  operationId: string; expectedRevision: string; designRevision: string;
  content: T; retiredMediaAssetIds: string[];
};
export type VisitorPageSaveOutcome<T> =
  | { status: "committed"; snapshot: VisitorPageSnapshot<T> }
  | { status: "conflict" | "rejected"; message: string }
  | { status: "uncertain"; request: VisitorPageSaveRequest<T>; message: string };

export async function loadVisitorPageEditor<T>(page: VisitorPageKey, operationId?: string): Promise<VisitorPageSnapshot<T>> {
  const response = await fetch(`/api/admin/visitor-pages/${page}` + (operationId ? `?operationId=${encodeURIComponent(operationId)}` : ""), { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Unable to load the page.");
  return data;
}

export async function saveVisitorPageEditor<T>(page: VisitorPageKey, request: VisitorPageSaveRequest<T>): Promise<VisitorPageSaveOutcome<T>> {
  try {
    const response = await fetch(`/api/admin/visitor-pages/${page}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    const data = await response.json();
    if (response.ok) return { status: "committed", snapshot: data };
    if (response.status >= 500) throw new Error("Save status unknown");
    return { status: response.status === 409 ? "conflict" : "rejected", message: data.error?.message ?? "Unable to save the page." };
  } catch {
    try {
      const loaded = await loadVisitorPageEditor<T>(page, request.operationId);
      if (loaded.operation?.status === "committed") return { status: "committed", snapshot: loaded.operation.receipt };
    } catch { /* Keep the exact operation for a subsequent retry. */ }
    return { status: "uncertain", request, message: "Save could not be confirmed. Retry the same save. Your draft is locked until then." };
  }
}
