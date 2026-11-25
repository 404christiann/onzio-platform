import { describe, expect, it } from "vitest";
import { readableUploadError } from "@/components/admin/ui/adminImageFiles";

// The homepage slideshow and artwork editors show the server's reason for a refused upload, but some
// refusals (an expired session at authorize, for one) carry only a code as their message. A code is not
// something to show an admin, so the editor's own friendly line is used instead.

const FALLBACK = "This photo could not be added. Your other changes are still here.";

describe("readableUploadError", () => {
  it("shows the server's plain-language reason", () => {
    expect(readableUploadError({ code: "FILE_TOO_LARGE", message: "This image file is too large. Graphics can be up to 5 MB and photos up to 15 MB." }, FALLBACK))
      .toBe("This image file is too large. Graphics can be up to 5 MB and photos up to 15 MB.");
  });

  it("falls back to the friendly line when the message is only a code", () => {
    expect(readableUploadError({ code: "AUTHENTICATION_REQUIRED", message: "AUTHENTICATION_REQUIRED" }, FALLBACK)).toBe(FALLBACK);
    expect(readableUploadError({ code: "CROSS_CLUB_MEDIA", message: "CROSS_CLUB_MEDIA" }, FALLBACK)).toBe(FALLBACK);
  });

  it("falls back when there is no error message at all", () => {
    expect(readableUploadError(null, FALLBACK)).toBe(FALLBACK);
    expect(readableUploadError({ code: "X", message: "  " }, FALLBACK)).toBe(FALLBACK);
  });

  it("is what both homepage upload paths use", async () => {
    const { readFileSync } = await import("node:fs");
    const hook = readFileSync("lib/homepage-editor/useHomepageEditor.ts", "utf8");
    expect(hook).not.toContain("result.error?.message ||");
    expect(hook.match(/readableUploadError\(result\.error,/g)).toHaveLength(2);
  });
});
