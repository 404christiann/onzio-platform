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

export const ACCEPTED_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const ACCEPTED_MEDIA_FORMATS_LABEL = "JPEG, PNG, or WebP";

/**
 * Names the file type an admin actually picked, in words rather than a MIME
 * string. Browsers report an empty `file.type` for formats they do not
 * recognise at all, which is itself the answer to "why was it rejected".
 */
function describeMimeType(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const subtype = value.split("/")[1]?.split(";")[0]?.trim();
  if (!subtype) return null;
  if (subtype === "jpeg") return "JPEG";
  if (subtype === "svg+xml") return "SVG";
  return subtype.toUpperCase();
}

function issuePath(issue: unknown): string {
  if (!issue || typeof issue !== "object") return "";
  const path = (issue as { path?: unknown }).path;
  return Array.isArray(path) ? path.map(String).join(".") : "";
}

/**
 * Turns a rejected /api/admin/media/authorize request body into one sentence an
 * club admin can act on.
 *
 * Why this exists. The route used to return `parsed.error.message` verbatim,
 * which for a Zod failure is a JSON array of issue objects. A club operator who
 * picked an iPhone HEIC photo saw a raw `{"code":"invalid_value","values":[...],
 * "path":["mimeType"]}` dump in the admin UI and could not tell that the fix was
 * simply to convert the photo. The file input offers `image/*` while only three
 * formats are decodable server-side, so this is a routine, self-inflicted
 * failure that deserves routine wording.
 *
 * Nothing sensitive is exposed: the values echoed back are the caller's own
 * chosen file type and size.
 */
export function describeMediaRequestValidationFailure(
  issues: readonly unknown[],
  body: unknown,
): string {
  const request = (body ?? {}) as Record<string, unknown>;
  const paths = new Set(issues.map(issuePath));

  if (paths.has("mimeType")) {
    const actual = describeMimeType(request.mimeType);
    return actual
      ? `Please upload a ${ACCEPTED_MEDIA_FORMATS_LABEL} image. ${actual} isn't supported — convert the file and try again.`
      : `Please upload a ${ACCEPTED_MEDIA_FORMATS_LABEL} image. This file's type could not be read, so it can't be accepted — convert the file and try again.`;
  }

  if (paths.has("size")) {
    const size = request.size;
    const megabytes =
      typeof size === "number" && Number.isFinite(size) && size > 0
        ? ` (this one is ${(size / (1024 * 1024)).toFixed(1)} MB)`
        : "";
    return `Images must be under 15 MB${megabytes}. Please resize the file and try again.`;
  }

  if (paths.has("fileName")) {
    return "That file's name is missing or too long. Rename it to something shorter and try again.";
  }

  return "The upload request was not valid. Please reselect the file and try again.";
}

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
