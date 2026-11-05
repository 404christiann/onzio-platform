import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PARTNERS, starterCinematicPartnersContent, type CinematicPartnersSnapshot } from "@/lib/cinematic-partners-content";
import { addPartner, movePartner, removePartner, unusedUploads } from "@/lib/cinematic-partners-editor";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(), authorizeMutation: vi.fn(), createClient: vi.fn(),
  getClubContext: vi.fn(), requireFreshClubSession: vi.fn(), retirePublishedMedia: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeAdminAccess: mocks.authorizeAdminAccess, authorizeMutation: mocks.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retirePublishedMedia }));
import { GET, POST } from "@/app/api/admin/cinematic-partners/route";

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const retiredLogo = "44444444-4444-4444-8444-444444444444";
const snapshot = (): CinematicPartnersSnapshot => ({ revision: "2", designRevision: "d", content: starterCinematicPartnersContent(), logos: [] });
const body = () => ({ operationId, expectedRevision: "1", designRevision: "d", content: starterCinematicPartnersContent() });
const post = (payload: unknown, headers: Record<string, string> = {}) => POST(new Request("https://rose.example/api/admin/cinematic-partners", {
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

describe("Partners editor save route", () => {
  it("saves through the atomic database call and retires logos no partner uses any more", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), operationId, retiredMediaAssetIds: [retiredLogo] }, error: null });
    const response = await post(body());
    expect(response.status).toBe(200);
    expect(mocks.authorizeMutation).toHaveBeenCalledWith(expect.objectContaining({ feature: "branding" }));
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_cinematic_partners_editor", { p_club_id: clubId, p_request: body() });
    expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId: retiredLogo });
    expect(await response.json()).not.toHaveProperty("retiredMediaAssetIds");
  });

  it("retires logos again when a lost save is recovered from its receipt", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), operation: { status: "committed", receipt: { ...snapshot(), retiredMediaAssetIds: [retiredLogo] } } }, error: null });
    const response = await GET(new Request(`https://rose.example/api/admin/cinematic-partners?operationId=${operationId}`, { headers: { host: "rose.example" } }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("load_cinematic_partners_editor", { p_club_id: clubId, p_operation_id: operationId });
    expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId: retiredLogo });
    expect((await response.json()).operation.receipt).not.toHaveProperty("retiredMediaAssetIds");
  });

  it("keeps the committed save when logo cleanup fails", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), operationId, retiredMediaAssetIds: [retiredLogo] }, error: null });
    mocks.retirePublishedMedia.mockRejectedValueOnce(new Error("storage down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try { expect((await post(body())).status).toBe(200); } finally { log.mockRestore(); }
  });

  it("refuses other website designs, invalid content and cross-site posts before touching the database", async () => {
    mocks.getClubContext.mockResolvedValueOnce({ id: clubId, role: "owner", presentationTemplateKey: "academy@1" });
    expect((await post(body())).status).toBe(404);
    const invalid = body();
    invalid.content.pages.opportunities.ctaHref = "javascript:alert(1)";
    expect((await post(invalid)).status).toBe(400);
    expect((await post(body(), { origin: "https://evil.example" })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reports another editor's save as a conflict", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "CINEMATIC_PARTNERS_CHANGED" } });
    const response = await post(body());
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/Another editor changed/);
  });
});

describe("Partners editor draft", () => {
  it("adds blank partners up to the limit", () => {
    let content = starterCinematicPartnersContent();
    content = addPartner(content);
    expect(content.partners).toEqual([{ id: expect.any(String), name: "", role: "", logoAssetId: null, tone: "original" }]);
    for (let i = 1; i < MAX_PARTNERS + 3; i++) content = addPartner(content);
    expect(content.partners).toHaveLength(MAX_PARTNERS);
    expect(new Set(content.partners.map(row => row.id)).size).toBe(MAX_PARTNERS);
  });

  it("moves and removes partners without touching the others", () => {
    let content = starterCinematicPartnersContent();
    for (const name of ["A", "B", "C"]) { content = addPartner(content); content.partners.at(-1)!.name = name; }
    expect(movePartner(content, 2, -1).partners.map(row => row.name)).toEqual(["A", "C", "B"]);
    expect(movePartner(content, 0, -1).partners.map(row => row.name)).toEqual(["A", "B", "C"]);
    expect(removePartner(content, 1).partners.map(row => row.name)).toEqual(["A", "C"]);
    expect(content.partners.map(row => row.name)).toEqual(["A", "B", "C"]);
  });

  it("finds this session's uploads that the draft no longer uses, so they are cleaned up", () => {
    const content = addPartner(starterCinematicPartnersContent());
    content.partners[0].logoAssetId = "kept";
    expect(unusedUploads(["kept", "replaced", "removed"], content)).toEqual(["replaced", "removed"]);
  });

  it("is reachable from Homepage and Sponsors for cinematic@2 owners", () => {
    const homepage = readFileSync(resolve(process.cwd(), "components/admin/homepage/HomepageEditor.tsx"), "utf8");
    expect(homepage).toContain('{ label: "Edit in Partners", short: "Partners", href: "/admin/partners" }');
    const sponsors = readFileSync(resolve(process.cwd(), "app/admin/(protected)/sponsors/page.tsx"), "utf8");
    expect(sponsors).toMatch(/presentationTemplateKey === "cinematic@2"[^]*href="\/admin\/partners"/);
  });
});
