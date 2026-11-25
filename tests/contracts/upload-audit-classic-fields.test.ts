import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The unit project has no DOM, so each field is checked at source level: it must take its limits from
// lib/media-rules.ts, refuse what the server refuses before uploading, and show the server's reason.
const read = (path: string) => readFileSync(path, "utf8");

describe("About page shared picker (Club Logo graphics, feature photo)", () => {
  const page = read("app/admin/(protected)/about/page.tsx");

  it("sets the picker's accept per target kind and checks the file before uploading", () => {
    expect(page).toContain('return target.kind === "aboutFeature" ? "photo" : "graphic";');
    expect(page).toContain("fileRef.current.accept = mediaAccept(uploadKindFor(target))");
    expect(page).toContain("imageFileIssue(file, adminImageRules(uploadKindFor(target)))");
    expect(page).toContain("onChange={(event) => void handlePickedFile(event.target.files?.[0] ?? null)}");
    expect(page).not.toContain('accept="image/*"');
  });

  it("shows the refusal the same way as other upload errors, without starting an upload", () => {
    const handler = page.slice(page.indexOf("async function handlePickedFile"), page.indexOf("async function handleImageUpload"));
    expect(handler).toContain("setError(issue)");
    expect(handler.indexOf("setError(issue)")).toBeLessThan(handler.indexOf("return handleImageUpload(file)"));
  });
});

describe("homepage slideshow and artwork uploads", () => {
  const hook = read("lib/homepage-editor/useHomepageEditor.ts");

  it("check the file with the photo or graphic rules before uploading", () => {
    expect(hook).toContain('imageFileIssue(file, adminImageRules("photo"))');
    expect(hook).toContain('imageFileIssue(file, adminImageRules("graphic"))');
    expect(hook.indexOf('adminImageRules("photo")')).toBeLessThan(hook.indexOf('storage.from("homepage")'));
    expect(hook.indexOf('adminImageRules("graphic")')).toBeLessThan(hook.indexOf('storage.from("homepage-artwork")'));
  });

  it("show the server's readable message, keeping the generic line for a bare code or no message", () => {
    expect(hook).toContain('throw new Error(readableUploadError(result.error, "This photo could not be added. Your other changes are still here."))');
    expect(hook).toContain('throw new Error(readableUploadError(result.error, "This artwork could not be added. Try again."))');
  });

  it("artwork slots accept and describe graphics only", () => {
    const fields = read("components/admin/homepage/CinematicHomepageFields.tsx");
    expect(fields).toContain('accept={mediaAccept("graphic")}');
    expect(fields).toContain('mediaHint("graphic", { pixels: true })');
    expect(fields).not.toContain('accept="image/png,image/webp"');
  });
});

describe("other classic and Rose City upload fields", () => {
  it("league logos are checked for size and readability as graphics", () => {
    const source = read("components/admin/schedule/LeagueLogoUpload.tsx");
    expect(source).toContain('imageFileIssue(file, adminImageRules("graphic"))');
    expect(source).toContain("accept={GRAPHIC_UPLOAD_ACCEPT}");
    expect(source.indexOf("imageFileIssue(")).toBeLessThan(source.indexOf("setUploading(true)"));
  });

  it("partner logos take graphics only, with no JPEG promised", () => {
    const fields = read("components/admin/partners/PartnerFields.tsx");
    expect(fields).toContain("accept={GRAPHIC_UPLOAD_ACCEPT}");
    expect(fields).not.toMatch(/jpe?g/i);
    const editor = read("components/admin/partners/CinematicPartnersEditor.tsx");
    expect(editor).toContain('imageFileIssue(file, adminImageRules("graphic"))');
    expect(editor).not.toMatch(/PNG, JPEG/);
  });

  it("the injury photo band uses the photo rules because it uploads to news, and the logo the graphic rules", () => {
    const source = read("components/admin/injury-report/InjuryFields.tsx");
    expect(source).toContain('const BAND_RULES = adminImageRules("photo");');
    expect(source).toContain('const LOGO_RULES = adminImageRules("graphic");');
  });

  it("the news cover takes the photo accept and hint and is checked before it uploads", () => {
    const fields = read("components/admin/news/NewsArticleFields.tsx");
    expect(fields).toContain('accept={mediaAccept("photo")} hint={mediaHint("photo")}');
    const editor = read("components/admin/news/CinematicNewsEditor.tsx");
    expect(editor).toContain('imageFileIssue(file, adminImageRules("photo"))');
    expect(editor.indexOf('adminImageRules("photo")')).toBeLessThan(editor.indexOf('storage.from("news").upload'));
  });
});
