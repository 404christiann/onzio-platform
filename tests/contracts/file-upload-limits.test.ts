import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileUploadIssue, matchesAccept } from "@/components/admin/ui/fileUploadIssue";
import { fileUploadRules } from "@/components/admin/ui/adminImageFiles";
import { MEDIA_RULES, mediaHint } from "@/lib/media-rules";

const created = vi.hoisted(() => ({ clients: 0, uploads: 0 }));
vi.mock("@/lib/admin-client", () => ({
  createClient: () => {
    created.clients += 1;
    return {
      storage: {
        from: () => ({
          upload: async () => { created.uploads += 1; return { error: null }; },
          getPublicUrl: () => ({ data: { publicUrl: "https://example.test/logo.png" } }),
        }),
      },
    };
  },
}));
const { sponsorLogoFileIssue, uploadSponsorLogo } = await import("@/lib/sponsor-storage");

const file = (name: string, type: string, size: number) => ({ name, type, size });
const PNG_WEBP = "image/png,image/webp";

describe("FileUpload refuses a file over maxBytes before onUpload", () => {
  it("names the file and the limit", () => {
    const limit = MEDIA_RULES.graphic.maxBytes;
    expect(fileUploadIssue(file("map.png", "image/png", limit + 1), { accept: PNG_WEBP, maxBytes: limit }))
      .toBe("“map.png” is too large. The limit is 5 MB.");
  });

  it("allows a file exactly at the limit and anything when no limit is set", () => {
    const limit = MEDIA_RULES.photo.maxBytes;
    expect(fileUploadIssue(file("a.jpg", "image/jpeg", limit), { accept: "image/jpeg", maxBytes: limit })).toBeNull();
    expect(fileUploadIssue(file("huge.png", "image/png", limit * 10), { accept: PNG_WEBP })).toBeNull();
  });

  it("reports a wrong type before a size problem, naming the file and only the accepted types", () => {
    expect(fileUploadIssue(file("crest.jpg", "image/jpeg", 10 * 1024 * 1024), { accept: PNG_WEBP, maxBytes: 1024 }))
      .toBe("“crest.jpg” is not a supported file. Use PNG or WebP.");
    // A field hint that also states the size ("PNG or WebP up to 5 MB") is not repeated after "Use".
    expect(fileUploadIssue(file("crest.jpg", "image/jpeg", 10), { accept: PNG_WEBP, hint: mediaHint("graphic") }))
      .toBe("“crest.jpg” is not a supported file. Use PNG or WebP.");
    expect(fileUploadIssue(file("notes.txt", "text/plain", 10), { accept: ".csv" }))
      .toBe("“notes.txt” is not a supported file. Use CSV.");
  });

  it("reads the limit in whole and fractional megabytes", () => {
    expect(fileUploadIssue(file("a.png", "image/png", 1.5 * 1024 * 1024 + 1), { accept: PNG_WEBP, maxBytes: 1.5 * 1024 * 1024 }))
      .toBe("“a.png” is too large. The limit is 1.5 MB.");
  });

  it("still matches by type, wildcard and extension", () => {
    expect(matchesAccept(file("a.png", "image/png", 1), PNG_WEBP)).toBe(true);
    expect(matchesAccept(file("a.gif", "image/gif", 1), PNG_WEBP)).toBe(false);
    expect(matchesAccept(file("a.gif", "image/gif", 1), "image/*")).toBe(true);
    expect(matchesAccept(file("a.PNG", "", 1), ".png")).toBe(true);
    expect(matchesAccept(file("a.gif", "image/gif", 1))).toBe(true);
  });

  it("fileUploadRules hands a field the picker types, the byte limit and the hint of its media kind", () => {
    expect(fileUploadRules("photo")).toEqual({ accept: "image/jpeg,image/png,image/webp", maxBytes: MEDIA_RULES.photo.maxBytes, hint: "JPG, PNG or WebP up to 15 MB" });
    expect(fileUploadRules("graphic", { pixels: true })).toEqual({ accept: "image/png,image/webp", maxBytes: MEDIA_RULES.graphic.maxBytes, hint: "PNG or WebP up to 5 MB, at most 6000 pixels on each side" });
  });

  // The unit project has no DOM, so the component is checked at source level.
  it("FileUpload runs the check on every picked or dropped file and shows the message", () => {
    const source = readFileSync("components/admin/FileUpload.tsx", "utf8");
    expect(source).toContain("maxBytes?: number;");
    expect(source).toContain("fileUploadIssue(entry, { accept, maxBytes, hint: hintText })");
    expect(source).toMatch(/\{rejection && \([\s\S]*data-slot="file-upload-error"[\s\S]*\{rejection\}/);
    // The check sits before onUpload in handleFiles.
    expect(source.indexOf("fileUploadIssue(entry")).toBeLessThan(source.indexOf("onUpload(files);"));
  });

  it("every FileUpload that uploads an image on a classic or Rose City page passes the byte limit", () => {
    const files = [
      "app/admin/(protected)/roster/page.tsx",
      "components/admin/roster/rose-city/RosterActionPhotos.tsx",
      "components/admin/shop/CinematicShopFields.tsx",
      "components/admin/shop/rose-city/RoseCityShopFields.tsx",
      "components/admin/sponsors/ClassicSponsorsPage.tsx",
      "components/admin/sponsors/rose-city/RoseCitySponsorFields.tsx",
    ];
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      const opens = [...text.matchAll(/<FileUpload\b/g)].map((match) => match.index!);
      expect(opens.length, path).toBeGreaterThan(0);
      const withLimit = opens.filter((start) => /maxBytes=|fileUploadRules\(/.test(text.slice(start, text.indexOf("/>", start))));
      // The roster page also has a reimagined-only player photo field that keeps its old behavior.
      const exempt = path === "app/admin/(protected)/roster/page.tsx" ? 1 : 0;
      expect(withLimit.length, path).toBe(opens.length - exempt);
    }
  });
});

describe("sponsor logos are checked before they upload", () => {
  beforeEach(() => { created.clients = 0; created.uploads = 0; });
  afterEach(() => vi.restoreAllMocks());

  it("refuses a logo over the graphic limit with a plain message and never reaches the media chain", async () => {
    const tooBig = new File([new Uint8Array(MEDIA_RULES.graphic.maxBytes + 1)], "sponsor.png", { type: "image/png" });
    await expect(uploadSponsorLogo(tooBig, "home")).rejects.toThrow("sponsor.png is too large. Sponsor logos must be 5 MB or smaller.");
    expect(created).toEqual({ clients: 0, uploads: 0 });
  });

  it("still refuses a JPG, and accepts a logo exactly at the limit", async () => {
    await expect(uploadSponsorLogo(new File([new Uint8Array(10)], "sponsor.jpg", { type: "image/jpeg" }), "home"))
      .rejects.toThrow("sponsor.jpg is not a PNG or WebP image. Sponsor logos must be PNG or WebP.");
    expect(created.uploads).toBe(0);
    const atLimit = new File([new Uint8Array(MEDIA_RULES.graphic.maxBytes)], "sponsor.webp", { type: "image/webp" });
    await expect(uploadSponsorLogo(atLimit, "home")).resolves.toBe("https://example.test/logo.png");
    expect(created.uploads).toBe(1);
  });

  it("sponsorLogoFileIssue reports the same messages without uploading", () => {
    expect(sponsorLogoFileIssue(file("a.png", "image/png", MEDIA_RULES.graphic.maxBytes + 1))).toBe("a.png is too large. Sponsor logos must be 5 MB or smaller.");
    expect(sponsorLogoFileIssue(file("a.png", "image/png", 100))).toBeNull();
  });
});
