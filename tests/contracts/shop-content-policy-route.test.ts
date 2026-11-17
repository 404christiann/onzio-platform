import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";
import type { ShopSaveRequest, ShopSnapshot } from "@/lib/shop-editor/contract";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(), authorizeMutation: vi.fn(), createClient: vi.fn(), getClubContext: vi.fn(),
  requireFreshClubSession: vi.fn(), retirePublishedMedia: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeAdminAccess: mocks.authorizeAdminAccess, authorizeMutation: mocks.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retirePublishedMedia }));

const clubId = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333", assetId = "44444444-4444-4444-8444-444444444444";
function payload(surface: "home" | "shop"): ShopSaveRequest {
  return { operationId, surface, expectedRevision: "0", designRevision: "current", variants: { home: { section: {
    eyebrow: "Maintained", title: "Kit", description: "", bullet_points: [], store_note: "", cta_label: "", cta_link: "",
  }, photos: [{ rowId: null, assetId, order: 0 }] } } };
}
function snapshot(surface: "home" | "shop"): ShopSnapshot {
  return { revision: "1", designRevision: "current", templateKey: "editorial@1", surface,
    sections: [], photos: [], photoRows: [], purchase: null, media: [] };
}
function request(surface: "home" | "shop", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://alpha.example/api/admin/shop?surface=${surface}`, {
    method: body ? "POST" : "GET", headers: { host: "alpha.example", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: "editorial@1", storeEnabled: false });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true });
  mocks.authorizeMutation.mockResolvedValue({ allowed: true });
  mocks.createClient.mockResolvedValue({ schema: () => ({ rpc: mocks.rpc }) });
  mocks.retirePublishedMedia.mockResolvedValue({ status: "retired" });
});

describe("Shop route content policy", () => {
  it.each([
    ["editorial@1", "shop"], ["editorial@1", "home"], ["clubhouse@1", "home"],
  ] as const)("loads and saves hidden %s %s content without recovery intent", async (template, surface) => {
    mocks.getClubContext.mockResolvedValue({ id: clubId, role: "admin", lifecycle: "active", presentationTemplateKey: template, storeEnabled: false });
    mocks.rpc.mockResolvedValue({ data: snapshot(surface), error: null });
    const { GET, POST } = await import("@/app/api/admin/shop/route");
    const read = await GET(request(surface));
    expect(read.status).toBe(200);
    expect(read.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenLastCalledWith("load_shop_page", { p_club_id: clubId, p_surface: surface, p_operation_id: null });
    expect((await POST(request(surface, payload(surface)))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_shop_page", { p_club_id: clubId, p_request: payload(surface) });
    expect(mocks.authorizeMutation).toHaveBeenCalledWith(expect.objectContaining({ userId, payload: payload(surface), feature: "shop" }));
  });
  it.each(["authentication", "membership", "tenant"])("rejects missing %s before dispatch", async kind => {
    if (kind === "authentication") mocks.requireFreshClubSession.mockRejectedValue(new ContractError("AUTHENTICATION_REQUIRED"));
    if (kind === "membership") mocks.authorizeMutation.mockRejectedValue(new ContractError("MEMBERSHIP_REQUIRED"));
    if (kind === "tenant") mocks.getClubContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/shop/route");
    expect((await POST(request("shop", payload("shop")))).status).toBe(kind === "authentication" ? 401 : kind === "tenant" ? 404 : 403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ origin: "https://foreign.example" }, { "sec-fetch-site": "cross-site" }])("rejects cross-site mutation before dispatch (%#)", async headers => {
    const { POST } = await import("@/app/api/admin/shop/route");
    expect((await POST(request("shop", payload("shop"), headers))).status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each(["tenant", "home ownership", "link", "empty"])("rejects invalid %s payload before dispatch", async kind => {
    const original = payload(kind === "home ownership" ? "home" : "shop");
    const body = kind === "tenant" ? { ...original, club_id: clubId } : kind === "home ownership" ? { ...original, photoRows: {} }
      : kind === "empty" ? { ...original, variants: {} } : { ...original, variants: { home: { ...original.variants.home,
        section: { ...original.variants.home!.section, cta_link: "javascript:alert(1)" } } } };
    const { POST } = await import("@/app/api/admin/shop/route");
    expect((await POST(request(original.surface, body))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["CONTENT_CHANGED", "DESIGN_CHANGED", "OPERATION_REUSED"])("preserves %s conflict responses and no cleanup", async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: code } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { POST } = await import("@/app/api/admin/shop/route");
      const response = await POST(request("shop", payload("shop")));
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe(code);
      expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
