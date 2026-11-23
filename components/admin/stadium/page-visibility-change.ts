import { pageVisible, type PublicPageKey } from "@/lib/public-page-visibility";
import { savePublicPageVisibility } from "@/lib/public-page-visibility-editor";

export type PageVisibilityChange = { visible: boolean; failure: string | null };

/**
 * Saves one page's "Visible to visitors" switch and says what the switch should show next:
 * the server's answer after a save, or the value it had before after a failure.
 */
export async function changePageVisibility(page: PublicPageKey, next: boolean, previous: boolean): Promise<PageVisibilityChange> {
  const outcome = await savePublicPageVisibility(page, next);
  if (!outcome.ok) return { visible: previous, failure: outcome.message };
  return { visible: pageVisible({ publicPageVisibility: outcome.visibility }, page), failure: null };
}
