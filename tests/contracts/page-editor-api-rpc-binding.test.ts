import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(),
  authorizeMutation: vi.fn(),
  createClient: vi.fn(),
  getClubContext: vi.fn(),
  requireFreshClubSession: vi.fn(),
  loadLinkedOpenRegistrationForms: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  authorizeAdminAccess: mocks.authorizeAdminAccess,
  authorizeMutation: mocks.authorizeMutation,
}));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/queries", () => ({ loadLinkedOpenRegistrationForms: mocks.loadLinkedOpenRegistrationForms }));
vi.mock("@/lib/media-assets", () => ({ resolveMediaReferences: async (events: unknown[]) => events }));

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function request(path: string) {
  return new Request(`https://alpha.example${path}`, { headers: { host: "alpha.example" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId, claims: {} });
  mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: "academy@1" });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true, role: "owner" });
  mocks.loadLinkedOpenRegistrationForms.mockResolvedValue(new Map());
});

describe("page editor API RPC client binding", () => {
  it("loads Shop through the schema-scoped client", async () => {
    const onzio = {
      schemaName: "onzio",
      rpc(this: { schemaName: string }, name: string, args: Record<string, unknown>) {
        expect(this.schemaName).toBe("onzio");
        expect(name).toBe("load_shop_page");
        expect(args).toMatchObject({ p_club_id: clubId, p_surface: "shop" });
        return Promise.resolve({ data: {
          revision: "1", designRevision: "1", templateKey: "academy@1", surface: "shop",
          sections: [], photos: [], photoRows: [], purchase: null, media: [],
        }, error: null });
      },
    };
    mocks.createClient.mockResolvedValue({ schema: () => onzio });
    const { GET } = await import("@/app/api/admin/shop/route");

    const response = await GET(request("/api/admin/shop?surface=shop"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ surface: "shop", revision: "1" });
  });

  it("loads Tryouts through the schema-scoped client", async () => {
    const forms = {
      select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
    };
    const onzio = {
      schemaName: "onzio",
      rpc(this: { schemaName: string }, name: string, args: Record<string, unknown>) {
        expect(this.schemaName).toBe("onzio");
        expect(name).toBe("load_tryouts_page");
        expect(args).toMatchObject({ p_club_id: clubId });
        return Promise.resolve({ data: { revision: "1", events: [] }, error: null });
      },
      from: () => forms,
    };
    mocks.createClient.mockResolvedValue({ schema: () => onzio });
    const { GET } = await import("@/app/api/admin/tryouts-page/route");

    const response = await GET(request("/api/admin/tryouts-page"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ revision: "1", events: [], registrationForms: {} });
  });
});
