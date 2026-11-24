import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  headers: {} as Record<string, string>,
  club: {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "rose-city",
    storeEnabled: false,
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(state.headers),
}));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: async () => state.club }));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const INDEXABLE = {
  host: "rosecityfutbolclub.com",
  "x-onzio-club-slug": "rose-city",
  "x-onzio-site-indexable": "1",
};

describe("robots.txt and sitemap.xml follow the middleware decision", () => {
  beforeEach(() => {
    state.headers = { ...INDEXABLE };
    state.club.storeEnabled = false;
  });

  it("robots.txt allows the public site and names the canonical sitemap when indexable", async () => {
    const result = await robots();
    expect(result.sitemap).toBe("https://rosecityfutbolclub.com/sitemap.xml");
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual(expect.arrayContaining(["/admin", "/api/", "/_clubs/"]));
  });

  it.each([
    ["flag is 0", { "x-onzio-site-indexable": "0" }],
    ["flag is missing", { "x-onzio-site-indexable": "" }],
    ["flag is not exactly 1", { "x-onzio-site-indexable": "true" }],
  ])("robots.txt disallows everything when the %s", async (_label, override) => {
    state.headers = { ...INDEXABLE, ...override };
    expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("robots.txt disallows everything without a host", async () => {
    delete state.headers.host;
    expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("sitemap lists the club's public pages on its canonical domain only", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://rosecityfutbolclub.com");
    expect(urls).toContain("https://rosecityfutbolclub.com/roster");
    expect(urls.every((url) => url.startsWith("https://rosecityfutbolclub.com"))).toBe(true);
    expect(urls.some((url) => /\/(admin|api|_clubs|register|r)(\/|$)/.test(url))).toBe(false);
    expect(urls).not.toContain("https://rosecityfutbolclub.com/shop");
  });

  it("sitemap lists the shop only when the club's store is enabled", async () => {
    state.club.storeEnabled = true;
    expect((await sitemap()).map((entry) => entry.url)).toContain("https://rosecityfutbolclub.com/shop");
  });

  it.each([
    ["not indexable", { "x-onzio-site-indexable": "0" }],
    ["no club slug", { "x-onzio-club-slug": "" }],
  ])("sitemap is empty when %s", async (_label, override) => {
    state.headers = { ...INDEXABLE, ...override };
    expect(await sitemap()).toEqual([]);
  });
});
