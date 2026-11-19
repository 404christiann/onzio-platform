import { describe, expect, it, vi } from "vitest";
import legacy from "../../assets/rose-city-2027/existing-social-links.json";
import { cinematicDisplaySocialLinks, cinematicSocialPlatform } from "@/components/cinematic/social-platform";
import { brandingDirty, brandingStages, draftFromRows, socialStagePayload, type BrandingDraft } from "@/components/admin/club-settings/branding-draft";
import { canonicalizeSocialRows, normalizeSiteSocialLinks, socialPlatformOf } from "@/lib/social-links";
import type { DBSiteSocialLink } from "@/lib/db-types";

// RC-ADMIN-4c: Rose City's five social links are stored under old UUID ids and used to load blank.
// One mapper (canonicalizeSocialRows) is used by the load (draftFromRows) and the save (socialStagePayload).

const PLATFORMS = ["instagram", "facebook", "tiktok", "x", "youtube"] as const;
const NOW = "2026-11-19T12:00:00.000Z";
const legacyRows = legacy.rows.map((row) => ({ ...row, updated_at: "" })) as unknown as DBSiteSocialLink[];
const legacyHrefs = legacy.rows.map((row) => row.href);
const branding = { logoPath: "club-logo/1.png", tagline: "Pasadena, California" };

describe("legacy social link ids (RC-ADMIN-4c)", () => {
  it("has the five Rose City rows under non-standard ids (the bug)", () => {
    expect(legacyRows.map((row) => row.id)).not.toEqual([...PLATFORMS]);
    expect(normalizeSiteSocialLinks(legacyRows).map((link) => link.href)).toEqual(["", "", "", "", ""]);
  });

  it("loads all five legacy-id links filled, in the standard order", () => {
    const draft = draftFromRows(branding, legacyRows);
    expect(draft.links.map((link) => link.id)).toEqual([...PLATFORMS]);
    expect(draft.links.map((link) => link.href)).toEqual(legacyHrefs);
    expect(draft.configured).toEqual([...PLATFORMS]);
  });

  it("a no-op save writes nothing and loses nothing", () => {
    const draft = draftFromRows(branding, legacyRows);
    expect(brandingDirty(draft, draft, true)).toBe(false);
    expect(brandingStages(draft, draft, true, NOW)).toEqual([]);
  });

  it("the save payload carries the same five URLs under standard ids, no duplicates, none lost", () => {
    const draft = draftFromRows(branding, legacyRows);
    const payload = socialStagePayload(draft, NOW);
    expect(payload.map((row) => row.id)).toEqual([...PLATFORMS]);
    expect(payload.map((row) => row.href)).toEqual(legacyHrefs);
    expect(new Set(payload.map((row) => row.id)).size).toBe(5);
    expect(payload.map((row) => row.sort_order)).toEqual([0, 1, 2, 3, 4]);
    expect(payload.map((row) => row.icon)).toEqual(legacy.rows.map((row) => row.icon));
  });

  it("one edit writes all five platforms (standard ids) with the edit applied", () => {
    const saved = draftFromRows(branding, legacyRows);
    const edited: BrandingDraft = { ...saved, links: saved.links.map((link) => (link.id === "tiktok" ? { ...link, href: "https://www.tiktok.com/@new" } : link)) };
    const stages = brandingStages(edited, saved, true, NOW);
    expect(stages.map((stage) => stage.kind)).toEqual(["social"]);
    const social = stages[0];
    if (social.kind !== "social") throw new Error("expected a social stage");
    expect(social.payload.map((row) => row.id)).toEqual([...PLATFORMS]);
    expect(social.payload.map((row) => row.href)).toEqual(legacyHrefs.map((href, index) => (index === 2 ? "https://www.tiktok.com/@new" : href)));
  });

  it("the public footer shows each platform once after the save (legacy rows stay in the table)", () => {
    const written = socialStagePayload(draftFromRows(branding, legacyRows), NOW);
    const shown = cinematicDisplaySocialLinks([...legacyRows, ...written]);
    expect(shown.map((link) => link.id)).toEqual([...PLATFORMS]);
    expect(shown.map((link) => link.href)).toEqual(legacyHrefs);
  });

  it("a standard-id row wins over a legacy row for the same platform, blank included", () => {
    const standard: DBSiteSocialLink = { id: "instagram", label: "Instagram", href: "", icon: "/images/logo/instagramLogo.svg", sort_order: 0, updated_at: NOW };
    const mapped = canonicalizeSocialRows([...legacyRows, standard]);
    expect(mapped.filter((row) => row.id === "instagram")).toEqual([standard]);
    expect(mapped).toHaveLength(5);
    expect(draftFromRows(branding, [...legacyRows, standard]).links[0].href).toBe("");
  });

  it("drops a row it cannot identify from the form, and never emits it", () => {
    const stray = { id: "9f9c0d4a-0000-4000-8000-000000000000", label: "Mastodon", href: "https://example.social/@rc", icon: "/images/logo/mastodon.svg", sort_order: 9, updated_at: "" } as unknown as DBSiteSocialLink;
    const draft = draftFromRows(branding, [...legacyRows, stray]);
    expect(draft.links.map((link) => link.id)).toEqual([...PLATFORMS]);
    expect(socialStagePayload(draft, NOW).map((row) => row.href)).not.toContain(stray.href);
  });

  it("is idempotent", () => {
    const once = canonicalizeSocialRows(legacyRows);
    expect(canonicalizeSocialRows(once)).toEqual(once);
  });

  it("agrees with the public footer's own function (cinematicSocialPlatform) on the 5 legacy and 5 standard ids", () => {
    const standardRows = PLATFORMS.map((id) => ({ ...legacyRows[0], id, icon: `/images/logo/${id}Logo.svg` }));
    for (const row of [...legacyRows, ...standardRows]) expect(socialPlatformOf(row)).toBe(cinematicSocialPlatform(row));
    expect(legacyRows.map((row) => socialPlatformOf(row))).toEqual([...PLATFORMS]);
  });
});

describe("Diverse City social links stay identical (RC-ADMIN-4c)", () => {
  const standardRows: DBSiteSocialLink[] = [
    { id: "instagram", label: "Instagram", href: "https://www.instagram.com/dcfc/", icon: "/images/logo/instagramLogo.svg", sort_order: 0, updated_at: "2026-01-01T00:00:00Z" },
    { id: "facebook", label: "Facebook", href: "https://www.facebook.com/dcfc", icon: "/images/logo/facebookLogo.svg", sort_order: 1, updated_at: "2026-01-01T00:00:00Z" },
    { id: "youtube", label: "YouTube", href: "", icon: "/images/logo/youtubeLogo.svg", sort_order: 4, updated_at: "2026-01-01T00:00:00Z" },
  ];

  it("maps standard rows to themselves", () => {
    expect(canonicalizeSocialRows(standardRows)).toEqual(standardRows);
  });

  it("builds the same draft as the classic load (normalize + row ids)", () => {
    const draft = draftFromRows({ logoPath: "a.png", tagline: "t" }, standardRows);
    expect(draft.links).toEqual(normalizeSiteSocialLinks(standardRows));
    expect(draft.configured).toEqual(standardRows.map((row) => row.id));
  });

  it("writes the exact payload the classic save wrote", () => {
    const saved = draftFromRows({ logoPath: "a.png", tagline: "t" }, standardRows);
    const edited: BrandingDraft = { ...saved, links: saved.links.map((link) => (link.id === "facebook" ? { ...link, href: "https://www.facebook.com/new" } : link)) };
    const [stage] = brandingStages(edited, saved, false, NOW);
    expect(stage.kind === "social" && stage.payload).toEqual([
      { id: "instagram", label: "Instagram", href: "https://www.instagram.com/dcfc/", icon: "/images/logo/instagramLogo.svg", sort_order: 0, updated_at: NOW },
      { id: "facebook", label: "Facebook", href: "https://www.facebook.com/new", icon: "/images/logo/facebookLogo.svg", sort_order: 1, updated_at: NOW },
      { id: "youtube", label: "YouTube", href: "", icon: "/images/logo/youtubeLogo.svg", sort_order: 4, updated_at: NOW },
    ]);
  });
});

describe("Rose City footer tagline (RC-ADMIN-4c)", () => {
  const saved = draftFromRows({ logoPath: "a.png", tagline: "" }, legacyRows);

  it("shows the academy wording as not set and keeps a real tagline", async () => {
    const { roseCityTaglineFromBranding } = await import("@/components/admin/club-settings/rose-city/rose-city-branding");
    const { DEFAULT_ACADEMY_FOOTER_TAGLINE } = await import("@/lib/club-branding");
    expect(roseCityTaglineFromBranding(DEFAULT_ACADEMY_FOOTER_TAGLINE)).toBe("");
    expect(roseCityTaglineFromBranding("Pasadena, California")).toBe("Pasadena, California");
  });

  it("writes the tagline stage with the 160 cap, and a social-only edit writes no tagline", async () => {
    const { roseCityTaglineError } = await import("@/components/admin/club-settings/rose-city/rose-city-branding");
    expect(roseCityTaglineError("x".repeat(160), "")).toBeNull();
    expect(roseCityTaglineError("x".repeat(161), "")).toMatch(/160/);
    expect(roseCityTaglineError("", "Pasadena, California")).toMatch(/short line/);
    expect(roseCityTaglineError("", "")).toBeNull();
    const edited = { ...saved, tagline: "Pasadena, California" };
    expect(brandingStages(edited, saved, true, NOW)).toEqual([{ kind: "tagline", payload: { footer_tagline: "Pasadena, California", updated_at: NOW }, value: "Pasadena, California" }]);
    const social = { ...saved, links: saved.links.map((link) => (link.id === "x" ? { ...link, href: "https://x.com/new" } : link)) };
    expect(brandingStages(social, saved, true, NOW).map((stage) => stage.kind)).toEqual(["social"]);
  });

  it("rejects a changed link that is not https, and allows an untouched legacy value", async () => {
    const { roseCityBrandingErrors, roseCityBrandingInvalid } = await import("@/components/admin/club-settings/rose-city/rose-city-branding");
    expect(roseCityBrandingInvalid(roseCityBrandingErrors(saved, saved))).toBe(false);
    const bad = { ...saved, links: saved.links.map((link) => (link.id === "x" ? { ...link, href: "http://x.com/new" } : link)) };
    expect(roseCityBrandingErrors(bad, saved).links).toEqual({ x: "Use a complete link starting with https://." });
  });
});

vi.mock("@/lib/supabase-browser", () => ({ createClient: () => ({ schema: () => ({}) }) }));
vi.mock("@/lib/admin-client", () => ({ createClient: () => ({}) }));

describe("club settings editors come from the site package (RC-ADMIN-4c)", () => {
  const diverse = { slug: "diverse-city", presentationTemplateKey: "academy@1" };
  const rose = { slug: "rose-city", presentationTemplateKey: "cinematic@2" };
  const other = { slug: "alpha", presentationTemplateKey: null };

  it("resolves Rose City to its package editors and Diverse City (and any other club) to none, so the page default runs", async () => {
    const { siteFor } = await import("@/lib/site-for");
    const { RoseCityBranding } = await import("@/components/admin/club-settings/rose-city/RoseCityBranding");
    const { RoseCityFrame } = await import("@/components/admin/club-settings/rose-city/RoseCityFrame");
    expect(siteFor(rose)?.adminEditors?.branding).toBe(RoseCityBranding);
    expect(siteFor(rose)?.adminEditors?.clubSettingsFrame).toBe(RoseCityFrame);
    expect(siteFor(diverse)?.adminEditors?.branding).toBeUndefined();
    expect(siteFor(diverse)?.adminEditors?.clubSettingsFrame).toBeUndefined();
    for (const club of [other, { slug: "toString", presentationTemplateKey: null }, { slug: "__proto__", presentationTemplateKey: null }]) expect(siteFor(club)).toBeNull();
  });

  it("the shared pages do one siteFor lookup with the classic editor as the fallback, and no club or template conditional", async () => {
    const { readFileSync } = await import("node:fs");
    const branding = readFileSync("app/admin/(protected)/branding/page.tsx", "utf8");
    const members = readFileSync("app/admin/(protected)/members/page.tsx", "utf8");
    expect(branding).toContain("siteFor(club)?.adminEditors?.branding ?? ClassicBranding");
    expect(members).toContain("siteFor(club)?.adminEditors?.clubSettingsFrame");
    expect(members).toContain('<ClubSettingsFrame active="team">{body}</ClubSettingsFrame>');
    for (const page of [branding, members]) expect(page).not.toMatch(/presentationTemplateKey|cinematic@2|\.slug|rose-city/);
  });
});
