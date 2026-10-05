export type PageSaveResult<T> =
  | { kind: "committed"; snapshot: T }
  | { kind: "unconfirmed"; message: string }
  | { kind: "rejected"; status: number; code?: string; message: string };

/** A 5xx or interrupted response may follow a successful database commit. */
export async function submitPageSave<T>(send: () => Promise<Response>, statusUrl: string): Promise<PageSaveResult<T>> {
  let message = "Save status is unknown. Confirm the exact save before editing again.";
  try {
    const response = await send();
    const body = await response.json();
    if (response.ok) return { kind: "committed", snapshot: body as T };
    message = body.error?.message ?? message;
    if (response.status < 500 && body.error?.code !== "DATABASE_OPERATION_FAILED") {
      return { kind: "rejected", status: response.status, code: body.error?.code, message };
    }
  } catch { /* Reconcile the submitted operation, never invent a new one. */ }
  try {
    const response = await fetch(statusUrl, { credentials: "same-origin", cache: "no-store" });
    const body = await response.json();
    if (response.ok && body.operation?.status === "committed" && body.operation.receipt) {
      return { kind: "committed", snapshot: body.operation.receipt as T };
    }
  } catch { /* The caller retains its exact request and draft. */ }
  return { kind: "unconfirmed", message: `${message} Your draft is locked; select Confirm save to retry the exact request.` };
}
