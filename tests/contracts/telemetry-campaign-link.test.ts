import { describe, expect, it } from "vitest";
import { UTM_MAX_CHARS, buildCampaignLink, isPublicSitePath, normalizeUtmValue } from "@/lib/telemetry/campaign-link";

const base = { host: "example.org", path: "/schedule", source: "instagram", medium: "social", campaign: "matchday-nov" };

describe("normalizeUtmValue", () => {
  it("trims and requires a value", () => {
    expect(normalizeUtmValue("  insta  ")).toEqual({ ok: true, value: "insta" });
    expect(normalizeUtmValue("")).toEqual({ ok: false, error: "Required" });
    expect(normalizeUtmValue("   ")).toEqual({ ok: false, error: "Required" });
  });

  it("allows 100 characters and rejects 101, counting by code point", () => {
    expect(normalizeUtmValue("a".repeat(UTM_MAX_CHARS)).ok).toBe(true);
    expect(normalizeUtmValue("a".repeat(UTM_MAX_CHARS + 1)).ok).toBe(false);
    expect(normalizeUtmValue("😀".repeat(100)).ok).toBe(true);
    expect(normalizeUtmValue("😀".repeat(101)).ok).toBe(false);
  });

  it.each(["a\u0000b", "a\tb", "a\nb", "a\u007fb", "a\u0085b"])("rejects control characters in %j", (value) => {
    expect(normalizeUtmValue(value).ok).toBe(false);
  });
});

describe("isPublicSitePath", () => {
  it.each(["/", "/schedule", "/news/some-story"])("accepts %s", (path) => {
    expect(isPublicSitePath(path)).toBe(true);
  });

  it.each(["/admin", "/admin/insights", "/api/x", "/api", "/r/abc", "/r", "schedule", "/a?b", "/a#b", "/a b", "/a\u0000b", ""])(
    "rejects %j",
    (path) => {
      expect(isPublicSitePath(path)).toBe(false);
    },
  );

  it("does not treat /roster or /apiary as private", () => {
    expect(isPublicSitePath("/roster")).toBe(true);
    expect(isPublicSitePath("/apiary")).toBe(true);
  });

  it("caps the length at 512", () => {
    expect(isPublicSitePath(`/${"a".repeat(511)}`)).toBe(true);
    expect(isPublicSitePath(`/${"a".repeat(512)}`)).toBe(false);
  });
});

describe("buildCampaignLink", () => {
  it("builds the link with utm params in source, medium, campaign order", () => {
    expect(buildCampaignLink(base)).toEqual({
      ok: true,
      url: "https://example.org/schedule?utm_source=instagram&utm_medium=social&utm_campaign=matchday-nov",
    });
  });

  it("trims values and percent-encodes spaces, &, =, # and unicode", () => {
    const result = buildCampaignLink({ ...base, source: "  a b&c=d#e ", medium: "café", campaign: "😀" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.url);
    expect(url.hash).toBe("");
    expect(url.searchParams.get("utm_source")).toBe("a b&c=d#e");
    expect(url.searchParams.get("utm_medium")).toBe("café");
    expect(url.searchParams.get("utm_campaign")).toBe("😀");
    expect(result.url).not.toContain("#");
    expect(result.url).toContain("utm_source=a+b%26c%3Dd%23e");
  });

  it("uses http only for localhost hosts", () => {
    expect(buildCampaignLink({ ...base, host: "alpha.localhost" })).toMatchObject({ ok: true, url: expect.stringMatching(/^http:\/\/alpha\.localhost\//) });
    expect(buildCampaignLink({ ...base, host: "localhost" })).toMatchObject({ ok: true, url: expect.stringMatching(/^http:\/\/localhost\//) });
    expect(buildCampaignLink(base)).toMatchObject({ ok: true, url: expect.stringMatching(/^https:\/\/example\.org\//) });
  });

  it("keeps the root path", () => {
    expect(buildCampaignLink({ ...base, path: "/" })).toMatchObject({ ok: true, url: expect.stringMatching(/^https:\/\/example\.org\/\?utm_source=/) });
  });

  it.each(["", "https://example.org", "example.org/path", "example.org:3000", "exa mple.org", "-bad.org", "a..b", "user@example.org", "example.org?x=1"])(
    "rejects the host %j",
    (host) => {
      const result = buildCampaignLink({ ...base, host });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.host).toBeTruthy();
    },
  );

  it("requires all three utm fields and a valid path, reporting each", () => {
    const result = buildCampaignLink({ host: "example.org", path: "/admin", source: "", medium: " ", campaign: "x\ny" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["campaign", "medium", "path", "source"]);
    expect(result.errors.source).toBe("Required");
  });
});
