import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  beaconBodySchema,
  ENGAGED_MS_MAX,
  ENGAGED_MS_MIN,
  MAX_BEACON_BYTES,
  MAX_LOGO_IDS,
} from "@/lib/telemetry/beacon-contract";
import { buildClickEvent, buildPageEvent, MAX_BEACON_BYTES as REEXPORTED } from "@/lib/telemetry/beacon";

vi.mock("@/lib/supabase-server", () => ({ createPublicClient: vi.fn(), createClient: vi.fn() }));

const CLUB = "11111111-1111-4111-8111-111111111111";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const S1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const S2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const SECRET = "s".repeat(48);
const NOW = 1_800_000_000_000;
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ENV = { TELEMETRY_VISITOR_SECRET: SECRET };

function headers(extra: Record<string, string> = {}): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries({
    host: "rosecityfc.example",
    "user-agent": DESKTOP,
    "x-real-ip": "203.0.113.7",
    "x-onzio-club-id": CLUB,
    ...extra,
  })) {
    result.set(key, value);
  }
  return result;
}

const build = (body: unknown, extra: Record<string, string> = {}) =>
  buildPageEvent({ headers: headers(extra), bodyText: JSON.stringify(body), env: ENV, now: NOW });

describe("beacon contract", () => {
  it("imports only zod, so the public-site package can use it", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/telemetry/beacon-contract.ts"), "utf8");
    const specifiers = [...source.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']/g)].map((match) => match[1]);
    expect(specifiers).toEqual(["zod"]);
    expect(source).not.toMatch(/\bimport\s*\(|require\(/);
  });

  it("exports the constants and keeps the old import path working", () => {
    expect([MAX_BEACON_BYTES, MAX_LOGO_IDS, ENGAGED_MS_MIN, ENGAGED_MS_MAX]).toEqual([2048, 10, 1000, 60000]);
    expect(REEXPORTED).toBe(MAX_BEACON_BYTES);
  });

  it("accepts each variant", () => {
    expect(beaconBodySchema.safeParse({ t: "view", p: "/", r: "https://x.example/", q: "?a=b" }).success).toBe(true);
    expect(beaconBodySchema.safeParse({ t: "view", p: "/" }).success).toBe(true);
    expect(beaconBodySchema.safeParse({ t: "logo_seen", p: "/", s: [S1] }).success).toBe(true);
    expect(beaconBodySchema.safeParse({ t: "logo_seen", p: "/", s: Array.from({ length: 10 }, (_, i) => `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb${String(i).padStart(2, "0")}`) }).success).toBe(true);
    expect(beaconBodySchema.safeParse({ t: "heartbeat", p: "/", e: 1000 }).success).toBe(true);
    expect(beaconBodySchema.safeParse({ t: "heartbeat", p: "/", e: 60000 }).success).toBe(true);
  });

  it.each([
    ["unknown type", { t: "click", p: "/" }],
    ["no type", { p: "/" }],
    ["extra key on view", { t: "view", p: "/", s: [S1] }],
    ["extra key on logo_seen", { t: "logo_seen", p: "/", s: [S1], e: 2000 }],
    ["extra key on heartbeat", { t: "heartbeat", p: "/", e: 2000, r: "https://x.example" }],
    ["empty s", { t: "logo_seen", p: "/", s: [] }],
    ["eleven ids", { t: "logo_seen", p: "/", s: Array.from({ length: 11 }, (_, i) => `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb${String(i).padStart(2, "0")}`) }],
    ["duplicate ids", { t: "logo_seen", p: "/", s: [S1, S1] }],
    ["case-different duplicate ids", { t: "logo_seen", p: "/", s: [S1, S1.toUpperCase()] }],
    ["non-uuid id", { t: "logo_seen", p: "/", s: ["not-a-uuid"] }],
    ["non-array s", { t: "logo_seen", p: "/", s: S1 }],
    ["e 999", { t: "heartbeat", p: "/", e: 999 }],
    ["e 60001", { t: "heartbeat", p: "/", e: 60001 }],
    ["e fractional", { t: "heartbeat", p: "/", e: 1500.5 }],
    ["e string", { t: "heartbeat", p: "/", e: "2000" }],
    ["heartbeat without e", { t: "heartbeat", p: "/" }],
    ["logo_seen without s", { t: "logo_seen", p: "/" }],
  ])("rejects %s", (_label, body) => {
    expect(beaconBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("payloads by type", () => {
  it("keeps the view payload byte-for-byte the same shape and key order", () => {
    const decision = build({ t: "view", p: "/news?x=1", r: "https://www.google.com/", q: "?utm_source=a" }, { "x-vercel-ip-country": "US" });
    expect(decision.kind).toBe("record");
    if (decision.kind !== "record") return;
    expect(Object.keys(decision.event)).toEqual([
      "type", "visitorMaterial", "networkMaterial", "ts", "path", "referrerHost", "sourceType",
      "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "device", "country", "city", "isStaff",
    ]);
    expect(decision.event).toMatchObject({ type: "view", path: "/news", referrerHost: "google.com", sourceType: "campaign", utmSource: "a" });
    for (const key of ["sponsorIds", "sponsorId", "engagedMs"]) expect(decision.event).not.toHaveProperty(key);
  });

  it("builds logo_seen with lowercase sponsor ids, a direct source and no other typed keys", () => {
    const decision = build({ t: "logo_seen", p: "/sponsors/", s: [S1.toUpperCase(), S2] }, { "x-onzio-user-id": USER });
    expect(decision.kind).toBe("record");
    if (decision.kind !== "record") return;
    const json = JSON.parse(JSON.stringify(decision.event));
    expect(json).toMatchObject({
      type: "logo_seen",
      path: "/sponsors",
      sponsorIds: [S1, S2],
      referrerHost: null,
      sourceType: "direct",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      utmTerm: null,
      isStaff: true,
    });
    expect(json).not.toHaveProperty("engagedMs");
    expect(json).not.toHaveProperty("sponsorId");
  });

  it("builds heartbeat with engagedMs and no sponsor keys", () => {
    const decision = build({ t: "heartbeat", p: "/", e: 15000 });
    expect(decision.kind).toBe("record");
    if (decision.kind !== "record") return;
    const json = JSON.parse(JSON.stringify(decision.event));
    expect(json).toMatchObject({ type: "heartbeat", path: "/", engagedMs: 15000, referrerHost: null, sourceType: "direct", isStaff: false });
    expect(json).not.toHaveProperty("sponsorIds");
    expect(json).not.toHaveProperty("sponsorId");
  });

  it("still drops bots, prefetch, excluded paths and bodies over the limit for the new types", () => {
    expect(build({ t: "heartbeat", p: "/", e: 2000 }, { "user-agent": "Googlebot/2.1" })).toEqual({ kind: "drop", reason: "bot" });
    expect(build({ t: "logo_seen", p: "/", s: [S1] }, { "sec-purpose": "prefetch" })).toEqual({ kind: "drop", reason: "prefetch" });
    expect(build({ t: "heartbeat", p: "/admin", e: 2000 })).toEqual({ kind: "drop", reason: "excluded_path" });
    expect(build({ t: "heartbeat", p: "/", e: 10 })).toEqual({ kind: "drop", reason: "invalid_body" });
    expect(buildPageEvent({ headers: headers(), bodyText: " ".repeat(MAX_BEACON_BYTES + 1), env: ENV })).toEqual({ kind: "drop", reason: "too_large" });
  });
});

describe("buildClickEvent", () => {
  const click = (extra: Record<string, string> = {}, sponsorId = S1) =>
    buildClickEvent({ headers: headers(extra), sponsorId, env: ENV, now: NOW });

  it("uses a same-host Referer's normalized path and marks the source internal", () => {
    const decision = click({ referer: "https://www.RoseCityFC.example:443/sponsors/?utm_source=x#top" });
    expect(decision.kind).toBe("record");
    if (decision.kind !== "record") return;
    expect(decision.event).toMatchObject({
      type: "click",
      sponsorId: S1,
      path: "/sponsors",
      referrerHost: "rosecityfc.example",
      sourceType: "internal",
      utmSource: null,
      isStaff: false,
    });
    expect(decision.event).not.toHaveProperty("sponsorIds");
    expect(decision.event).not.toHaveProperty("engagedMs");
  });

  it("lowercases the sponsor id and flags staff", () => {
    const decision = click({ "x-onzio-user-id": USER }, S1.toUpperCase());
    if (decision.kind !== "record") throw new Error("expected record");
    expect(decision.event).toMatchObject({ sponsorId: S1, isStaff: true });
  });

  it.each([
    ["foreign", { referer: "https://other.example/sponsors" }],
    ["missing", {}],
    ["malformed", { referer: "not a url" }],
  ])("falls back to / and direct for a %s Referer", (_label, extra) => {
    const decision = click(extra);
    if (decision.kind !== "record") throw new Error("expected record");
    expect(decision.event).toMatchObject({ path: "/", referrerHost: null, sourceType: "direct" });
  });

  it("uses / but stays internal when the same-host Referer path is excluded", () => {
    const decision = click({ referer: "https://rosecityfc.example/admin/x" });
    if (decision.kind !== "record") throw new Error("expected record");
    expect(decision.event).toMatchObject({ path: "/", referrerHost: "rosecityfc.example", sourceType: "internal" });
  });

  it("shares the drop reasons of the beacon", () => {
    expect(buildClickEvent({ headers: headers(), sponsorId: S1, env: {} })).toEqual({ kind: "drop", reason: "not_configured" });
    expect(click({ "user-agent": "Googlebot/2.1" })).toEqual({ kind: "drop", reason: "bot" });
    expect(click({ purpose: "prefetch" })).toEqual({ kind: "drop", reason: "prefetch" });
    const noTenant = headers();
    noTenant.delete("x-onzio-club-id");
    expect(buildClickEvent({ headers: noTenant, sponsorId: S1, env: ENV })).toEqual({ kind: "drop", reason: "no_tenant" });
    const noIp = headers();
    noIp.delete("x-real-ip");
    expect(buildClickEvent({ headers: noIp, sponsorId: S1, env: ENV })).toEqual({ kind: "drop", reason: "no_ip" });
  });
});
