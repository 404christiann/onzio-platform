import { ContractError } from "@/lib/contract-error";
import { MEDIA_RESERVATION_MESSAGES } from "@/lib/media-quota";
import { MEDIA_MAX_DIMENSION, MEDIA_RULES, mediaTypesLabel, megabytesLabel } from "@/lib/media-rules";

const { photo, graphic } = MEDIA_RULES;
const TOO_LARGE = `This image file is too large. Graphics can be up to ${megabytesLabel(graphic.maxBytes)} and photos up to ${megabytesLabel(photo.maxBytes)}.`;
const TOO_MANY_PIXELS = `This image has too many pixels. Use one no larger than ${MEDIA_MAX_DIMENSION} pixels on each side.`;
const UNREADABLE = "This image could not be read. It may be damaged. Export it again and retry.";
const WRONG_TYPE = `This file type can't be used here. Use ${mediaTypesLabel(graphic.mimeTypes)} for graphics, or ${mediaTypesLabel(photo.mimeTypes)} for photos.`;
const UNEXPECTED = "The image could not be uploaded. Try again.";

/** The plain message each media finalization refusal shows in the admin upload field. */
export const MEDIA_FINALIZE_MESSAGES: Record<string, string> = {
  ...MEDIA_RESERVATION_MESSAGES,
  FILE_TOO_LARGE: TOO_LARGE,
  DIMENSIONS_TOO_LARGE: TOO_MANY_PIXELS,
  CORRUPT_IMAGE: UNREADABLE,
  UNSUPPORTED_MEDIA_TYPE: WRONG_TYPE,
  SIGNATURE_MISMATCH: WRONG_TYPE,
  INVALID_MEDIA_METADATA: WRONG_TYPE,
  STAGING_OBJECT_MISSING: "The uploaded file was not found. Upload it again.",
  AUTHENTICATION_REQUIRED: "Your session has ended. Sign in again, then upload the image.",
};

export type FinalizeFailure = { status: number; code: string; message: string };

/** Turns a finalize error into the response the admin sees; anything that is not a known refusal is logged. */
export function describeFinalizeFailure(error: unknown): FinalizeFailure {
  if (error instanceof ContractError && MEDIA_FINALIZE_MESSAGES[error.code]) {
    return {
      status: error.code === "AUTHENTICATION_REQUIRED" ? 401 : 400,
      code: error.code,
      message: MEDIA_FINALIZE_MESSAGES[error.code],
    };
  }
  console.error("[media finalize] unexpected failure", error);
  return {
    status: error instanceof ContractError ? 400 : 500,
    code: error instanceof ContractError ? error.code : "MEDIA_FINALIZATION_FAILED",
    message: UNEXPECTED,
  };
}
