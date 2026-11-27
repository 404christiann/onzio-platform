import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicTenantPath } from "@/middleware";
import { ingestSecret, signPayload } from "@/lib/telemetry/ingest";

const mocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
  clubHasTelemetry: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase-server", () => ({ createPublicClient: mocks.createPublicClient, createClient: vi.fn() }));
vi.mock("@/lib/telemetry/entitlement", () => ({ clubHasTelemetry: mocks.clubHasTelemetry }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => {
    mocks.afterCallbacks.push(callback);
  },
}));

import { GET } from "@/app/%5Fclubs/[slug]/r/[sponsor]/route";

const CLUB = "11111111-1111-4111-8111-111111111111";
const OTHER_CLUB = "22222222-2222-4222-8222-222222222222";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SPONSOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const INGEST = "ab".repeat(32);
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const DEST = "https://sponsor.example/offer?a=1";

const builder = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: mocks.maybeSingle,
};
const from = vi.fn(() => builder);
const schema = vi.fn(() => ({ from, rpc: mocks.rpc }));

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) vi.stubEnv(key, undefined as unknown as string);
    else vi.stubEnv(key, value);
  }
}

function req(headers: Record<string, string> = {}, sponsor = SPONSOR) {
  return {
    request: new Request(`https://rosecityfc.example/_clubs/rose-city/r/${sponsor}`, {
      headers: {
        host: "rosecityfc.example",
        "user-agent": DESKTOP,
        "x-real-ip": "203.0.113.7",
        "x-onzio-club-id": CLUB,
        ...headers,
      },
    }),
    ctx: { params: Promise.resolve({ slug: "other-club", sponsor }) },
  };
}

async function call(headers: Record<string, string> = {}, sponsor = SPONSOR) {
  const { request, ctx } = req(headers, sponsor);
  const response = await GET(request, ctx);
  for (const callback of mocks.afterCallbacks.splice(0)) await callback();
  return response;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mocks.afterCallbacks.length = 0;
  setEnv({
    TELEMETRY_INGEST_SECRET: INGEST,
    TELEMETRY_VISITOR_SECRET: "s".repeat(48),
    RC_PREVIEW_UNHOLD: undefined,
    VERCEL_ENV: undefined,
    RC_PREVIEW_HOST: undefined,
  });
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  mocks.maybeSingle.mockResolvedValue({ data: { website_url: DEST }, error: null });
  mocks.rpc.mockResolvedValue({ data: "ok", error: null });
  mocks.clubHasTelemetry.mockResolvedValue(true);
  mocks.createPublicClient.mockReturnValue({ schema });
});

describe("sponsor click redirect: lookup and responses", () => {
  it("is a public tenant path only for /r/<uuid>", () => {
    expect(isPublicTenantPath(`/r/${SPONSOR}`)).toBe(true);
    expect(isPublicTenantPath(`/r/${SPONSOR.toUpperCase()}`)).toBe(true);
    expect(isPublicTenantPath("/r/not-a-uuid")).toBe(false);
    expect(isPublicTenantPath(`/r/${SPONSOR}/x`)).toBe(false);
    expect(isPublicTenantPath(`/r/${SPONSOR}/`)).toBe(false);
    expect(isPublicTenantPath("/r")).toBe(false);
  });

  it("404s a non-uuid sponsor without a database call", async () => {
    const response = await call({}, "not-a-uuid");
    expect(response.status).toBe(404);
    expect(mocks.createPublicClient).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["not a uuid", "nope"],
  ])("404s a %s x-onzio-club-id header without a database call", async (_label, value) => {
    const { request, ctx } = req(value === null ? {} : { "x-onzio-club-id": value });
    if (value === null) request.headers.delete("x-onzio-club-id");
    const response = await GET(request, ctx);
    expect(response.status).toBe(404);
    expect(mocks.createPublicClient).not.toHaveBeenCalled();
  });

  it("404s an unknown sponsor, a lookup error, and a null or empty website_url, with no-store", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const unknown = await call();
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("cache-control")).toBe("no-store");
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await call()).status).toBe(404);
    mocks.maybeSingle.mockResolvedValueOnce({ data: { website_url: null }, error: null });
    expect((await call()).status).toBe(404);
    mocks.maybeSingle.mockResolvedValueOnce({ data: { website_url: "  " }, error: null });
    expect((await call()).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  // A stored site path is a link destination under the shared rule; the redirect goes there (see below).
  it.each(["javascript:alert(1)", "ftp://sponsor.example/x", "data:text/html,hi", "//sponsor.example/x", "not a url"])(
    "404s a non-http(s) stored url %s",
    async (url) => {
      mocks.maybeSingle.mockResolvedValueOnce({ data: { website_url: url }, error: null });
      const response = await call();
      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("redirects a known sponsor with 302 to the stored url, uncached", async () => {
    const response = await call();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(DEST);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([["/relative", "/relative"], ["mailto:offers@sponsor.example", "mailto:offers@sponsor.example"]])("redirects a stored site path or email link %s", async (url, location) => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { website_url: url }, error: null });
    const response = await call();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(location);
  });

  it("looks the sponsor up with the header club id, not the slug param or URL", async () => {
    await call({ "x-onzio-club-id": OTHER_CLUB.toUpperCase() });
    expect(schema).toHaveBeenCalledWith("onzio");
    expect(from).toHaveBeenCalledWith("site_sponsor_logos");
    expect(builder.select).toHaveBeenCalledWith("website_url");
    expect(builder.eq).toHaveBeenCalledWith("club_id", OTHER_CLUB);
    expect(builder.eq).toHaveBeenCalledWith("id", SPONSOR);
    expect(builder.eq).not.toHaveBeenCalledWith("club_id", expect.stringContaining("other-club"));
  });
});

describe("sponsor click redirect: recording", () => {
  const recordCalls = () => mocks.rpc.mock.calls.filter(([name]) => name === "record_page_event");

  it.each([
    ["a bot user agent", { "user-agent": "Googlebot/2.1" }],
    ["a prefetch request", { "sec-purpose": "prefetch" }],
  ])("does not record %s but still redirects", async (_label, headers) => {
    const response = await call(headers);
    expect(response.status).toBe(302);
    expect(recordCalls()).toHaveLength(0);
  });

  it("does not record without an ip, but still redirects", async () => {
    const { request, ctx } = req();
    request.headers.delete("x-real-ip");
    const response = await GET(request, ctx);
    for (const callback of mocks.afterCallbacks.splice(0)) await callback();
    expect(response.status).toBe(302);
    expect(recordCalls()).toHaveLength(0);
  });

  it("does not record for a club without the add-on, but still redirects", async () => {
    mocks.clubHasTelemetry.mockResolvedValue(false);
    const response = await call();
    expect(response.status).toBe(302);
    expect(mocks.clubHasTelemetry).toHaveBeenCalledWith(CLUB);
    expect(recordCalls()).toHaveLength(0);
  });

  it("does not record on the RC-PREVIEW host, but still redirects", async () => {
    setEnv({ RC_PREVIEW_UNHOLD: "1", VERCEL_ENV: "preview", RC_PREVIEW_HOST: "rc-preview-abc.vercel.app" });
    const response = await call({ host: "rc-preview-abc.vercel.app" });
    expect(response.status).toBe(302);
    expect(recordCalls()).toHaveLength(0);
    // The same flags do not silence a different host.
    await call({ host: "rosecityfc.example" });
    expect(recordCalls()).toHaveLength(1);
  });

  it("does not record without the ingest secret, but still redirects", async () => {
    setEnv({ TELEMETRY_INGEST_SECRET: undefined });
    const response = await call();
    expect(response.status).toBe(302);
    expect(recordCalls()).toHaveLength(0);
  });

  it("does not record without the visitor secret, but still redirects", async () => {
    setEnv({ TELEMETRY_VISITOR_SECRET: undefined });
    const response = await call();
    expect(response.status).toBe(302);
    expect(recordCalls()).toHaveLength(0);
  });

  it("records a signed click with an internal source from a same-host Referer", async () => {
    const response = await call({ referer: "https://rosecityfc.example/sponsors/?x=1", "x-onzio-user-id": USER });
    expect(response.status).toBe(302);
    const calls = recordCalls();
    expect(calls).toHaveLength(1);
    const args = calls[0][1] as { p_club_id: string; p_payload: string; p_signature: string };
    expect(args.p_club_id).toBe(CLUB);
    const secret = ingestSecret();
    expect(secret).toBe(INGEST);
    expect(args.p_signature).toBe(signPayload(CLUB, args.p_payload, INGEST));
    const event = JSON.parse(args.p_payload);
    expect(event).toMatchObject({
      type: "click",
      sponsorId: SPONSOR,
      path: "/sponsors",
      referrerHost: "rosecityfc.example",
      sourceType: "internal",
      isStaff: true,
    });
    expect(event).not.toHaveProperty("sponsorIds");
    expect(event).not.toHaveProperty("engagedMs");
  });

  it.each([
    ["a foreign", { referer: "https://other.example/sponsors" }],
    ["no", {}],
  ])("records / and direct for %s Referer", async (_label, headers) => {
    await call(headers);
    const args = recordCalls()[0][1] as { p_payload: string };
    expect(JSON.parse(args.p_payload)).toMatchObject({ type: "click", path: "/", referrerHost: null, sourceType: "direct", isStaff: false });
  });

  it("schedules recording after the response instead of awaiting it", async () => {
    const { request, ctx } = req();
    const response = await GET(request, ctx);
    expect(response.status).toBe(302);
    expect(recordCalls()).toHaveLength(0);
    expect(mocks.afterCallbacks).toHaveLength(1);
  });

  it("still redirects when the record rpc throws or rejects", async () => {
    mocks.rpc.mockImplementationOnce(() => {
      throw new Error("sync boom");
    });
    expect((await call()).status).toBe(302);
    mocks.rpc.mockRejectedValueOnce(new Error("async boom"));
    expect((await call()).status).toBe(302);
    mocks.clubHasTelemetry.mockRejectedValueOnce(new Error("entitlement boom"));
    expect((await call()).status).toBe(302);
  });
});
