import { afterEach, describe, expect, it, vi } from "vitest";
import { homepageDraft } from "../fixtures/homepage-editor";
import { CINEMATIC_ARTWORK_SLOTS, cinematicArtwork, cinematicHomepageSaveContent, cinematicHomepageSaveSchema, cinematicHomepageStorageRecord, defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { createHomepageEditorState, getHomepageSaveBlocker, reduceHomepageEditor } from "@/lib/homepage-editor/model";
import { hydrateHomepageSnapshot } from "@/lib/homepage-editor/server";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const renderer = { templateKey: "cinematic@2", slideshowVariant: "cinematic", heroVariant: "editable" } as const;

afterEach(() => vi.unstubAllEnvs());
describe("cinematic@2 footer logo slot", () => {
  it("is an owner-editable artwork slot that saves only its asset and alt text", () => {
    expect(CINEMATIC_ARTWORK_SLOTS).toContain("footerLogo");
    const content = defaultCinematicHomepageContent();
    expect(content.footerLogo).toEqual({ assetId: null, url: null, alt: "" });
    content.footerLogo = { assetId: uuid(9), url: "https://example.test/logo.webp", alt: "RCFC" };
    expect(cinematicArtwork(content, "footerLogo").alt).toBe("RCFC");
    expect(cinematicHomepageSaveContent(content).footerLogo).toEqual({ assetId: uuid(9), alt: "RCFC" });
  });
  it("accepts older saves that predate the footer logo as having none", () => {
    const { footerLogo: _omitted, ...older } = cinematicHomepageSaveContent(defaultCinematicHomepageContent());
    expect(cinematicHomepageSaveSchema.parse(older).footerLogo).toEqual({ assetId: null, alt: "" });
  });
  it("stores the footer logo identity in its own FK column, never in JSON", () => {
    const content = defaultCinematicHomepageContent(); content.footerLogo.assetId = uuid(9); content.footerLogo.alt = "RCFC";
    const stored = cinematicHomepageStorageRecord(content);
    expect(stored.footer_logo_media_asset_id).toBe(uuid(9));
    expect(stored.content.footerLogo).toEqual({ alt: "RCFC" });
  });
  it("hydrates the logo only from tenant transaction media and tolerates older snapshots", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
    const content = defaultCinematicHomepageContent(); content.footerLogo = { assetId: uuid(9), url: "https://foreign.test/forged", alt: "RCFC" };
    const media = [{ id: uuid(9), storage_bucket: "onzio-media", storage_path: "tenant/homepage/footer.webp" }];
    expect(hydrateHomepageSnapshot({ revision: "1", designRevision: "d", content: { ...homepageDraft(), revamp: content }, media }).content.revamp?.footerLogo.url).toContain("/onzio-media/tenant/homepage/footer.webp");
    expect(hydrateHomepageSnapshot({ revision: "1", designRevision: "d", content: { ...homepageDraft(), revamp: content }, media: [] }).content.revamp?.footerLogo.url).toBeNull();
    const older = defaultCinematicHomepageContent() as Partial<ReturnType<typeof defaultCinematicHomepageContent>>;
    delete older.footerLogo;
    expect(hydrateHomepageSnapshot({ revision: "1", designRevision: "d", content: { ...homepageDraft(), revamp: older as ReturnType<typeof defaultCinematicHomepageContent> }, media: [] }).content.revamp?.footerLogo).toEqual({ assetId: null, url: null, alt: "" });
  });
  it("blocks saving while a new footer logo is still uploading", () => {
    const initial = createHomepageEditorState({ content: { ...homepageDraft(), revamp: defaultCinematicHomepageContent() }, revision: "1", designRevision: "design", editableSections: resolveHomepageCapabilities(renderer).editableSections, maxPhotos: 7 });
    const content = structuredClone(initial.draft.revamp!); content.footerLogo.upload = "uploading";
    expect(getHomepageSaveBlocker(reduceHomepageEditor(initial, { type: "revamp-changed", content }))).toBe("ARTWORK_NOT_READY");
  });
});
