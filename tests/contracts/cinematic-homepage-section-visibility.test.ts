import { afterEach, describe, expect, it, vi } from "vitest";
import { homepageDraft, SAVE_OPERATION } from "../fixtures/homepage-editor";
import {
  CINEMATIC_ARTWORK_SLOTS, cinematicArtwork, cinematicHomepageContentSchema, cinematicHomepageEditableContent, cinematicHomepageSaveContent,
  cinematicHomepageSaveSchema, cinematicHomepageStorageRecord, defaultCinematicHomepageContent, fetchCinematicHomepageContent,
  isHomepageSectionShown, type CinematicHomepageContent,
} from "@/lib/cinematic-homepage-content";
import { buildHomepageSaveRequest } from "@/lib/homepage-editor/adapter";
import { resolveHomepageBindings, resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { cinematicHomepageSaveRequestSchema } from "@/lib/homepage-editor/contract";
import { createHomepageEditorState, getDirtyHomepageSections, getHomepageSaveBlocker, reduceHomepageEditor } from "@/lib/homepage-editor/model";
import { mergeCinematicHomepageRecovery, resolveHomepageRecovery } from "@/lib/homepage-editor/recovery";
import { hydrateHomepageSnapshot } from "@/lib/homepage-editor/server";

const renderer = { templateKey: "cinematic@2", slideshowVariant: "cinematic", heroVariant: "editable" } as const;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLUB_ID = uuid(1);
const SECTIONS = ["raffle", "match", "prices"] as const;
const stateWith = (revamp: CinematicHomepageContent) => createHomepageEditorState({
  content: { ...homepageDraft(), revamp }, revision: "1", designRevision: "design",
  editableSections: resolveHomepageCapabilities(renderer).editableSections, maxPhotos: 7,
});
const edit = (state: ReturnType<typeof stateWith>, change: (draft: CinematicHomepageContent) => void) => {
  const content = structuredClone(state.draft.revamp!);
  change(content);
  return reduceHomepageEditor(state, { type: "revamp-changed", content });
};
/** A client shaped like the Supabase query builder the loader uses: a table name picks the rows it returns. */
const clientFor = (row: unknown, assets: unknown[] = []) => {
  const chain = (result: unknown) => {
    const query: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "in"]) query[name] = () => query;
    query.maybeSingle = async () => ({ data: result, error: null });
    query.then = (resolve: (value: unknown) => void) => resolve({ data: result, error: null });
    return query;
  };
  return { from: (table: string) => chain(table === "media_assets" ? assets : row) } as never;
};
/** The database row the storage record would write, as the loader reads it back. */
const rowOf = (content: CinematicHomepageContent) => {
  const { content: json, presentation_config, ...columns } = cinematicHomepageStorageRecord(content);
  return { content: json, presentation_config, ...columns };
};

afterEach(() => vi.unstubAllEnvs());

describe("homepage raffle, next match and ticket prices show/hide", () => {
  it("shows a section unless it is explicitly false", () => {
    expect(isHomepageSectionShown({})).toBe(true);
    expect(isHomepageSectionShown({ visible: true })).toBe(true);
    expect(isHomepageSectionShown({ visible: false })).toBe(false);
  });

  it("parses old rows and payloads that have no visible key as shown", () => {
    const content = defaultCinematicHomepageContent();
    for (const key of SECTIONS) expect(content[key]).not.toHaveProperty("visible");
    const older = cinematicHomepageSaveSchema.parse(cinematicHomepageSaveContent(content));
    for (const key of SECTIONS) { expect(older[key]).not.toHaveProperty("visible"); expect(isHomepageSectionShown(older[key])).toBe(true); }
    const loaded = cinematicHomepageContentSchema.parse(content);
    for (const key of SECTIONS) expect(isHomepageSectionShown(loaded[key])).toBe(true);
  });

  it("accepts a boolean visible on the three sections only", () => {
    const input = cinematicHomepageSaveContent(defaultCinematicHomepageContent());
    for (const key of SECTIONS) {
      for (const visible of [true, false]) expect(cinematicHomepageSaveSchema.safeParse({ ...input, [key]: { ...input[key], visible } }).success).toBe(true);
      expect(cinematicHomepageSaveSchema.safeParse({ ...input, [key]: { ...input[key], visible: "no" } }).success).toBe(false);
    }
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, sponsors: { ...input.sponsors, visible: false } }).success).toBe(false);
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, championship: { ...input.championship, visible: false } }).success).toBe(false);
  });

  it("writes visible false only when hidden and never writes true, in every saved form", () => {
    for (const key of SECTIONS) {
      const shown = defaultCinematicHomepageContent();
      (shown[key] as { visible?: boolean }).visible = true;
      const hidden = defaultCinematicHomepageContent();
      (hidden[key] as { visible?: boolean }).visible = false;
      for (const form of [cinematicHomepageEditableContent, cinematicHomepageSaveContent]) {
        expect(form(shown)[key]).not.toHaveProperty("visible");
        expect(form(hidden)[key]).toHaveProperty("visible", false);
      }
      expect(cinematicHomepageStorageRecord(shown).content[key]).not.toHaveProperty("visible");
      expect(cinematicHomepageStorageRecord(hidden).content[key]).toHaveProperty("visible", false);
      // The only true in the stored JSON is the ticket's required boolean.
      expect(JSON.stringify(cinematicHomepageStorageRecord(shown).content).match(/"visible":true/g)).toHaveLength(1);
    }
    // The raffle keeps its text-only shape beside the flag, and the ticket's required boolean is untouched.
    const content = defaultCinematicHomepageContent();
    content.raffle = { assetId: uuid(5), url: "https://example.test/raffle.png", alt: "Raffle", visible: false };
    expect(cinematicHomepageStorageRecord(content).content.raffle).toEqual({ alt: "Raffle", visible: false });
    for (const visible of [true, false]) {
      const ticket = defaultCinematicHomepageContent(); ticket.ticket.visible = visible;
      expect(cinematicHomepageEditableContent(ticket).ticket).toEqual({ assetId: null, alt: "", visible });
      expect(cinematicHomepageStorageRecord(ticket).content.ticket).toEqual({ alt: "", visible });
    }
  });

  it("keeps a hidden section hidden through save, storage and load", async () => {
    const content = defaultCinematicHomepageContent();
    content.raffle.alt = "Raffle"; content.raffle.visible = false; content.match.visible = false; content.prices.visible = false;
    const loaded = await fetchCinematicHomepageContent(CLUB_ID, clientFor(rowOf(content)));
    for (const key of SECTIONS) expect(isHomepageSectionShown(loaded[key])).toBe(false);
    expect(loaded.raffle.alt).toBe("Raffle");
    // Hidden once, hidden again after the next save of the loaded content.
    expect(cinematicHomepageSaveContent(loaded).match.visible).toBe(false);
    const shown = await fetchCinematicHomepageContent(CLUB_ID, clientFor(rowOf(defaultCinematicHomepageContent())));
    for (const key of SECTIONS) expect(isHomepageSectionShown(shown[key])).toBe(true);
    expect(shown.raffle).not.toHaveProperty("visible");
  });

  it("loads a stored visible true as shown and saves it back without the key", async () => {
    const row = rowOf(defaultCinematicHomepageContent());
    (row.content.raffle as { visible?: boolean }).visible = true;
    (row.content.match as { visible?: boolean }).visible = true;
    const loaded = await fetchCinematicHomepageContent(CLUB_ID, clientFor(row));
    expect(isHomepageSectionShown(loaded.raffle)).toBe(true);
    expect(isHomepageSectionShown(loaded.match)).toBe(true);
    const saved = cinematicHomepageSaveContent(loaded);
    expect(saved.raffle).not.toHaveProperty("visible");
    expect(saved.match).not.toHaveProperty("visible");
  });

  it("keeps the flag when the editor hydrates a snapshot from the server", () => {
    const content = defaultCinematicHomepageContent();
    content.raffle = { assetId: uuid(7), url: null, alt: "Raffle", visible: false }; content.match.visible = false; content.prices.visible = false;
    const snapshot = hydrateHomepageSnapshot({ revision: "1", designRevision: "d", content: { ...homepageDraft(), revamp: content }, media: [] });
    for (const key of SECTIONS) expect(snapshot.content.revamp?.[key]).toHaveProperty("visible", false);
  });

  it("counts a switch as a change only while it differs, and sends false only while hidden", () => {
    const initial = stateWith(defaultCinematicHomepageContent());
    for (const key of SECTIONS) {
      const hidden = edit(initial, draft => { draft[key].visible = false; });
      expect(getDirtyHomepageSections(hidden)).toEqual(["revamp"]);
      const request = buildHomepageSaveRequest(hidden, renderer, SAVE_OPERATION);
      expect(request.sections.revamp?.[key]).toHaveProperty("visible", false);
      for (const other of SECTIONS.filter(name => name !== key)) expect(request.sections.revamp?.[other]).not.toHaveProperty("visible");
      // Turned back on: nothing to save, and a later edit goes out with no visible key at all.
      const restored = edit(hidden, draft => { draft[key].visible = true; });
      expect(getDirtyHomepageSections(restored)).toEqual([]);
      const other = edit(restored, draft => { draft.prices.heading = "Prices"; });
      for (const name of SECTIONS) expect(buildHomepageSaveRequest(other, renderer, SAVE_OPERATION).sections.revamp?.[name]).not.toHaveProperty("visible");
    }
  });

  it("restores a hidden section from a recovered draft and keeps newer words", () => {
    const baseline = defaultCinematicHomepageContent(); const recovered = structuredClone(baseline); const current = structuredClone(baseline);
    recovered.match.visible = false; recovered.raffle.visible = false;
    current.prices.heading = "New ticket prices";
    const merged = mergeCinematicHomepageRecovery(baseline, recovered, current);
    expect(merged.match.visible).toBe(false); expect(merged.raffle.visible).toBe(false);
    expect(merged.prices.heading).toBe("New ticket prices");
    expect(isHomepageSectionShown(merged.prices)).toBe(true);
    // A saved draft with hidden sections still passes the recovery record's own validation.
    const scope = { origin: "http://alpha.localhost:3000", userId: "owner", clubId: "alpha" };
    const bindings = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(renderer) });
    const design = { ...renderer, binding: { key: bindings.key, revision: bindings.revision } };
    const draft = { ...homepageDraft(), revamp: recovered };
    const record = { schemaVersion: 1, scope, savedAt: "2026-10-13T00:00:00Z", baseRevision: "1", designRevision: "design", baseline: { ...homepageDraft(), revamp: baseline }, draft, submitted: null };
    expect(resolveHomepageRecovery({ record, scope, serverRevision: "1", designRevision: "design", design, now: "2026-10-13T01:00:00Z" }).kind).toBe("restore");
  });

  it("sends the save request contract's hidden flag and accepts no other visible placement", () => {
    const content = defaultCinematicHomepageContent(); content.match.visible = false;
    const request = { operationId: SAVE_OPERATION, expectedRevision: "1", designRevision: "design", sections: { revamp: cinematicHomepageSaveContent(content) } };
    expect(cinematicHomepageSaveRequestSchema.safeParse(request).success).toBe(true);
    const stray = { ...request, sections: { revamp: { ...request.sections.revamp, sponsors: { heading: "x", visible: false } } } };
    expect(cinematicHomepageSaveRequestSchema.safeParse(stray).success).toBe(false);
  });
});

describe("homepage header sponsor logo save contract", () => {
  const header = (assetId: string | null, alt: string, url: string | null = assetId ? "https://example.test/header.png" : null) => ({ assetId, url, alt });
  const withHeader = (value: ReturnType<typeof header>) => { const content = defaultCinematicHomepageContent(); content.presentation.headerPartner = value; return content; };

  it("is an owner-editable artwork slot that edits the presentation header logo in place", () => {
    expect(CINEMATIC_ARTWORK_SLOTS).toContain("headerPartner");
    const content = defaultCinematicHomepageContent();
    expect(cinematicArtwork(content, "headerPartner")).toBe(content.presentation.headerPartner);
    for (const slot of CINEMATIC_ARTWORK_SLOTS) expect(cinematicArtwork(content, slot)).toBeTruthy();
    cinematicArtwork(content, "headerPartner").alt = "Foothill Transit";
    expect(content.presentation.headerPartner.alt).toBe("Foothill Transit");
  });

  it("always lists the header logo in the editor's change check, as asset and description only", () => {
    expect(cinematicHomepageEditableContent(defaultCinematicHomepageContent()).headerPartner).toEqual({ assetId: null, alt: "" });
    expect(cinematicHomepageEditableContent(withHeader(header(uuid(2), "Partner"))).headerPartner).toEqual({ assetId: uuid(2), alt: "Partner" });
  });

  it("leaves the header out of the payload without a baseline or when this save did not change it", () => {
    const content = withHeader(header(uuid(2), "Partner"));
    expect(cinematicHomepageSaveContent(content)).not.toHaveProperty("headerPartner");
    expect(cinematicHomepageSaveContent(content, content)).not.toHaveProperty("headerPartner");
    expect(cinematicHomepageSaveContent(content, structuredClone(content))).not.toHaveProperty("headerPartner");
    const empty = defaultCinematicHomepageContent();
    expect(cinematicHomepageSaveContent(empty, empty)).not.toHaveProperty("headerPartner");
    // The preview URL changing is not a change: only the asset and its description are saved.
    expect(cinematicHomepageSaveContent(content, withHeader(header(uuid(2), "Partner", "https://example.test/other.png")))).not.toHaveProperty("headerPartner");
  });

  it("sends the header when its asset or description changed, including when it was cleared", () => {
    const baseline = withHeader(header(uuid(2), "Partner"));
    expect(cinematicHomepageSaveContent(withHeader(header(uuid(3), "Partner")), baseline).headerPartner).toEqual({ assetId: uuid(3), alt: "Partner" });
    expect(cinematicHomepageSaveContent(withHeader(header(uuid(2), "Another partner")), baseline).headerPartner).toEqual({ assetId: uuid(2), alt: "Another partner" });
    expect(cinematicHomepageSaveContent(withHeader(header(null, "")), baseline).headerPartner).toEqual({ assetId: null, alt: "" });
    expect(cinematicHomepageSaveContent(withHeader(header(uuid(4), "New")), defaultCinematicHomepageContent()).headerPartner).toEqual({ assetId: uuid(4), alt: "New" });
  });

  it("accepts the header only as an asset id and a description", () => {
    const input = cinematicHomepageSaveContent(defaultCinematicHomepageContent());
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, headerPartner: { assetId: null, alt: "" } }).success).toBe(true);
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, headerPartner: { assetId: uuid(2), alt: "Partner" } }).success).toBe(true);
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, headerPartner: { assetId: uuid(2), alt: "Partner", url: "https://example.test/x.png" } }).success).toBe(false);
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, headerPartner: { assetId: "not-a-uuid", alt: "" } }).success).toBe(false);
    expect(cinematicHomepageSaveSchema.safeParse({ ...input, headerPartner: { assetId: null, alt: "x".repeat(1001) } }).success).toBe(false);
    expect(cinematicHomepageSaveSchema.safeParse(input).success).toBe(true);
    // Loaded content keeps the logo inside presentation, so a top-level one is not content.
    const loaded = defaultCinematicHomepageContent();
    expect(cinematicHomepageContentSchema.safeParse({ ...loaded, headerPartner: { assetId: null, alt: "" } }).success).toBe(false);
  });

  it("stores the header in its column and description only, never in the content JSON", () => {
    const stored = cinematicHomepageStorageRecord(withHeader(header(uuid(2), "Partner")));
    expect(stored.header_partner_media_asset_id).toBe(uuid(2));
    expect(stored.presentation_config.artworkAlt).toMatchObject({ headerPartner: "Partner" });
    expect(stored.content).not.toHaveProperty("headerPartner");
    expect(stored.content).not.toHaveProperty("presentation");
    expect(JSON.stringify(stored.content)).not.toContain("Partner");
  });

  it("round-trips the header through its column and description when the content is loaded", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
    const asset = { id: uuid(2), storage_bucket: "onzio-media", storage_path: "tenant/homepage/header.webp", width: 400, height: 80 };
    const loaded = await fetchCinematicHomepageContent(CLUB_ID, clientFor(rowOf(withHeader(header(uuid(2), "Partner"))), [asset]));
    expect(loaded.presentation.headerPartner).toMatchObject({ assetId: uuid(2), alt: "Partner" });
    expect(loaded.presentation.headerPartner.url).toContain("/onzio-media/tenant/homepage/header.webp");
    const none = await fetchCinematicHomepageContent(CLUB_ID, clientFor(rowOf(defaultCinematicHomepageContent())));
    expect(none.presentation.headerPartner).toMatchObject({ assetId: null, url: null, alt: "" });
  });

  it("hydrates the header only from tenant transaction media", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
    const content = withHeader(header(uuid(2), "Partner", "https://foreign.test/forged"));
    const media = [{ id: uuid(2), storage_bucket: "onzio-media", storage_path: "tenant/homepage/header.webp" }];
    expect(hydrateHomepageSnapshot({ revision: "1", designRevision: "d", content: { ...homepageDraft(), revamp: content }, media }).content.revamp?.presentation.headerPartner.url).toContain("/onzio-media/tenant/homepage/header.webp");
    expect(hydrateHomepageSnapshot({ revision: "1", designRevision: "d", content: { ...homepageDraft(), revamp: content }, media: [] }).content.revamp?.presentation.headerPartner.url).toBeNull();
  });

  it("marks the revamp section changed for a header edit, and blocks Save while the upload runs", () => {
    const initial = stateWith(withHeader(header(uuid(2), "Partner")));
    const replaced = edit(initial, draft => { draft.presentation.headerPartner = header(uuid(3), "Partner"); });
    expect(getDirtyHomepageSections(replaced)).toEqual(["revamp"]);
    expect(getDirtyHomepageSections(edit(initial, draft => { draft.presentation.headerPartner.alt = "Partner team"; }))).toEqual(["revamp"]);
    expect(getDirtyHomepageSections(edit(initial, draft => { draft.presentation.headerPartner.url = "https://example.test/preview.png"; }))).toEqual([]);
    const uploading = edit(initial, draft => { draft.presentation.headerPartner.upload = "uploading"; });
    expect(getHomepageSaveBlocker(uploading)).toBe("ARTWORK_NOT_READY");
    expect(getHomepageSaveBlocker(edit(uploading, draft => { draft.presentation.headerPartner.upload = "ready"; draft.presentation.headerPartner.alt = "Done"; }))).toBeNull();
  });

  it("builds the revamp payload with the header only when this save changed it, and keeps it on retry", () => {
    const initial = stateWith(withHeader(header(uuid(2), "Partner")));
    // A save that touches something else leaves the header key out, so the server leaves the logo as it is.
    const unrelated = edit(initial, draft => { draft.ticket.visible = false; });
    expect(buildHomepageSaveRequest(unrelated, renderer, SAVE_OPERATION).sections.revamp).not.toHaveProperty("headerPartner");
    const replaced = edit(initial, draft => { draft.presentation.headerPartner = header(uuid(3), "Partner"); });
    const request = buildHomepageSaveRequest(replaced, renderer, SAVE_OPERATION);
    expect(request.sections.revamp?.headerPartner).toEqual({ assetId: uuid(3), alt: "Partner" });
    expect(request.sections.revamp).not.toHaveProperty("presentation");
    const removed = edit(initial, draft => { Object.assign(draft.presentation.headerPartner, { assetId: null, url: null, alt: "" }); });
    expect(buildHomepageSaveRequest(removed, renderer, SAVE_OPERATION).sections.revamp?.headerPartner).toEqual({ assetId: null, alt: "" });
    // Retrying an unconfirmed save rebuilds the same payload from the submitted snapshot and the same baseline.
    const failed = reduceHomepageEditor(reduceHomepageEditor(replaced, { type: "save-started", operationId: SAVE_OPERATION }), { type: "save-failed", code: "NETWORK_ERROR", message: "Retry" });
    expect(buildHomepageSaveRequest(failed, renderer, "11111111-1111-4111-8111-111111111111")).toEqual(request);
  });

  it("restores a header edit from a recovered draft but never an untouched one over the server's", () => {
    const baseline = withHeader(header(uuid(2), "Partner")); const current = structuredClone(baseline);
    const edited = structuredClone(baseline); edited.presentation.headerPartner = header(uuid(3), "New partner");
    expect(mergeCinematicHomepageRecovery(baseline, edited, current).presentation.headerPartner).toMatchObject({ assetId: uuid(3), alt: "New partner" });
    // Someone else changed the header after this draft began, and the draft did not touch it: the server's stays.
    const newer = withHeader(header(uuid(9), "Newer partner")); const untouched = structuredClone(baseline); untouched.navigation.labels.home = "Club home";
    expect(mergeCinematicHomepageRecovery(baseline, untouched, newer).presentation.headerPartner).toMatchObject({ assetId: uuid(9), alt: "Newer partner" });
    // Other operator-owned inputs still come from the server.
    edited.presentation.heroVideoGuid = "untrusted"; current.presentation.heroVideoGuid = "current-video";
    expect(mergeCinematicHomepageRecovery(baseline, edited, current).presentation.heroVideoGuid).toBe("current-video");
  });
});
