import type { PublicPageKey, PublicPageVisibility } from "@/lib/public-page-visibility";

export type PublicPageVisibilityOutcome =
  | { ok: true; visibility: PublicPageVisibility }
  | { ok: false; message: string };

/** Sets one page's "Visible to visitors" switch for the signed-in owner/admin's club. */
export async function savePublicPageVisibility(page: PublicPageKey, visible: boolean): Promise<PublicPageVisibilityOutcome> {
  try {
    const response = await fetch("/api/admin/public-page-visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, visible }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data && typeof data.visibility === "object") return { ok: true, visibility: data.visibility };
    return { ok: false, message: "Couldn't change who can see this page. Try again." };
  } catch {
    return { ok: false, message: "Couldn't change who can see this page. Try again." };
  }
}
