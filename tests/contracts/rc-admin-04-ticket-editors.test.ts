import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TICKET_ARTWORK_SLOTS, TICKET_VISIBILITY_KEYS, emptyTicketsContent, hydrateTicketsContent, ticketsContentSchema, ticketsSaveSchema, type TicketsContent,
} from "@/lib/tickets-content";
import {
  hydrateTicketPage, knowBeforeYouGoSchema, seasonMembershipSchema, ticketPageSaveSchema,
  type KnowBeforeYouGoContent, type SeasonMembershipContent, type TicketPageContent, type TicketPageKey,
} from "@/lib/cinematic-ticket-pages-content";
import { addListItem, removeListItem, setTicketPageImage, unusedTicketPageUploads } from "@/lib/cinematic-ticket-pages-editor";
import { knowBeforeYouGoReferenceContent, seasonMembershipReferenceContent } from "@/lib/ticket-pages-reference-content";
import {
  TICKETS_SECTIONS, TICKETS_SECTION_IMAGES, buildTicketsSaveInput, changedTicketsSections, editorPageState, setTicketsFlag, ticketsSectionOnly, ticketsSectionShown,
  ticketsSectionSlice, ticketsSectionSummary,
} from "@/components/admin/tickets/tickets-sections";
import {
  KBYG_SPEC, SEASON_SPEC, buildTicketPageSaveInput, changedTicketPageSections, seasonImageSlots, kbygImageSlots, setTicketPageShown, ticketPageSectionShown, ticketPageSectionSlice,
} from "@/components/admin/ticket-pages/ticket-page-sections";

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "tenant", name: "Rose City FC" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: null }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: vi.fn(), fetchSiteSocialLinks: vi.fn() }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn() }));
import CinematicTickets from "@/components/cinematic/CinematicTickets";
import CinematicSeasonMembership from "@/components/cinematic/CinematicSeasonMembership";
import { KnowBeforeYouGoView } from "@/components/cinematic/CinematicKnowBeforeYouGo";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test"));
afterEach(() => vi.unstubAllEnvs());

const OP = "6b0e6f1c-5d0a-4a0b-9d6e-0c7f1b0b7a11";
const snapshot = { revision: "7", designRevision: "design-1" };
const rose = () => JSON.parse(readFileSync("assets/rose-city-tickets-2027/copy.json", "utf8")) as TicketsContent;
const season = () => structuredClone(seasonMembershipReferenceContent) as SeasonMembershipContent;
const kbyg = () => structuredClone(knowBeforeYouGoReferenceContent) as KnowBeforeYouGoContent;
const bytes = (schema: { parse: (value: unknown) => unknown }, value: unknown) => JSON.stringify(schema.parse(value));

/** The Tickets save expression exactly as TicketsEditor built it before RC-ADMIN-04, kept here as the reference. */
const legacyTickets = (pending: unknown, draft: TicketsContent, retired: string[]) =>
  pending ?? { operationId: OP, expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: retired };
/** The ticket-pages save expression as TicketPageEditor built it before RC-ADMIN-04. */
const legacyPage = <K extends TicketPageKey>(pending: unknown, draft: TicketPageContent<K>, uploads: string[]) =>
  pending ?? { operationId: OP, expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: unusedTicketPageUploads(uploads, draft) };

describe("Tickets cards", () => {
  it("lists the cards in page order, each tied to its own existing flag, and the page card is always shown", () => {
    expect(TICKETS_SECTIONS.map(section => section.id)).toEqual(["page", "perks", "includes", "transit", "directions"]);
    const flags = TICKETS_SECTIONS.flatMap(section => section.flag ? [section.flag] : []);
    expect([...flags].sort()).toEqual(TICKET_VISIBILITY_KEYS.filter(key => key !== "purchaseVisible").sort());
    expect(ticketsSectionShown(rose(), "page")).toBeNull();
  });
  it("gives every artwork slot to exactly one card", () => {
    const slots = Object.values(TICKETS_SECTION_IMAGES).flat();
    expect([...slots].sort()).toEqual([...TICKET_ARTWORK_SLOTS].sort());
  });
  it("treats an absent flag as shown and only an explicit false as hidden", () => {
    const content = rose();
    for (const section of TICKETS_SECTIONS.filter(item => item.flag)) {
      expect(ticketsSectionShown(content, section.id)).toBe(true);
      expect(ticketsSectionShown({ ...content, [section.flag!]: false }, section.id)).toBe(false);
    }
  });
  it("marks only the cards whose fields, flag or pictures changed", () => {
    const saved = rose(), draft = structuredClone(saved);
    expect(changedTicketsSections(draft, saved)).toEqual([]);
    draft.perkLabels[1] = "Changed";
    draft.directionsVisible = false;
    draft.artwork.map.alt = "A map";
    expect(changedTicketsSections(draft, saved)).toEqual(["perks", "transit", "directions"]);
    expect(ticketsSectionSlice(draft, "includes")).toBe(ticketsSectionSlice(saved, "includes"));
  });
  it("renders the real Tickets page with just one card's part, and never touches the draft", () => {
    const draft = rose(), copy = structuredClone(draft);
    const html = (id: (typeof TICKETS_SECTIONS)[number]["id"]) => renderToStaticMarkup(createElement(CinematicTickets, { content: hydrateTicketsContent(ticketsSectionOnly(draft, id), [], false) }));
    expect(html("perks")).toContain("perks-title");
    expect(html("perks")).not.toContain("tickets-includes");
    expect(html("perks")).not.toContain("transit-title");
    expect(html("includes")).toContain("tickets-includes");
    expect(html("includes")).not.toContain("perks-title");
    expect(html("transit")).toContain("transit-title");
    expect(html("transit")).not.toContain("tickets-directions");
    expect(html("directions")).toContain("tickets-directions");
    expect(html("page")).toContain("tickets-buy");
    expect(html("page")).not.toContain("perks-title");
    expect(draft).toEqual(copy);
    expect(ticketsContentSchema.safeParse(ticketsSectionOnly(draft, "perks")).success).toBe(true);
  });
  it("shows the purchase flag's effect on the Buy button only, with the hero and match kept", () => {
    const hidden = renderToStaticMarkup(createElement(CinematicTickets, { content: hydrateTicketsContent({ ...rose(), purchaseVisible: false }, [], false) }));
    expect(hidden).not.toContain("tickets-buy");
    expect(hidden).toContain('id="tickets-title"');
  });
  it("summarises each card from the draft", () => {
    expect(ticketsSectionSummary({ ...rose(), purchaseUrl: "" }, "page")).toContain("No purchase link yet");
    expect(ticketsSectionSummary({ ...rose(), purchaseUrl: "https://t.example.com/x" }, "page")).toBe("Purchase link set");
    expect(ticketsSectionSummary(emptyTicketsContent(), "includes")).toBe("0 benefits");
  });
});

describe("Tickets save request is unchanged", () => {
  const build = (pending: null | ReturnType<typeof ticketsSaveSchema.parse>, draft: TicketsContent, retired: string[]) => buildTicketsSaveInput({ pending, operationId: OP, snapshot, draft, retired });
  it("an untouched load then save sends a byte-identical request with no new keys", () => {
    const loaded = rose(), draft = structuredClone(loaded);
    expect(bytes(ticketsSaveSchema, build(null, draft, []))).toBe(bytes(ticketsSaveSchema, legacyTickets(null, draft, [])));
    const sent = JSON.parse(bytes(ticketsSaveSchema, build(null, draft, [])));
    expect(Object.keys(sent.content)).toEqual(Object.keys(ticketsContentSchema.parse(loaded)));
    for (const key of TICKET_VISIBILITY_KEYS) expect(key in sent.content).toBe(false);
    expect(sent.content).toEqual(loaded);
  });
  it("matches the previous builder for representative edits", () => {
    const retired = [randomUUID()];
    const edits: Array<[string, (content: TicketsContent) => TicketsContent]> = [
      ["text", content => ({ ...content, title: "New" })],
      ["perk label", content => ({ ...content, perkLabels: [content.perkLabels[0], "Edited", content.perkLabels[2]] })],
      ["benefit", content => ({ ...content, benefits: [...content.benefits, { title: "T", detail: "D" }] })],
      ["purchase url", content => ({ ...content, purchaseUrl: "https://tickets.example.com/match" })],
      ["banner height", content => ({ ...content, bannerHeightFraction: 0.8 })],
      ["image alt", content => ({ ...content, artwork: { ...content.artwork, seat: { ...content.artwork.seat, alt: "Seat" } } })],
    ];
    for (const [name, edit] of edits) {
      const draft = edit(rose());
      expect(bytes(ticketsSaveSchema, build(null, draft, retired)), name).toBe(bytes(ticketsSaveSchema, legacyTickets(null, draft, retired)));
    }
  });
  it("re-sends a pending request exactly as it was", () => {
    const pending = ticketsSaveSchema.parse({ operationId: randomUUID(), expectedRevision: "3", designRevision: "d", content: rose(), retiredMediaAssetIds: [] });
    expect(build(pending, { ...rose(), title: "Edited after" }, [randomUUID()])).toBe(pending);
  });
  it("writes a flag only when the person toggles it; toggling back removes it again so the bytes match the saved page", () => {
    const loaded = rose();
    for (const key of TICKET_VISIBILITY_KEYS) {
      const hidden = setTicketsFlag(structuredClone(loaded), key, false, loaded);
      expect(JSON.parse(bytes(ticketsSaveSchema, build(null, hidden, []))).content[key]).toBe(false);
      const shownAgain = setTicketsFlag(hidden, key, true, loaded);
      expect(bytes(ticketsSaveSchema, build(null, shownAgain, []))).toBe(bytes(ticketsSaveSchema, legacyTickets(null, loaded, [])));
    }
  });
  it("keeps a flag the saved page already had, writing true when it is shown again", () => {
    const saved = { ...rose(), perksVisible: false };
    const shown = setTicketsFlag(structuredClone(saved), "perksVisible", true, saved);
    expect(shown.perksVisible).toBe(true);
    expect(ticketsContentSchema.safeParse(shown).success).toBe(true);
  });
});

describe("Season Membership cards", () => {
  it("lists the six cards, each tied to its own part, and every part's flag is honoured by the public page", () => {
    expect(SEASON_SPEC.sections.map(section => section.id)).toEqual(["heading", "intro", "pricing", "button", "benefits", "closing"]);
    for (const section of SEASON_SPEC.sections) expect(ticketPageSectionShown(SEASON_SPEC, season(), section.id)).toBe(true);
  });
  it("treats an absent optional flag as shown", () => {
    const content = season();
    expect("visible" in content.heading || "visible" in content.intro || "visible" in content.button).toBe(false);
    expect(ticketPageSectionShown(SEASON_SPEC, content, "heading")).toBe(true);
  });
  it("renders the real page with just one card's part", () => {
    const html = (id: string) => renderToStaticMarkup(createElement(CinematicSeasonMembership, { content: hydrateTicketPage("season-membership", SEASON_SPEC.sectionOnly(season(), id), []), placeholders: true }));
    expect(html("heading")).toContain("<h1");
    expect(html("heading")).not.toContain("tp-pricing");
    expect(html("intro")).toContain("tp-copy");
    expect(html("intro")).not.toContain("<h1");
    expect(html("pricing")).toContain("<table");
    expect(html("pricing")).not.toContain("tp-buy");
    expect(html("button")).toContain("tp-buy");
    expect(html("button")).not.toContain("<table");
    expect(html("benefits")).toContain("tp-benefits");
    expect(html("closing")).toContain("tp-closing");
    expect(html("closing")).not.toContain("tp-buy");
  });
  it("hides BOTH Buy buttons with the one button flag", () => {
    const content = { ...season(), button: { ...season().button, visible: false } };
    const html = renderToStaticMarkup(createElement(CinematicSeasonMembership, { content: hydrateTicketPage("season-membership", content, []) }));
    expect(html).not.toContain("tp-buy");
    expect(renderToStaticMarkup(createElement(CinematicSeasonMembership, { content: hydrateTicketPage("season-membership", season(), []) })).match(/tp-buy/g)?.length).toBe(2);
  });
  it("marks only the cards that changed", () => {
    const saved = season(), draft = structuredClone(saved);
    expect(changedTicketPageSections(SEASON_SPEC, draft, saved)).toEqual([]);
    draft.pricing.rows[0].name += "x";
    draft.button = { ...draft.button, visible: false };
    expect(changedTicketPageSections(SEASON_SPEC, draft, saved)).toEqual(["pricing", "button"]);
    expect(ticketPageSectionSlice(SEASON_SPEC, draft, "heading")).toBe(ticketPageSectionSlice(SEASON_SPEC, saved, "heading"));
  });
});

describe("Know Before You Go cards", () => {
  it("lists the five cards; the heading has no flag so it is always shown", () => {
    expect(KBYG_SPEC.sections.map(section => section.id)).toEqual(["heading", "match", "facts", "raffle", "donor"]);
    expect(ticketPageSectionShown(KBYG_SPEC, kbyg(), "heading")).toBeNull();
    expect(ticketPageSectionShown(KBYG_SPEC, kbyg(), "facts")).toBe(kbyg().facts.visible);
  });
  it("renders the real page with just one card's part", () => {
    const html = (id: string) => renderToStaticMarkup(createElement(KnowBeforeYouGoView, { content: hydrateTicketPage("know-before-you-go", KBYG_SPEC.sectionOnly(kbyg(), id), []), match: { loading: true, fixture: null, clubShortName: "RC" }, placeholders: true }));
    expect(html("match")).toContain("tp-match");
    expect(html("match")).not.toContain("tp-facts");
    expect(html("facts")).toContain("tp-facts");
    expect(html("raffle")).toContain("tp-raffle");
    expect(html("donor")).toContain("tp-donor");
    expect(html("donor")).not.toContain("tp-raffle");
  });
  it("never writes a flag onto the heading, which has none", () => {
    const content = kbyg();
    expect(setTicketPageShown(KBYG_SPEC, content, "heading", false, content)).toBe(content);
  });
});

describe("Season and Know Before You Go save requests are unchanged", () => {
  it("an untouched load then save is byte-identical to the old request and adds no flag", () => {
    const loadedSeason = season(), loadedKbyg = kbyg();
    const s = buildTicketPageSaveInput({ pending: null, operationId: OP, snapshot, draft: structuredClone(loadedSeason), retiredMediaAssetIds: unusedTicketPageUploads([], loadedSeason) });
    const schemaSeason = ticketPageSaveSchema("season-membership"), schemaKbyg = ticketPageSaveSchema("know-before-you-go");
    expect(bytes(schemaSeason, s)).toBe(bytes(schemaSeason, legacyPage(null, loadedSeason, [])));
    const sent = JSON.parse(bytes(schemaSeason, s)).content;
    expect(sent).toEqual(loadedSeason);
    for (const part of ["heading", "intro", "button"] as const) expect("visible" in sent[part]).toBe(false);
    const k = buildTicketPageSaveInput({ pending: null, operationId: OP, snapshot, draft: structuredClone(loadedKbyg), retiredMediaAssetIds: [] });
    expect(bytes(schemaKbyg, k)).toBe(bytes(schemaKbyg, legacyPage(null, loadedKbyg, [])));
    expect(JSON.parse(bytes(schemaKbyg, k)).content).toEqual(loadedKbyg);
  });
  it("matches the old builder for edits, retiring replaced uploads the same way", () => {
    const first = randomUUID(), second = randomUUID();
    const draft = setTicketPageImage(setTicketPageImage(season(), "ticket", first), "ticket", second);
    const schema = ticketPageSaveSchema("season-membership");
    const input = buildTicketPageSaveInput({ pending: null, operationId: OP, snapshot, draft, retiredMediaAssetIds: unusedTicketPageUploads([first, second], draft) });
    expect(bytes(schema, input)).toBe(bytes(schema, legacyPage(null, draft, [first, second])));
    expect(input.retiredMediaAssetIds).toEqual([first]);
  });
  it("writes a Season flag only when toggled, and toggling back restores the saved bytes", () => {
    const loaded = season(), schema = ticketPageSaveSchema("season-membership");
    const original = bytes(schema, legacyPage(null, loaded, []));
    for (const part of ["heading", "intro", "button"] as const) {
      const hidden = setTicketPageShown(SEASON_SPEC, structuredClone(loaded), part, false, loaded);
      expect(JSON.parse(bytes(schema, buildTicketPageSaveInput({ pending: null, operationId: OP, snapshot, draft: hidden, retiredMediaAssetIds: [] }))).content[part].visible).toBe(false);
      expect(seasonMembershipSchema.safeParse(hidden).success).toBe(true);
      const back = setTicketPageShown(SEASON_SPEC, hidden, part, true, loaded);
      expect(bytes(schema, buildTicketPageSaveInput({ pending: null, operationId: OP, snapshot, draft: back, retiredMediaAssetIds: [] }))).toBe(original);
    }
    for (const part of ["pricing", "benefits", "closing"] as const) {
      const toggled = setTicketPageShown(SEASON_SPEC, structuredClone(loaded), part, !loaded[part].visible, loaded);
      expect(toggled[part].visible).toBe(!loaded[part].visible);
    }
  });
  it("re-sends a pending request exactly as it was", () => {
    const schema = ticketPageSaveSchema("know-before-you-go");
    const pending = schema.parse({ operationId: randomUUID(), expectedRevision: "3", designRevision: "d", content: kbyg(), retiredMediaAssetIds: [] });
    expect(buildTicketPageSaveInput({ pending, operationId: OP, snapshot, draft: { ...kbyg(), heading: { title: "x", subtitle: "" } }, retiredMediaAssetIds: [randomUUID()] })).toBe(pending);
  });
});

describe("one image slot per item", () => {
  it("keeps exactly one slot per price row and benefit through add, remove and the removal the table reports", () => {
    let content = season();
    const slotsOk = (value: SeasonMembershipContent) => expect(Object.keys(value.images).sort()).toEqual([...seasonImageSlots(value)].sort());
    slotsOk(content);
    content = addListItem("season-membership", content, "pricing"); slotsOk(content);
    content = addListItem("season-membership", content, "benefits"); slotsOk(content);
    expect(seasonMembershipSchema.safeParse(content).success).toBe(true);
    const gone = content.pricing.rows[0].id;
    content = removeListItem("season-membership", content, "pricing", 0); slotsOk(content);
    expect(gone in content.images).toBe(false);
    while (content.pricing.rows.length < 6) content = addListItem("season-membership", content, "pricing");
    expect(addListItem("season-membership", content, "pricing")).toBe(content);
    slotsOk(content);
  });
  it("keeps one icon slot per tile up to the 24-tile limit", () => {
    let content = kbyg();
    while (content.facts.tiles.length < 24) content = addListItem("know-before-you-go", content, "tiles");
    expect(content.facts.tiles).toHaveLength(24);
    expect(Object.keys(content.images).sort()).toEqual([...kbygImageSlots(content)].sort());
    expect(knowBeforeYouGoSchema.safeParse(content).success).toBe(true);
    expect(addListItem("know-before-you-go", content, "tiles")).toBe(content);
  });
});

describe("Save button state", () => {
  const state = (over: Partial<Parameters<typeof editorPageState>[0]>) => editorPageState({ base: "clean", busy: false, uploading: false, pending: false, conflict: false, saveFailed: false, ...over });
  it("maps failures the way the page frame expects, and a running save wins", () => {
    expect(state({ base: "dirty" })).toBe("dirty");
    expect(state({ base: "dirty", pending: true })).toBe("retry");
    expect(state({ base: "dirty", conflict: true })).toBe("conflict");
    expect(state({ base: "dirty", saveFailed: true })).toBe("error");
    expect(state({ base: "dirty", pending: true, busy: true })).toBe("saving");
    expect(state({ base: "saved" })).toBe("saved");
  });
});

describe("editor wiring", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const tickets = read("components/admin/tickets/TicketsEditor.tsx"), shell = read("components/admin/ticket-pages/TicketPageEditor.tsx");
  it("previews with the public components and saves through the unchanged routes", () => {
    expect(tickets).toContain('import CinematicTickets from "@/components/cinematic/CinematicTickets"');
    expect(tickets).toContain("saveTicketsEditor(request)");
    expect(tickets).toContain("ticketsSaveSchema.safeParse");
    expect(read("components/admin/ticket-pages/SeasonMembershipEditor.tsx")).toContain("CinematicSeasonMembership");
    expect(read("components/admin/ticket-pages/KnowBeforeYouGoEditor.tsx")).toContain("CinematicKnowBeforeYouGo");
    expect(shell).toContain("saveVisitorPageEditor<TicketPageContent<K>>(pageKey, request)");
    expect(shell).toContain("ticketPageSaveSchema(pageKey)");
  });
  it.each([["tickets", tickets], ["shell", shell]])("%s uses the page frame, preview cards, split dialog, conflict actions and the unsaved guard", (_name, source) => {
    for (const name of ["PageFrame", "PreviewCards", 'mode="split"', "useUnsavedGuard", "editorPageState", "PageFrameSkeleton", "PreviewCardsSkeleton", "Load latest and keep my edits", "Reload saved page", "Discard and reload", "SettledPreview", "saveAction.save()"]) {
      expect(source, name).toContain(name);
    }
  });
  it("breadcrumb is Website / Tickets and stadium / page title", () => {
    expect(tickets).toContain('{ label: "Website", href: "/admin/website-pages" as const }, { label: "Tickets and stadium" }');
    expect(shell).toContain('{ label: "Tickets and stadium" }');
  });
  it("never injects a flag when loading", () => {
    for (const source of [tickets, shell]) expect(source).not.toMatch(/Visible:\s*true/);
  });
});
