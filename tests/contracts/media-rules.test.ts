import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authorizeMediaRequestSchema } from "@/lib/media-api-contract";
import { describeMediaRequestValidationFailure } from "@/lib/media-diagnostics";
import { MEDIA_FINALIZE_MESSAGES } from "@/lib/media-finalize-errors";
import { MEDIA_RULES, mediaAccept, mediaHint } from "@/lib/media-rules";

const MB = 1024 * 1024;

function authorizeMessage(body: Record<string, unknown>): string | null {
  const request = { surface: "about", fileName: "crest.png", mimeType: "image/png", ...body };
  const parsed = authorizeMediaRequestSchema.safeParse(request);
  return parsed.success ? null : describeMediaRequestValidationFailure(parsed.error.issues, request);
}

describe("the shared media rules", () => {
  it("hold the agreed limits for each kind", () => {
    expect(MEDIA_RULES.photo).toMatchObject({
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: 15 * MB,
      maxDimension: 6000,
      maxPixels: 36_000_000,
      outputLongEdge: 2400,
      outputFormats: ["webp"],
    });
    expect(MEDIA_RULES.graphic).toMatchObject({
      mimeTypes: ["image/png", "image/webp"],
      maxBytes: 5 * MB,
      maxDimension: 6000,
      maxPixels: 36_000_000,
      outputLongEdge: 2400,
      outputFormats: ["png", "webp"],
    });
  });

  it("match the database checks they cannot change", () => {
    const quota = readFileSync("supabase/migrations/20261118200000_media_upload_quota.sql", "utf8");
    expect(quota).toContain(`claimed_size <= ${MEDIA_RULES.photo.maxBytes})`);
    expect(quota).toContain(`kind = 'photo' or claimed_size <= ${MEDIA_RULES.graphic.maxBytes})`);
    const foundation = readFileSync("supabase/migrations/20260726000100_phase2_foundation.sql", "utf8");
    expect(foundation).toContain(`width <= ${MEDIA_RULES.photo.maxDimension})`);
    expect(foundation).toContain(`height <= ${MEDIA_RULES.graphic.maxDimension})`);
  });

  it("write the field hints and picker types from the rules", () => {
    expect(mediaHint("photo")).toBe("JPG, PNG or WebP up to 15 MB");
    expect(mediaHint("graphic")).toBe("PNG or WebP up to 5 MB");
    expect(mediaHint("graphic", { pixels: true })).toBe("PNG or WebP up to 5 MB, at most 6000 pixels on each side");
    expect(mediaAccept("graphic")).toBe("image/png,image/webp");
  });
});

describe("authorize explains a refused file with the limits of its kind", () => {
  it("tells a graphic over 5 MB the graphic limit, not the photo limit", () => {
    const message = authorizeMessage({ kind: "graphic", size: 6 * MB });
    expect(message).toContain("Graphics must be under 5 MB");
    expect(message).toContain("6.0 MB");
    expect(message).not.toContain("15 MB");
  });

  it("tells a photo over 15 MB the photo limit", () => {
    const message = authorizeMessage({ kind: "photo", fileName: "big.jpg", mimeType: "image/jpeg", size: 40 * MB });
    expect(message).toContain("Photos must be under 15 MB");
    expect(message).toContain("40.0 MB");
  });

  it("refuses a JPG for a graphic field at authorize, naming the graphic types", () => {
    const message = authorizeMessage({ kind: "graphic", fileName: "crest.jpg", mimeType: "image/jpeg", size: MB });
    expect(message).toContain("PNG or WebP");
    expect(message).toContain("JPG");
    expect(message).not.toContain("JPG, PNG");
  });

  it("names the photo types for an unsupported photo", () => {
    const message = authorizeMessage({ kind: "photo", fileName: "IMG.HEIC", mimeType: "image/heic", size: MB });
    expect(message).toContain("JPG, PNG or WebP");
    expect(message).toContain("HEIC");
  });

  it("accepts files inside each kind's limits", () => {
    expect(authorizeMessage({ kind: "graphic", size: 5 * MB })).toBeNull();
    expect(authorizeMessage({ kind: "photo", fileName: "a.jpg", mimeType: "image/jpeg", size: 15 * MB })).toBeNull();
  });
});

describe("finalize messages quote the shared limits", () => {
  it("states each kind's size and pixel limits", () => {
    expect(MEDIA_FINALIZE_MESSAGES.FILE_TOO_LARGE).toContain(`Graphics can be up to 5 MB and photos up to 15 MB`);
    expect(MEDIA_FINALIZE_MESSAGES.DIMENSIONS_TOO_LARGE).toContain("6000 pixels");
  });
});
