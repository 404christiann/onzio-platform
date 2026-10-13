import { afterEach, describe, expect, it, vi } from "vitest";
import { homepageDraft, SAVE_OPERATION } from "../fixtures/homepage-editor";
import { defaultCinematicHomepageContent, cinematicHomepageSaveContent, cinematicHomepageSaveSchema, cinematicHomepageStorageRecord } from "@/lib/cinematic-homepage-content";
import { cinematicHomepageSaveRequestSchema, homepageSaveRequestSchema } from "@/lib/homepage-editor/contract";
import { resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { createHomepageEditorState, getDirtyHomepageSections, getHomepageSaveBlocker, reduceHomepageEditor } from "@/lib/homepage-editor/model";
import { buildHomepageSaveRequest } from "@/lib/homepage-editor/adapter";
import { hydrateHomepageSnapshot } from "@/lib/homepage-editor/server";
import { mergeCinematicHomepageRecovery, resolveHomepageRecovery } from "@/lib/homepage-editor/recovery";

const renderer = { templateKey: "cinematic@2", slideshowVariant: "cinematic", heroVariant: "editable" } as const;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const photos = Array.from({ length: 7 }, (_, i) => ({ clientId: `photo-${i}`, rowId: null, assetId: uuid(i), alt: `Photo ${i}`, order: i }));
const state = () => createHomepageEditorState({ content: { ...homepageDraft(), revamp: defaultCinematicHomepageContent() }, revision: "1", designRevision: "design", editableSections: resolveHomepageCapabilities(renderer).editableSections, maxPhotos: 7 });

afterEach(() => vi.unstubAllEnvs());
describe("cinematic@2 homepage editor", () => {
  it("allows seven ordered photos only through the cinematic contract and capabilities", () => {
    const request = { operationId: SAVE_OPERATION, expectedRevision: "1", designRevision: "design", sections: { photos: { items: photos } } };
    expect(cinematicHomepageSaveRequestSchema.safeParse(request).success).toBe(true);
    expect(homepageSaveRequestSchema.safeParse(request).success).toBe(false);
    expect(resolveHomepageCapabilities(renderer).maxPhotos).toBe(7);
    expect(resolveHomepageCapabilities({ templateKey: "cinematic@1", slideshowVariant: "legacy" }).maxPhotos).toBe(6);
    expect(resolveHomepageCapabilities({ templateKey: "editorial@1", slideshowVariant: "editorial" }).editableSections).not.toContain("revamp");
  });
  it("saves navigation and ticket visibility but never sends readonly presentation or preview URLs", () => {
    const content = defaultCinematicHomepageContent();
    content.ticket.visible = false; content.navigation.labels["stadium-group"] = "Robinson Stadium";
    content.raffle.url = "https://foreign.test/forged.png";
    content.presentation.heroVideoGuid = "readonly";
    const edited = reduceHomepageEditor(state(), { type: "revamp-changed", content });
    expect(getDirtyHomepageSections(edited)).toEqual(["revamp"]);
    const request = buildHomepageSaveRequest(edited, renderer, SAVE_OPERATION);
    expect(request.sections.revamp?.ticket.visible).toBe(false);
    expect(request.sections.revamp?.navigation.labels["stadium-group"]).toBe("Robinson Stadium");
    expect(request.sections.revamp).not.toHaveProperty("presentation");
    expect(request.sections.revamp?.raffle).not.toHaveProperty("url");
    expect(cinematicHomepageSaveSchema.safeParse({ ...request.sections.revamp, presentation: content.presentation }).success).toBe(false);
  });
  it("rejects unknown navigation IDs, external ticket destinations and repeated ticket row IDs", () => {
    const input = cinematicHomepageSaveContent(defaultCinematicHomepageContent());
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, navigation: { labels: { injected: "Injected" } } }).success).toBe(false);
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, match: { ...input.match, buttonHref: "https://foreign.test" } }).success).toBe(false);
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, match: { ...input.match, buttonHref: "//foreign.test/tickets" } }).success).toBe(false);
    const row = { id: "duplicate", label: "Seat", price: "$5", description: "", note: "", accent: "none" };
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, prices: { ...input.prices, rows: [row, row] } }).success).toBe(false);
  });
  it("clones artwork edits and blocks save until replacement media is ready", () => {
    const initial = state(); const content = structuredClone(initial.draft.revamp!);
    content.ticket.upload = "uploading";
    const uploading = reduceHomepageEditor(initial, { type: "revamp-changed", content });
    expect(initial.draft.revamp?.ticket.upload).toBeUndefined();
    expect(getHomepageSaveBlocker(uploading)).toBe("ARTWORK_NOT_READY");
    content.ticket.upload = "ready"; content.ticket.assetId = uuid(33);
    const ready = reduceHomepageEditor(uploading, { type: "revamp-changed", content });
    const submitted = reduceHomepageEditor(ready, { type: "save-started", operationId: SAVE_OPERATION });
    const changed = { ...content, ticket: { ...content.ticket, visible: false } };
    expect(reduceHomepageEditor(submitted, { type: "revamp-changed", content: changed })).toBe(submitted);
  });
  it("stores seven media identities in FK columns while JSON contains only text", () => {
    const content = defaultCinematicHomepageContent(); content.raffle.assetId = uuid(1); content.presentation.headerPartner.assetId = uuid(2);
    const stored = cinematicHomepageStorageRecord(content);
    expect(stored.raffle_media_asset_id).toBe(uuid(1)); expect(stored.header_partner_media_asset_id).toBe(uuid(2));
    expect(stored.content.raffle).not.toHaveProperty("assetId");
    expect(stored.content).not.toHaveProperty("presentation");
  });
  it("hydrates artwork only from tenant transaction media, and removes untrusted URLs", () => {
    const content = defaultCinematicHomepageContent(); content.raffle.assetId = uuid(1); content.raffle.url = "https://foreign.test/forged";
    content.ticket.assetId = uuid(2); content.ticket.url = "https://foreign.test/other";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
    const snapshot = hydrateHomepageSnapshot({ revision: "1", designRevision: "d", content: { ...homepageDraft(), revamp: content }, media: [{ id: uuid(1), storage_bucket: "onzio-media", storage_path: "tenant/homepage/raffle.webp" }] });
    expect(snapshot.content.revamp?.raffle.url).toContain("/onzio-media/tenant/homepage/raffle.webp");
    expect(snapshot.content.revamp?.ticket.url).toBeNull();
  });
  it("restores navigation-only edits without replacing newer prices or presentation inputs", () => {
    const baseline = defaultCinematicHomepageContent(); const recovered = structuredClone(baseline); const current = structuredClone(baseline);
    recovered.navigation.labels["stadium-group"] = "Robinson Stadium";
    recovered.presentation.heroVideoGuid = "untrusted-recovered-source";
    current.prices.heading = "New ticket prices"; current.match.buttonLabel = "Reserve seats";
    current.navigation.labels.contact = "Get in touch";
    current.presentation.heroVideoGuid = "current-video";
    const merged = mergeCinematicHomepageRecovery(baseline, recovered, current);
    expect(merged.navigation.labels).toEqual({ "stadium-group": "Robinson Stadium", contact: "Get in touch" });
    expect(merged.prices.heading).toBe("New ticket prices"); expect(merged.match.buttonLabel).toBe("Reserve seats");
    expect(merged.presentation.heroVideoGuid).toBe("current-video");
  });
  it("recovers the new optional content without invalidating old saved drafts", () => {
    const scope = { origin: "http://alpha.localhost:3000", userId: "owner", clubId: "alpha" };
    for (const content of [homepageDraft(), state().draft]) {
      const record = { schemaVersion: 1, scope, savedAt: "2026-10-13T00:00:00Z", baseRevision: "1", designRevision: "design", baseline: content, draft: content, submitted: null };
      expect(resolveHomepageRecovery({ record, scope, serverRevision: "1", designRevision: "design", now: "2026-10-13T01:00:00Z" }).kind).toBe("restore");
    }
  });
});
