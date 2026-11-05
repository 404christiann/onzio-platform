import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), club: vi.fn(), mutate: vi.fn(), access: vi.fn(), rpc: vi.fn(), retire: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.session }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.club }));
vi.mock("@/lib/authorization", () => ({ authorizeMutation: mocks.mutate, authorizeAdminAccess: mocks.access }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: () => ({ rpc: mocks.rpc }) }) }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retire }));
import { GET, POST } from "@/app/api/admin/cinematic-news/route";

const ROSE = { id: "rose-city-id", role: "owner", presentationTemplateKey: "cinematic@2" };
const article = { id: "4d5f8f8e-8c47-4a8e-9f1e-0c4a1bb0b6a1", slug: "foothill", revision: "2", publishedAt: "2026-11-20T20:00:00.000Z", removedAt: null, cover: null, content: {} };
const body = {
  operationId: "9b2f0a52-7d0e-4e8e-8a52-2f1c1e7b9d10", action: "save", articleId: null, expectedRevision: "0",
  slug: "foothill-transit-becomes-official-front-of-jersey-sponsor-of-rcfc", publishedAt: "2026-11-20T20:00:00.000Z", coverAssetId: null,
  content: { category: "sponsor-partner", cardHeading: "Foothill Transit", title: "Foothill Transit becomes Official Front of Jersey Sponsor of RCFC", subtitle: "", coverAlt: "", paragraphs: ["Rose City FC announce sponsorship with Foothill Transit."], actionLabel: "Partner with us", actionHref: "/community/partnership" },
};
const post = (payload: unknown, headers: Record<string, string> = {}) => POST(new Request("https://rose-city.example/api/admin/cinematic-news", {
  method: "POST", headers: { host: "rose-city.example", origin: "https://rose-city.example", "content-type": "application/json", ...headers }, body: JSON.stringify(payload),
}));

describe("RC2027-NEWS admin save route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ userId: "owner-id" });
    mocks.club.mockResolvedValue(ROSE);
    mocks.mutate.mockResolvedValue(undefined);
    mocks.access.mockResolvedValue(undefined);
    mocks.retire.mockResolvedValue(undefined);
  });

  it("refuses a cross-site request and an invalid article before checking the session", async () => {
    expect((await post(body, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ ...body, content: { ...body.content, category: "transfers" } })).status).toBe(400);
    expect((await post({ ...body, clubId: "other-club" })).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("saves for the club resolved from the host, then retires a replaced cover and hides it from the response", async () => {
    mocks.rpc.mockResolvedValue({ data: { operationId: body.operationId, article, retiredMediaAssetIds: ["old-cover-id"] }, error: null });
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(mocks.club).toHaveBeenCalledWith({ hostname: "rose-city.example", userId: "owner-id" });
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ club: ROSE, feature: "news" }));
    expect(mocks.rpc).toHaveBeenCalledWith("save_cinematic_news_article", { p_club_id: "rose-city-id", p_request: body });
    expect(mocks.retire).toHaveBeenCalledWith({ clubId: "rose-city-id", actorId: "owner-id", assetId: "old-cover-id" });
    expect(await response.json()).toEqual({ operationId: body.operationId, article });
  });

  it("turns database refusals into clear responses", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "CINEMATIC_NEWS_CHANGED", code: "PT409" } });
    const conflict = await post(body);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.message).toMatch(/Another editor changed this article/);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "NEWS_COVER_INVALID", code: "22023" } });
    expect((await post(body)).status).toBe(400);
    mocks.club.mockResolvedValue({ ...ROSE, presentationTemplateKey: "editorial@1" });
    expect((await post(body)).status).toBe(404);
  });

  it("loads the editor, and finishes a committed save's cleanup when its status is checked", async () => {
    mocks.rpc.mockResolvedValue({ data: { articles: [article], operation: { status: "committed", receipt: { operationId: body.operationId, article, retiredMediaAssetIds: ["old-cover-id"] } } }, error: null });
    const response = await GET(new Request(`https://rose-city.example/api/admin/cinematic-news?operationId=${body.operationId}`, { headers: { host: "rose-city.example" } }));
    expect(response.status).toBe(200);
    expect(mocks.access).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("load_cinematic_news_editor", { p_club_id: "rose-city-id", p_operation_id: body.operationId });
    expect(mocks.retire).toHaveBeenCalledWith({ clubId: "rose-city-id", actorId: "owner-id", assetId: "old-cover-id" });
    expect((await response.json()).operation.receipt).toEqual({ operationId: body.operationId, article });
    expect((await GET(new Request("https://rose-city.example/api/admin/cinematic-news?operationId=nope", { headers: { host: "rose-city.example" } }))).status).toBe(400);
  });
});
