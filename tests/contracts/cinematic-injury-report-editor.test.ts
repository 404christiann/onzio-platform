import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_INJURY_ENTRIES, starterCinematicInjuryReportContent } from "@/lib/cinematic-injury-report-content";
import {
  addInjuryEntry, availablePlayers, injuryReportSaveRequest, moveInjuryEntry, removeInjuryEntry, retiredFromRoster, unusedInjuryUploads,
  type CinematicInjuryReportSnapshot, type InjuryRosterPlayer,
} from "@/lib/cinematic-injury-report-editor";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(), authorizeMutation: vi.fn(), createClient: vi.fn(),
  getClubContext: vi.fn(), requireFreshClubSession: vi.fn(), retirePublishedMedia: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeAdminAccess: mocks.authorizeAdminAccess, authorizeMutation: mocks.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retirePublishedMedia }));
import { GET, POST } from "@/app/api/admin/cinematic-injury-report/route";

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const retiredBand = "44444444-4444-4444-8444-444444444444";
const players: InjuryRosterPlayer[] = [
  { id: "55555555-5555-4555-8555-555555555551", name: "Sample Defender", number: 4, position: "Defender" },
  { id: "55555555-5555-4555-8555-555555555552", name: "Sample Midfielder", number: 7, position: "Midfielder" },
  { id: "55555555-5555-4555-8555-555555555553", name: "Sample Forward", number: 9, position: "Forward" },
];
const snapshot = (): CinematicInjuryReportSnapshot => ({ revision: "2", designRevision: "d", content: starterCinematicInjuryReportContent(), players, media: [] });
const body = () => ({ operationId, expectedRevision: "1", designRevision: "d", content: starterCinematicInjuryReportContent() });
const post = (payload: unknown, headers: Record<string, string> = {}) => POST(new Request("https://rose.example/api/admin/cinematic-injury-report", {
  method: "POST", headers: { host: "rose.example", origin: "https://rose.example", "content-type": "application/json", ...headers }, body: JSON.stringify(payload),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: "cinematic@2" });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true });
  mocks.authorizeMutation.mockResolvedValue({ allowed: true });
  mocks.retirePublishedMedia.mockResolvedValue({ status: "retired" });
  mocks.createClient.mockResolvedValue({ schema: () => ({ rpc: mocks.rpc }) });
});

describe("Injury Report save route", () => {
  it("saves through the atomic database call under the Roster permission and retires a replaced logo or band", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), operationId, retiredMediaAssetIds: [retiredBand] }, error: null });
    const response = await post(body());
    expect(response.status).toBe(200);
    expect(mocks.authorizeMutation).toHaveBeenCalledWith(expect.objectContaining({ feature: "roster" }));
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_cinematic_injury_report_editor", { p_club_id: clubId, p_request: body() });
    expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId: retiredBand });
    expect(await response.json()).not.toHaveProperty("retiredMediaAssetIds");
  });

  it("retires media again when a lost save is recovered from its receipt", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), operation: { status: "committed", receipt: { ...snapshot(), retiredMediaAssetIds: [retiredBand] } } }, error: null });
    const response = await GET(new Request(`https://rose.example/api/admin/cinematic-injury-report?operationId=${operationId}`, { headers: { host: "rose.example" } }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("load_cinematic_injury_report_editor", { p_club_id: clubId, p_operation_id: operationId });
    expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId: retiredBand });
    expect((await response.json()).operation.receipt).not.toHaveProperty("retiredMediaAssetIds");
  });

  it("keeps the committed save when media cleanup fails", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), operationId, retiredMediaAssetIds: [retiredBand] }, error: null });
    mocks.retirePublishedMedia.mockRejectedValueOnce(new Error("storage down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try { expect((await post(body())).status).toBe(200); } finally { log.mockRestore(); }
  });

  it("refuses other website designs, invalid content, cross-site posts and signed-out visitors before touching the database", async () => {
    mocks.getClubContext.mockResolvedValueOnce({ id: clubId, role: "owner", presentationTemplateKey: "academy@1" });
    expect((await post(body())).status).toBe(404);
    const invalid = body();
    invalid.content.page.videoUrl = "https://vimeo.com/1";
    expect((await post(invalid)).status).toBe(400);
    expect((await post(body(), { origin: "https://evil.example" })).status).toBe(403);
    const { ContractError } = await import("@/lib/contract-error");
    mocks.requireFreshClubSession.mockRejectedValueOnce(new ContractError("AUTHENTICATION_REQUIRED", "Sign in"));
    expect((await post(body())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("takes the club from the web address, never from the request", async () => {
    mocks.rpc.mockResolvedValue({ data: snapshot(), error: null });
    await post({ ...body(), clubId: "99999999-9999-4999-8999-999999999999" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    await post(body());
    expect(mocks.getClubContext).toHaveBeenLastCalledWith({ hostname: "rose.example", userId });
    expect(mocks.rpc).toHaveBeenCalledWith("save_cinematic_injury_report_editor", expect.objectContaining({ p_club_id: clubId }));
  });

  it("reports another editor's save as a conflict and a refused role as forbidden", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "CINEMATIC_INJURY_REPORT_CHANGED" } });
    const response = await post(body());
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/Another editor changed the Injury Report/);
    const { ContractError } = await import("@/lib/contract-error");
    mocks.authorizeMutation.mockRejectedValueOnce(new ContractError("NOT_AUTHORIZED", "No"));
    expect((await post(body())).status).toBe(403);
  });
});

describe("Injury Report editor draft", () => {
  it("adds an entry for the next Roster player without one, up to the limit", () => {
    let content = addInjuryEntry(starterCinematicInjuryReportContent(), players);
    expect(content.entries).toEqual([{ id: expect.any(String), playerId: players[0].id, injury: "", timeline: "", note: "" }]);
    content = addInjuryEntry(content, players);
    expect(content.entries.map(row => row.playerId)).toEqual([players[0].id, players[1].id]);
    content = addInjuryEntry(addInjuryEntry(content, players), players);
    expect(content.entries).toHaveLength(3);
    const many = Array.from({ length: MAX_INJURY_ENTRIES + 2 }, (_, i) => ({ ...players[0], id: `55555555-5555-4555-8555-${String(i).padStart(12, "0")}` }));
    let full = starterCinematicInjuryReportContent();
    for (let i = 0; i < MAX_INJURY_ENTRIES + 2; i++) full = addInjuryEntry(full, many);
    expect(full.entries).toHaveLength(MAX_INJURY_ENTRIES);
  });

  it("offers each entry its own player plus the players nobody else has", () => {
    let content = addInjuryEntry(addInjuryEntry(starterCinematicInjuryReportContent(), players), players);
    expect(availablePlayers(players, content, content.entries[0].id).map(row => row.name)).toEqual(["Sample Defender", "Sample Forward"]);
    content = removeInjuryEntry(content, 0);
    expect(availablePlayers(players, content, content.entries[0].id).map(row => row.name)).toEqual(["Sample Defender", "Sample Midfielder", "Sample Forward"]);
  });

  it("moves and removes entries without touching the others", () => {
    let content = starterCinematicInjuryReportContent();
    for (let i = 0; i < 3; i++) content = addInjuryEntry(content, players);
    const order = (value: typeof content) => value.entries.map(row => players.find(p => p.id === row.playerId)!.number);
    expect(order(moveInjuryEntry(content, 2, -1))).toEqual([4, 9, 7]);
    expect(order(moveInjuryEntry(content, 0, -1))).toEqual([4, 7, 9]);
    expect(order(removeInjuryEntry(content, 1))).toEqual([4, 9]);
    expect(order(content)).toEqual([4, 7, 9]);
  });

  it("flags entries whose player has left the active Roster so the owner can remove them", () => {
    const content = addInjuryEntry(addInjuryEntry(starterCinematicInjuryReportContent(), players), players);
    expect(retiredFromRoster(content, players.slice(1))).toEqual([content.entries[0].id]);
  });

  it("turns the draft into a save request, storing a pasted YouTube link in its embed form", () => {
    const content = addInjuryEntry(starterCinematicInjuryReportContent(), players);
    Object.assign(content.entries[0], { injury: " Hamstring strain ", timeline: "2–3 weeks" });
    content.page.videoUrl = "https://youtu.be/fJf_A4LdKDw";
    const result = injuryReportSaveRequest(content, snapshot(), operationId);
    expect(result).toEqual({ ok: true, request: { operationId, expectedRevision: "2", designRevision: "d", content: expect.objectContaining({
      page: expect.objectContaining({ videoUrl: "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0" }),
      entries: [expect.objectContaining({ injury: "Hamstring strain", timeline: "2–3 weeks" })],
    }) } });
  });

  it("explains what to fix before saving, entry by entry", () => {
    const content = addInjuryEntry(addInjuryEntry(starterCinematicInjuryReportContent(), players), players);
    content.entries[1].timeline = "1 week";
    content.page.videoUrl = "https://vimeo.com/1";
    content.page.rehabHeading = "";
    const result = injuryReportSaveRequest(content, snapshot(), operationId);
    expect(result).toEqual({ ok: false, errors: {
      "page.rehabHeading": "Enter a heading.",
      "page.videoUrl": "Paste a YouTube video link.",
      "entries.0.injury": "Enter the injury.",
      "entries.0.timeline": "Enter the timeline.",
      "entries.1.injury": "Enter the injury.",
    } });
  });

  it("finds this session's uploads that the draft no longer uses, so they are cleaned up", () => {
    const content = { ...starterCinematicInjuryReportContent(), presenterLogoAssetId: "logo", bandAssetId: "band" };
    expect(unusedInjuryUploads(["logo", "old-band", "band", "old-logo"], content)).toEqual(["old-band", "old-logo"]);
  });

  it("is an admin page reached from the Homepage editor for cinematic@2 owners", () => {
    const homepage = readFileSync(resolve(process.cwd(), "components/admin/homepage/HomepageEditor.tsx"), "utf8");
    expect(homepage).toContain('{ label: "Edit in Injury Report", short: "Injury Report", href: "/admin/injury-report" }');
    const page = readFileSync(resolve(process.cwd(), "app/admin/(protected)/injury-report/page.tsx"), "utf8");
    expect(page).toContain("CinematicInjuryReportEditor");
  });
});
