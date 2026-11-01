import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(), authorizeMutation: vi.fn(), createClient: vi.fn(),
  getClubContext: vi.fn(), requireFreshClubSession: vi.fn(), retirePublishedMedia: vi.fn(),
  resolveMediaReferences: vi.fn(), rpc: vi.fn(), schema: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeAdminAccess: mocks.authorizeAdminAccess, authorizeMutation: mocks.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retirePublishedMedia }));
vi.mock("@/lib/media-assets", () => ({ resolveMediaReferences: mocks.resolveMediaReferences }));

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const assetId = "44444444-4444-4444-8444-444444444444";
const secondAssetId = "66666666-6666-4666-8666-666666666666";
const programId = "55555555-5555-4555-8555-555555555555";
const updatedAt = "2026-10-30T12:00:00.123456+00:00";
const program = {
  slug: "maintained-program", nav_label: "Pathway", display_title: "Maintained program", kicker: "Ages 8 to 12", summary: "A full season of training.",
  body: "Weekly sessions and match days.", highlights: ["Small groups"], layout_variant: "detail_focus", hero_media_asset_id: assetId, detail_media_asset_id: secondAssetId,
  external_cta_label: "Apply", external_cta_href: "https://registration.example.test/apply", registration_form_id: "77777777-7777-4777-8777-777777777777",
  registration_enabled: true, registration_eyebrow: "REGISTER", registration_headline: "Join", registration_body: "Spaces are limited.",
  registration_pending_body: "Opening soon.", registration_pending_label: "Soon", status: "active", sort_order: 0,
};
const pagePayload = (): any => ({ operationId, programId: null, expected: { programUpdatedAt: null, gallery: [] }, program: { ...program },
  gallery: [{ id: null, mediaAssetId: assetId, alt: "Training", sortOrder: 0 }] });
const directoryPayload = (): any => ({ operationId, expected: [{ id: programId, updatedAt }], programs: [{ id: programId, sortOrder: 0, status: "hidden" }] });

type Target = {
  label: string; path: string; route: () => Promise<{ GET: (request: Request) => Promise<Response>; POST: (request: Request) => Promise<Response> }>;
  body: () => any; snapshot: () => unknown; load: string; save: string;
  loadArgs: (operation: string | null) => Record<string, unknown>; query: (operation?: string) => string;
};
const targets: Target[] = [
  { label: "page", path: "programs-page", route: () => import("@/app/api/admin/programs-page/route"), body: pagePayload, snapshot: () => ({ program: null, gallery: [] }),
    load: "load_program_page", save: "save_program_page",
    loadArgs: operation => ({ p_club_id: clubId, p_program_id: programId, p_operation_id: operation }),
    query: operation => `?programId=${programId}${operation ? `&operationId=${operation}` : ""}` },
  { label: "directory", path: "programs-directory", route: () => import("@/app/api/admin/programs-directory/route"), body: directoryPayload, snapshot: () => ({ programs: [] }),
    load: "load_program_directory", save: "save_program_directory",
    loadArgs: operation => ({ p_club_id: clubId, p_operation_id: operation }), query: operation => operation ? `?operationId=${operation}` : "" },
];
const endpoint = (target: Target, query = "") => `https://alpha.example/api/admin/${target.path}${query}`;
const get = (target: Target, query = "") => new Request(endpoint(target, query), { headers: { host: "alpha.example" } });
const post = (target: Target, body: unknown) => new Request(endpoint(target), { method: "POST", headers: { host: "alpha.example", "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: "academy@1" });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true });
  mocks.authorizeMutation.mockResolvedValue({ allowed: true });
  mocks.retirePublishedMedia.mockResolvedValue({ status: "retired" });
  mocks.resolveMediaReferences.mockImplementation(async (rows: unknown) => rows);
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.createClient.mockResolvedValue({ schema: mocks.schema });
});
afterEach(() => vi.restoreAllMocks());

for (const target of targets) describe(`exported Programs ${target.label} handlers separate content maintenance from display`, () => {
  beforeEach(() => mocks.rpc.mockResolvedValue({ data: target.snapshot(), error: null }));

  for (const role of ["owner", "admin"]) {
    it.each([undefined, "cinematic@1", "heritage@1", "academy@1", "clubhouse@1", "editorial@1"])(`allows ${role} maintenance under %s`, async presentationTemplateKey => {
      mocks.getClubContext.mockResolvedValue({ id: clubId, role, lifecycle: "active", presentationTemplateKey });
      const { GET, POST } = await target.route(), memberships = [{ userId, clubId, role, status: "active" }];
      const read = await GET(get(target, target.query(operationId)));
      expect(read.status).toBe(200); expect(read.headers.get("Cache-Control")).toBe("no-store");
      const body = target.body(), saved = await POST(post(target, body));
      expect(saved.status).toBe(200); expect(saved.headers.get("Cache-Control")).toBe("no-store");
      expect(mocks.rpc).toHaveBeenNthCalledWith(1, target.load, target.loadArgs(operationId));
      expect(mocks.rpc).toHaveBeenNthCalledWith(2, target.save, { p_club_id: clubId, p_request: body });
      expect(mocks.authorizeAdminAccess).toHaveBeenCalledWith(expect.objectContaining({ capability: "content", memberships }));
      expect(mocks.authorizeMutation).toHaveBeenCalledWith(expect.objectContaining({ feature: "programs", memberships }));
      expect(await saved.json()).toEqual(target.snapshot());
    });
  }

  it("loads an ordinary GET without lookup parameters", async () => {
    const { GET } = await target.route();
    expect((await GET(get(target))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(target.load, target.label === "page"
      ? { p_club_id: clubId, p_program_id: null, p_operation_id: null } : { p_club_id: clubId, p_operation_id: null });
  });

  it.each(["session", "expired", "tenant", "tenant exception", "authorization"])("denies %s before SQL on load, status and save", async kind => {
    if (kind === "session" || kind === "expired") mocks.requireFreshClubSession.mockRejectedValue(new ContractError(kind === "expired" ? "SESSION_EXPIRED" : "AUTHENTICATION_REQUIRED"));
    if (kind === "tenant") mocks.getClubContext.mockResolvedValue(null);
    if (kind === "tenant exception") mocks.getClubContext.mockRejectedValue(new Error("missing"));
    if (kind === "authorization") { mocks.authorizeMutation.mockRejectedValue(new ContractError("NOT_AUTHORIZED")); mocks.authorizeAdminAccess.mockRejectedValue(new ContractError("NOT_AUTHORIZED")); }
    const { GET, POST } = await target.route();
    const expected = kind === "session" ? 401 : kind.startsWith("tenant") ? 404 : 403;
    for (const response of [await GET(get(target, target.query())), await GET(get(target, target.query(operationId))), await POST(post(target, target.body()))]) expect(response.status).toBe(expected);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([{ origin: "https://foreign.example" }, { "sec-fetch-site": "cross-site" }])("denies cross-site save (%#) before the database client is created", async headers => {
    const { POST } = await target.route();
    const request = new Request(endpoint(target), { method: "POST", headers: { host: "alpha.example", ...headers }, body: JSON.stringify(target.body()) });
    expect((await POST(request)).status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and an invalid lookup UUID before the session", async () => {
    const { GET, POST } = await target.route();
    expect((await GET(get(target, "?operationId=invalid"))).status).toBe(400);
    if (target.label === "page") expect((await GET(get(target, "?programId=invalid"))).status).toBe(400);
    expect((await POST(new Request(endpoint(target), { method: "POST", headers: { host: "alpha.example" }, body: "{" }))).status).toBe(400);
    expect(mocks.requireFreshClubSession).not.toHaveBeenCalled(); expect(mocks.createClient).not.toHaveBeenCalled();
  });

  const strict: [string, (body: any) => void][] = target.label === "page" ? [
    ["root extra key", body => { body.club_id = "foreign"; }],
    ["program extra key", body => { body.program.club_id = "foreign"; }],
    ["program missing key", body => { delete body.program.kicker; }],
    ["gallery order", body => { body.gallery[0].sortOrder = 1; }],
    ["duplicate gallery id", body => { body.gallery = [{ id: assetId, mediaAssetId: assetId, alt: "A", sortOrder: 0 }, { id: assetId, mediaAssetId: secondAssetId, alt: "B", sortOrder: 1 }]; }],
    ["programId null with a baseline", body => { body.expected.programUpdatedAt = updatedAt; }],
    ["programId set without a baseline", body => { body.programId = programId; }],
    ["operation UUID", body => { body.operationId = "bad"; }],
    ["more than 12 gallery items", body => { body.gallery = Array.from({ length: 13 }, (_, sortOrder) => ({ id: null, mediaAssetId: assetId, alt: "A", sortOrder })); }],
    ["slug pattern", body => { body.program.slug = "Not A Slug"; }],
    ["more than 200 highlights", body => { body.program.highlights = Array.from({ length: 201 }, () => "x"); }],
    ["gallery alt above 200", body => { body.gallery[0].alt = "x".repeat(201); }],
    ["layout variant", body => { body.program.layout_variant = "bad"; }],
    ["status", body => { body.program.status = "bad"; }],
  ] : [
    ["root extra key", body => { body.club_id = "foreign"; }],
    ["length mismatch", body => { body.programs = []; }],
    ["order", body => { body.programs[0].sortOrder = 1; }],
    ["status", body => { body.programs[0].status = "bad"; }],
    ["expected item extra key", body => { body.expected[0].extra = "bad"; }],
    ["programs item extra key", body => { body.programs[0].extra = "bad"; }],
    ["operation UUID", body => { body.operationId = "bad"; }],
    ["more than 200 programs", body => {
      body.expected = Array.from({ length: 201 }, () => ({ id: programId, updatedAt }));
      body.programs = Array.from({ length: 201 }, (_, sortOrder) => ({ id: programId, sortOrder, status: "active" }));
    }],
  ];
  it.each(strict)("rejects strict %s before SQL", async (_label, mutate) => {
    const body = target.body(); mutate(body);
    const { POST } = await target.route();
    expect((await POST(post(target, body))).status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects a null body before SQL", async () => {
    const { POST } = await target.route();
    expect((await POST(post(target, null))).status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  const mappings: [string, number][] = [["CONTENT_CHANGED", 409], ["OPERATION_REUSED", 409], ["NOT_AUTHORIZED", 403], ["PAGE_UNAVAILABLE", 404], ["INVALID_PROGRAM_PAGE_PAYLOAD", 400],
    ...(target.label === "page" ? [["INVALID_PROGRAM_MEDIA", 400], ["FIELD_UNAVAILABLE", 400]] as [string, number][] : []), ["unknown", 500]];
  it.each(mappings)("preserves SQL error %s mapping", async (message, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "22023", message } });
    const { GET, POST } = await target.route();
    for (const response of [await GET(get(target, target.query())), await POST(post(target, target.body()))]) {
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(message === "unknown" ? "DATABASE_OPERATION_FAILED" : message);
    }
    expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
  });
});

describe("exported Programs page handler media cleanup", () => {
  it("retires each removed asset once after a committed save and hides the bookkeeping key", async () => {
    mocks.rpc.mockResolvedValue({ data: { program: null, gallery: [], operationId, retiredMediaAssetIds: [assetId, secondAssetId] }, error: null });
    const { POST } = await targets[0].route();
    const response = await POST(post(targets[0], pagePayload()));
    expect(response.status).toBe(200);
    expect(mocks.retirePublishedMedia).toHaveBeenCalledTimes(2);
    expect(mocks.retirePublishedMedia).toHaveBeenCalledWith({ clubId, actorId: userId, assetId });
    expect(mocks.retirePublishedMedia).toHaveBeenCalledWith({ clubId, actorId: userId, assetId: secondAssetId });
    expect(await response.json()).toEqual({ program: null, gallery: [], operationId });
  });
});

describe("exported Programs page handler destination boundary", () => {
  beforeEach(() => mocks.rpc.mockResolvedValue({ data: targets[0].snapshot(), error: null }));

  it.each(["//evil.test", "javascript:alert(1)", "relative/path", "HTTPS://EXAMPLE.TEST"])("leaves the destination %j to the database predicate", async external_cta_href => {
    const body = pagePayload(); body.program.external_cta_href = external_cta_href;
    const { POST } = await targets[0].route();
    expect((await POST(post(targets[0], body))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_program_page", { p_club_id: clubId, p_request: body });
  });

  it("bounds the destination at 2048 characters", async () => {
    const { POST } = await targets[0].route();
    const atLimit = pagePayload(); atLimit.program.external_cta_href = `/${"x".repeat(2047)}`;
    expect((await POST(post(targets[0], atLimit))).status).toBe(200);
    const over = pagePayload(); over.program.external_cta_href = `/${"x".repeat(2048)}`;
    expect((await POST(post(targets[0], over))).status).toBe(400);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
