/**
 * Turns a non-contract failure from /api/admin/media/authorize into a specific
 * error code and a short, safe explanation.
 *
 * Why this exists. The authorize route asks Supabase Storage to sign an upload
 * URL, and Storage evaluates the `onzio_staging_member_insert` RLS policy at
 * that moment. When that policy denies the row, Storage returns a generic
 * "new row violates row-level security policy" and the route used to translate
 * it into `MEDIA_AUTH_FAILED` with no message at all. That one code has now
 * been reported twice with two different underlying causes, and both times the
 * cause had to be reconstructed by reading migrations rather than by reading
 * the failure.
 *
 * The policy has exactly three conjuncts, so a denial has exactly three
 * possible meanings, and `onzio_private.can_mutate_feature` -> `can_mutate_content`
 * narrows the third to session freshness, club membership, or the club's
 * lifecycle/public-access state. Naming that in the response is what makes the
 * next report actionable in one step.
 *
 * Nothing sensitive is exposed. The caller has already been authenticated as an
 * admin of the club in question; the strings below name only the class of
 * precondition, never an identifier, token, storage path, policy body, or SQL.
 */

export const MEDIA_UPLOAD_NOT_PERMITTED = "MEDIA_UPLOAD_NOT_PERMITTED";
export const MEDIA_STORAGE_UNAVAILABLE = "MEDIA_STORAGE_UNAVAILABLE";
export const MEDIA_AUTH_FAILED = "MEDIA_AUTH_FAILED";

const ROW_LEVEL_SECURITY_REASON =
  "The database refused to authorize this upload. This means the club's " +
  "content editing is currently blocked: the admin session is older than the " +
  "30-day limit, the account is no longer an active member of this club, or " +
  "the club's lifecycle/public-access state does not currently allow content " +
  "changes. Signing out and back in resolves the first; the others need an " +
  "Onzio operator.";

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

export function describeMediaAuthorizationFailure(error: unknown): {
  code: string;
  reason: string;
} {
  const message = messageOf(error).toLowerCase();

  if (
    message.includes("row-level security") ||
    message.includes("row level security") ||
    message.includes("violates row-level")
  ) {
    return { code: MEDIA_UPLOAD_NOT_PERMITTED, reason: ROW_LEVEL_SECURITY_REASON };
  }

  if (
    message.includes("jwt") ||
    message.includes("expired") ||
    message.includes("invalid token") ||
    message.includes("unauthorized")
  ) {
    return {
      code: "AUTHENTICATION_REQUIRED",
      reason:
        "The admin session was rejected while preparing the upload. Sign out " +
        "and sign back in, then try again.",
    };
  }

  if (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econn") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout") ||
    message.includes("socket")
  ) {
    return {
      code: MEDIA_STORAGE_UNAVAILABLE,
      reason:
        "The media storage service could not be reached. This is usually " +
        "temporary — try the upload again in a moment.",
    };
  }

  return {
    code: MEDIA_AUTH_FAILED,
    reason: message
      ? `The upload could not be authorized: ${messageOf(error)}`
      : "The upload could not be authorized for an unrecognized reason.",
  };
}
