import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/admin-client";
import { uploadAboutImage } from "@/lib/about-editor/upload";
import { imageHint, imageFileIssue } from "@/components/admin/ui/adminImageFiles";

const client = vi.hoisted(() => ({ stagingUpload: vi.fn() }));
vi.mock("@/lib/supabase-browser", () => ({ createClient: () => ({ auth: {}, storage: { from: () => ({ uploadToSignedUrl: client.stagingUpload }) } }) }));

function stubFinalize(finalize: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("authorize")
    ? new Response(JSON.stringify({ path: "t/staging.png", token: "signed", authorization: "a" }), { status: 200 })
    : finalize()));
}
const png = () => new File([new Uint8Array([1, 2, 3])], "crest.png", { type: "image/png" });

beforeEach(() => client.stagingUpload.mockResolvedValue({ error: null }));
afterEach(() => vi.unstubAllGlobals());

describe("finalize failure reasons reach the caller", () => {
  it("passes the server message through", async () => {
    stubFinalize(() => new Response(JSON.stringify({ error: { code: "DIMENSIONS_TOO_LARGE", message: "X" } }), { status: 422 }));
    const result = await createClient().storage.from("Aboutassets").upload("a.png", png());
    expect(result.error).toMatchObject({ code: "DIMENSIONS_TOO_LARGE", message: "X" });
  });
  it("names the HTTP status when the body is not JSON", async () => {
    stubFinalize(() => new Response("<html>bad gateway</html>", { status: 500, statusText: "Server Error" }));
    const result = await createClient().storage.from("Aboutassets").upload("a.png", png());
    expect(result.error?.code).toBe("MEDIA_FINALIZATION_FAILED");
    expect(result.error?.message).toContain("500");
  });
  it("fills a message when the server error has none", async () => {
    stubFinalize(() => new Response(JSON.stringify({ error: { code: "ODD" } }), { status: 422 }));
    const result = await createClient().storage.from("Aboutassets").upload("a.png", png());
    expect(result.error?.code).toBe("ODD");
    expect(result.error?.message).toBeTruthy();
  });
  it("uploadAboutImage throws with the server message", async () => {
    stubFinalize(() => new Response(JSON.stringify({ error: { code: "DIMENSIONS_TOO_LARGE", message: "X" } }), { status: 422 }));
    await expect(uploadAboutImage(png(), undefined, "graphic")).rejects.toThrow("X");
  });
});

describe("image field wording", () => {
  it("lists types with or before the last one", async () => {
    expect(imageHint({ allowedTypes: ["image/png", "image/webp"], maxBytes: 5 * 1048576 })).toBe("PNG or WebP up to 5 MB");
    expect(imageHint({ allowedTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 15 * 1048576 })).toBe("JPG, PNG or WebP up to 15 MB");
    const issue = await imageFileIssue(new File([new Uint8Array([1])], "a.gif", { type: "image/gif" }), { allowedTypes: ["image/png", "image/webp"], maxBytes: 1024 });
    expect(issue).toContain("Use PNG or WebP.");
  });
  // The unit project has no DOM, so the field is checked at source level.
  it("AdminImageField shows an { error } result as the field message", () => {
    const source = readFileSync("components/admin/ui/AdminImageField.tsx", "utf8");
    expect(source).toContain("export type AdminImageUploadResult = boolean | { error: string }");
    expect(source).toMatch(/typeof saved === "object" && saved\.error\) setMessage\(saved\.error\)/);
    expect(source).toContain('else setMessage("The image could not be uploaded. Try again.")');
  });
});
