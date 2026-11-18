import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { emptyChickFilAContent } from "@/lib/chick-fil-a-content";
import { emptyStadiumContent } from "@/lib/stadium-content";
import { emptyRobinsonContent } from "@/lib/cinematic-robinson-content";
const mocks = vi.hoisted(() => ({ fresh: vi.fn(), context: vi.fn(), mutate: vi.fn(), access: vi.fn(), rpc: vi.fn(), retire: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.fresh }));
vi.mock("@/lib/authorization", () => ({ authorizeMutation: mocks.mutate, authorizeAdminAccess: mocks.access }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.context }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retire }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: () => ({ rpc: mocks.rpc }) }) }));
import { handleVisitorPageRequest } from "@/lib/visitor-page-route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.fresh.mockResolvedValue({ userId: "actor" });
  mocks.context.mockResolvedValue({ id: "verified-tenant", role: "owner" });
  mocks.mutate.mockResolvedValue(undefined); mocks.access.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({ data: { revision: "1", media: [], retiredMediaAssetIds: [] }, error: null });
  mocks.retire.mockResolvedValue({ cleanupQueued: false });
});
const request = (content: unknown, headers: Record<string, string> = {}) => new Request("http://rose-city.localhost:3198/api/admin/visitor-pages/stadium", {
  method: "POST", headers: { host: "rose-city.localhost:3198", origin: "http://rose-city.localhost:3198", ...headers },
  body: JSON.stringify({ operationId: randomUUID(), expectedRevision: "0", designRevision: "design", content, retiredMediaAssetIds: [] }),
});
it.each(["stadium", "chick-fil-a"])("uses the verified tenant and user-scoped save RPC for %s", async page => {
  const response = await handleVisitorPageRequest(request(page === "stadium" ? emptyStadiumContent() : emptyChickFilAContent()), page, true);
  expect(response.status).toBe(200);
  expect(mocks.rpc.mock.calls[0][0]).toBe(page === "stadium" ? "save_stadium_editor" : "save_chick_fil_a_editor");
  expect(mocks.rpc.mock.calls[0][1].p_club_id).toBe("verified-tenant");
  expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ userId: "actor", feature: "homepage" }));
});
it("rejects a cross-origin mutation before reading auth or writing", async () => {
  expect((await handleVisitorPageRequest(request(emptyStadiumContent(), { origin: "https://other.test" }), "stadium", true)).status).toBe(403);
  expect(mocks.fresh).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects unrecognized pages and malformed operation identifiers", async () => {
  expect((await handleVisitorPageRequest(new Request("http://rose-city.localhost/api/admin/visitor-pages/other"), "other", false)).status).toBe(404);
  expect((await handleVisitorPageRequest(new Request("http://rose-city.localhost/api/admin/visitor-pages/stadium?operationId=invalid"), "stadium", false)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not save expired or unauthorized sessions", async () => {
  mocks.fresh.mockRejectedValue(new Error("expired"));
  expect((await handleVisitorPageRequest(request(emptyStadiumContent()), "stadium", true)).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects content from the other page and unknown content fields", async () => {
  expect((await handleVisitorPageRequest(request(emptyChickFilAContent()), "stadium", true)).status).toBe(400);
  expect((await handleVisitorPageRequest(request({ ...emptyStadiumContent(), clubId: "foreign" }), "stadium", true)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("maps known conflicts without retrying or retiring media", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "VISITOR_PAGE_CHANGED" } });
  const response = await handleVisitorPageRequest(request(emptyStadiumContent()), "stadium", true);
  expect(response.status).toBe(409); expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.retire).not.toHaveBeenCalled();
});
it("keeps a successful save committed when reference-safe cleanup is queued", async () => {
  const id = randomUUID();
  mocks.rpc.mockResolvedValue({ data: { revision: "2", retiredMediaAssetIds: [id] }, error: null });
  mocks.retire.mockRejectedValue(new Error("cleanup retry"));
  const response = await handleVisitorPageRequest(request(emptyStadiumContent()), "stadium", true);
  expect(response.status).toBe(200); expect((await response.json()).cleanupPending).toBe(true);
  expect(mocks.retire).toHaveBeenCalledWith({ clubId: "verified-tenant", actorId: "actor", assetId: id });
});
it("saves Robinson Stadium through its own user-scoped RPC, separately from the Foothill Transit (stadium) record", async () => {
  const response = await handleVisitorPageRequest(request(emptyRobinsonContent()), "robinson", true);
  expect(response.status).toBe(200);
  expect(mocks.rpc.mock.calls[0][0]).toBe("save_robinson_editor");
  expect(mocks.rpc.mock.calls[0][1].p_club_id).toBe("verified-tenant");
  await handleVisitorPageRequest(new Request("http://rose-city.localhost/api/admin/visitor-pages/robinson"), "robinson", false);
  expect(mocks.rpc.mock.calls[1][0]).toBe("load_robinson_editor");
});
it("refuses Foothill Transit content sent as Robinson and Robinson content sent as Foothill Transit", async () => {
  expect((await handleVisitorPageRequest(request(emptyStadiumContent()), "robinson", true)).status).toBe(400);
  expect((await handleVisitorPageRequest(request(emptyRobinsonContent()), "stadium", true)).status).toBe(400);
  expect((await handleVisitorPageRequest(request({ ...emptyRobinsonContent(), clubId: "foreign" }), "robinson", true)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  ["season-membership", "save_season_membership_editor", "load_season_membership_editor"],
  ["know-before-you-go", "save_know_before_you_go_editor", "load_know_before_you_go_editor"],
] as const)("saves %s through its own user-scoped RPC and refuses the other ticket page's content", async (page, save, load) => {
  const { emptyTicketPageContent } = await import("@/lib/cinematic-ticket-pages-content");
  const other = page === "season-membership" ? "know-before-you-go" : "season-membership";
  expect((await handleVisitorPageRequest(request(emptyTicketPageContent(other)), page, true)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
  const response = await handleVisitorPageRequest(request(emptyTicketPageContent(page)), page, true);
  expect(response.status).toBe(200);
  expect(mocks.rpc.mock.calls[0][0]).toBe(save);
  expect(mocks.rpc.mock.calls[0][1].p_club_id).toBe("verified-tenant");
  await handleVisitorPageRequest(new Request(`http://rose-city.localhost/api/admin/visitor-pages/${page}`), page, false);
  expect(mocks.rpc.mock.calls[1][0]).toBe(load);
});
