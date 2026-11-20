import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPageEvent, type PageEventPayload } from "@/lib/telemetry/beacon";
import {
  classifySource,
  deviceFromUserAgent,
  extractUtm,
  geoFromHeaders,
  isBotUserAgent,
  normalizeBeaconPath,
  referrerHostFrom,
} from "@/lib/telemetry/classify";
import { createFixedWindowLimiter } from "@/lib/telemetry/rate-limit";
import { clientIp, visitorMaterial, visitorSecret } from "@/lib/telemetry/visitor";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), schema: vi.fn(), createPublicClient: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createPublicClient: mocks.createPublicClient,
  createClient: mocks.createClient,
}));

const CLUB = "11111111-1111-4111-8111-111111111111";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SECRET = "s".repeat(48);
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CUBOT =
  "Mozilla/5.0 (Linux; Android 9; CUBOT P30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

function headers(overrides: Record<string, string | null> = {}): Headers {
  const base: Record<string, string> = {
    host: "rosecityfc.example",
    "user-agent": IPHONE,
    "x-real-ip": "203.0.113.7",
    "x-onzio-club-id": CLUB,
    "x-vercel-ip-country": "US",
    "x-vercel-ip-city": "Portland",
  };
  const result = new Headers();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value !== null) result.set(key, value);
  }
  return result;
}

function body(value: Record<string, unknown> = { t: "view", p: "/schedule" }): string {
  return JSON.stringify(value);
}

function recorded(input: Parameters<typeof buildPageEvent>[0]): { clubId: string; event: PageEventPayload } {
  const decision = buildPageEvent(input);
  if (decision.kind !== "record") throw new Error(`expected a recorded event, got ${decision.reason}`);
  return decision;
}

const env = { TELEMETRY_VISITOR_SECRET: SECRET };

describe("page telemetry classification", () => {
  it.each([
    ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
    ["Bingbot", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
    ["Facebook unfurler", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"],
    ["Slack unfurler", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"],
    ["headless Chrome", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/131.0.0.0 Safari/537.36"],
    ["Lighthouse", "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) Chrome-Lighthouse"],
    ["curl", "curl/8.7.1"],
    ["python requests", "python-requests/2.32.3"],
    ["GPTBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)"],
    ["empty", ""],
  ])("treats %s as a bot", (_label, userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(true);
  });

  it.each([IPHONE, DESKTOP, IPAD, ANDROID_TABLET, CUBOT])("treats a browser as a person: %s", (userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(false);
  });

  it("splits mobile, tablet and desktop", () => {
    expect(deviceFromUserAgent(IPHONE)).toBe("mobile");
    expect(deviceFromUserAgent(CUBOT)).toBe("mobile");
    expect(deviceFromUserAgent(IPAD)).toBe("tablet");
    expect(deviceFromUserAgent(ANDROID_TABLET)).toBe("tablet");
    expect(deviceFromUserAgent(DESKTOP)).toBe("desktop");
  });

  it("normalizes paths and refuses admin, API, internal and malformed paths", () => {
    expect(normalizeBeaconPath("/schedule/?utm_source=x#top")).toBe("/schedule");
    expect(normalizeBeaconPath("/")).toBe("/");
    expect(normalizeBeaconPath("/news/opening-day")).toBe("/news/opening-day");
    for (const bad of ["/admin", "/admin/analytics", "/api/t", "/_clubs/rose-city", "/%5Fclubs/x", "//evil.example", "schedule", "/a b", `/${"x".repeat(600)}`, 7, null]) {
      expect(normalizeBeaconPath(bad), String(bad)).toBeNull();
    }
  });

  it("keeps only the referrer host", () => {
    expect(referrerHostFrom("https://www.instagram.com/p/abc?igsh=secret")).toBe("instagram.com");
    expect(referrerHostFrom("https://l.facebook.com/l.php?u=private")).toBe("l.facebook.com");
    expect(referrerHostFrom("javascript:alert(1)")).toBeNull();
    expect(referrerHostFrom("not a url")).toBeNull();
    expect(referrerHostFrom("")).toBeNull();
  });

  it("reads the five UTM parameters and nothing else", () => {
    expect(extractUtm("?utm_source=Instagram&utm_medium=social&utm_campaign=Matchday-12&utm_content=reel&utm_term=x&fbclid=private")).toEqual({
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "matchday-12",
      utmContent: "reel",
      utmTerm: "x",
    });
    expect(extractUtm(`?utm_source=${"a".repeat(300)}`).utmSource).toHaveLength(100);
    expect(extractUtm("?utm_source=%00%01").utmSource).toBeNull();
    expect(extractUtm(undefined).utmSource).toBeNull();
  });

  it("classifies traffic sources", () => {
    const none = extractUtm("");
    const site = "rosecityfc.example";
    expect(classifySource({ referrerHost: null, siteHost: site, utm: none })).toBe("direct");
    expect(classifySource({ referrerHost: "google.com", siteHost: site, utm: none })).toBe("search");
    expect(classifySource({ referrerHost: "l.facebook.com", siteHost: site, utm: none })).toBe("social");
    expect(classifySource({ referrerHost: "t.co", siteHost: site, utm: none })).toBe("social");
    expect(classifySource({ referrerHost: "oregonlive.com", siteHost: site, utm: none })).toBe("referral");
    expect(classifySource({ referrerHost: "rosecityfc.example", siteHost: "www.rosecityfc.example", utm: none })).toBe("internal");
    expect(classifySource({ referrerHost: "instagram.com", siteHost: site, utm: extractUtm("?utm_source=ig") })).toBe("campaign");
  });

  it("reads Vercel geography and decodes the city", () => {
    expect(geoFromHeaders(headers({ "x-vercel-ip-city": "S%C3%A3o%20Paulo", "x-vercel-ip-country": "br" }))).toEqual({ country: "BR", city: "São Paulo" });
    expect(geoFromHeaders(headers({ "x-vercel-ip-city": "%E0%A4%A", "x-vercel-ip-country": "XX" }))).toEqual({ country: null, city: null });
    expect(geoFromHeaders(new Headers())).toEqual({ country: null, city: null });
  });
});

describe("page telemetry visitor id input", () => {
  it("is a keyed hash that never contains the IP", () => {
    const material = visitorMaterial(SECRET, "203.0.113.7", IPHONE);
    expect(material).toMatch(/^[0-9a-f]{64}$/);
    expect(material).not.toContain("203.0.113.7");
    expect(visitorMaterial(SECRET, "203.0.113.7", IPHONE)).toBe(material);
    expect(visitorMaterial(SECRET, "203.0.113.8", IPHONE)).not.toBe(material);
    expect(visitorMaterial(SECRET, "203.0.113.7", DESKTOP)).not.toBe(material);
    expect(visitorMaterial("t".repeat(48), "203.0.113.7", IPHONE)).not.toBe(material);
  });

  it("requires a long secret and reads the client IP", () => {
    expect(visitorSecret({})).toBeNull();
    expect(visitorSecret({ TELEMETRY_VISITOR_SECRET: "short" })).toBeNull();
    expect(visitorSecret(env)).toBe(SECRET);
    expect(clientIp(headers({ "x-real-ip": null, "x-forwarded-for": "198.51.100.4, 10.0.0.1" }))).toBe("198.51.100.4");
    expect(clientIp(headers({ "x-real-ip": null }))).toBeNull();
  });
});

describe("page telemetry beacon decisions", () => {
  it("builds the database payload with no raw IP, user agent or referrer URL", () => {
    const decision = recorded({
      headers: headers(),
      bodyText: body({ t: "view", p: "/schedule?x=1", r: "https://www.instagram.com/p/abc?igsh=secret", q: "?utm_source=ig&utm_campaign=matchday" }),
      env,
    });
    expect(decision.clubId).toBe(CLUB);
    expect(decision.event).toEqual({
      type: "view",
      visitorMaterial: visitorMaterial(SECRET, "203.0.113.7", IPHONE),
      path: "/schedule",
      referrerHost: "instagram.com",
      sourceType: "campaign",
      utmSource: "ig",
      utmMedium: null,
      utmCampaign: "matchday",
      utmContent: null,
      utmTerm: null,
      device: "mobile",
      country: "US",
      city: "Portland",
      isStaff: false,
    });
    const serialized = JSON.stringify(decision);
    expect(serialized).not.toContain("203.0.113.7");
    expect(serialized).not.toContain("iPhone");
    expect(serialized).not.toContain("igsh");
  });

  it("tags any signed-in session as staff", () => {
    expect(recorded({ headers: headers({ "x-onzio-user-id": USER }), bodyText: body(), env }).event.isStaff).toBe(true);
  });

  it.each([
    ["not_configured", { env: {} }],
    ["no_tenant", { headers: headers({ "x-onzio-club-id": null }) }],
    ["no_tenant", { headers: headers({ "x-onzio-club-id": "rose-city" }) }],
    ["bot", { headers: headers({ "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }) }],
    ["bot", { headers: headers({ "user-agent": null }) }],
    ["prefetch", { headers: headers({ "sec-purpose": "prefetch;prerender" }) }],
    ["no_ip", { headers: headers({ "x-real-ip": null }) }],
    ["too_large", { bodyText: body({ t: "view", p: "/", q: "x".repeat(3000) }) }],
    ["invalid_body", { bodyText: "not json" }],
    ["invalid_body", { bodyText: body({ t: "click", p: "/" }) }],
    ["invalid_body", { bodyText: body({ t: "view", p: "/", clubId: CLUB }) }],
    ["excluded_path", { bodyText: body({ t: "view", p: "/admin/analytics" }) }],
  ] as const)("drops %s", (reason, override) => {
    const decision = buildPageEvent({ headers: headers(), bodyText: body(), env, ...override });
    expect(decision).toEqual({ kind: "drop", reason });
  });
});

describe("page telemetry in-memory limiter", () => {
  it("allows the limit per window, resets, and bounds its memory", () => {
    const limiter = createFixedWindowLimiter({ limit: 2, windowMs: 1_000, maxKeys: 3 });
    expect([limiter.allow("a", 0), limiter.allow("a", 1), limiter.allow("a", 2)]).toEqual([true, true, false]);
    expect(limiter.allow("a", 1_000)).toBe(true);
    for (const key of ["b", "c", "d", "e"]) limiter.allow(key, 1_500);
    expect(limiter.size()).toBe(3);
  });
});

describe("POST /api/t", () => {
  let entitled = true;

  beforeEach(async () => {
    vi.stubEnv("TELEMETRY_VISITOR_SECRET", SECRET);
    entitled = true;
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "club_has_addon" ? { data: entitled, error: null } : { data: "recorded", error: null },
    );
    mocks.schema.mockReturnValue({ rpc: mocks.rpc });
    mocks.createPublicClient.mockReturnValue({ schema: mocks.schema });
    (await import("@/lib/telemetry/entitlement")).clearTelemetryEntitlementCache();
  });

  async function post(requestHeaders: Headers, text: string) {
    const { POST } = await import("@/app/api/t/route");
    return POST(new Request("https://rosecityfc.example/api/t", { method: "POST", headers: requestHeaders, body: text }));
  }

  function calls(name: string) {
    return mocks.rpc.mock.calls.filter(([called]) => called === name);
  }

  it("records through the anon public client's onzio.record_page_event and answers 204", async () => {
    const response = await post(headers({ "x-real-ip": "203.0.113.50" }), body({ t: "view", p: "/" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.schema).toHaveBeenCalledWith("onzio");
    expect(calls("club_has_addon")).toEqual([["club_has_addon", { p_club_id: CLUB, p_addon: "telemetry" }]]);
    expect(calls("record_page_event")).toHaveLength(1);
    const [, args] = calls("record_page_event")[0];
    expect(args.p_club_id).toBe(CLUB);
    expect(args.p_event).toMatchObject({ type: "view", path: "/", sourceType: "direct", isStaff: false });
    expect(JSON.stringify(args)).not.toContain("203.0.113.50");
    expect(mocks.rpc.mock.calls.map(([name]) => name).sort()).toEqual(["club_has_addon", "record_page_event"]);
  });

  it("skips clubs without the telemetry add-on before recording", async () => {
    entitled = false;
    expect((await post(headers({ "x-real-ip": "203.0.113.60" }), body())).status).toBe(204);
    expect(calls("club_has_addon")).toHaveLength(1);
    expect(calls("record_page_event")).toEqual([]);
  });

  it("caches the add-on check per club, and fails closed when it errors", async () => {
    await post(headers({ "x-real-ip": "203.0.113.61" }), body());
    await post(headers({ "x-real-ip": "203.0.113.62" }), body());
    expect(calls("club_has_addon")).toHaveLength(1);
    expect(calls("record_page_event")).toHaveLength(2);

    (await import("@/lib/telemetry/entitlement")).clearTelemetryEntitlementCache();
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "club_has_addon" ? { data: null, error: { code: "PGRST202", message: "missing" } } : { data: "recorded", error: null },
    );
    await post(headers({ "x-real-ip": "203.0.113.63" }), body());
    expect(calls("record_page_event")).toHaveLength(2);
  });

  it("drops bots and invalid bodies without calling the database, still answering 204", async () => {
    expect((await post(headers({ "user-agent": "curl/8.7.1" }), body())).status).toBe(204);
    expect((await post(headers(), "{")).status).toBe(204);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("answers 204 when the database call fails", async () => {
    mocks.rpc.mockRejectedValue(new Error("network down"));
    expect((await post(headers({ "x-real-ip": "203.0.113.51" }), body())).status).toBe(204);
  });

  it("sheds a flood from one visitor before the database", async () => {
    const flood = headers({ "x-real-ip": "203.0.113.99" });
    for (let i = 0; i < 125; i += 1) await post(flood, body());
    expect(calls("record_page_event")).toHaveLength(120);
  });
});
