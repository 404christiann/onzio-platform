import type { AboutEditorSaveRequest, AboutEditorSnapshot } from "./contract";

export async function loadAboutEditor(page: "about" | "logo", operationId?: string): Promise<AboutEditorSnapshot> {
  const response = await fetch(`/api/admin/about-editor?page=${page}${operationId ? `&operationId=${encodeURIComponent(operationId)}` : ""}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "Unable to load this page.");
  return result;
}

export type AboutSaveOutcome =
  | { status: "committed"; snapshot: AboutEditorSnapshot }
  | { status: "conflict"; message: string }
  | { status: "rejected"; message: string }
  | { status: "uncertain"; request: AboutEditorSaveRequest; message: string };

/** A server 500 or lost response may follow a commit. Always check the original receipt. */
export async function saveAboutEditor(request: AboutEditorSaveRequest): Promise<AboutSaveOutcome> {
  try {
    const response = await fetch("/api/admin/about-editor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    const result = await response.json();
    if (response.ok) return { status: "committed", snapshot: result };
    if (response.status >= 500 || result.error?.code === "DATABASE_OPERATION_FAILED") throw new Error("Unknown save status");
    if (response.status === 409 && ["ABOUT_CHANGED", "DESIGN_CHANGED"].includes(result.error?.code)) return { status: "conflict", message: result.error.message };
    return { status: "rejected", message: result.error?.message ?? "Unable to save this page." };
  } catch {
    try {
      const snapshot = await loadAboutEditor(request.page, request.operationId);
      if (snapshot.operation?.status === "committed") return { status: "committed", snapshot: snapshot.operation.receipt };
    } catch { /* The exact operation remains the only safe retry. */ }
    return { status: "uncertain", request, message: "Save could not be confirmed. Retry the exact save to confirm it. This page's draft is locked until then." };
  }
}
