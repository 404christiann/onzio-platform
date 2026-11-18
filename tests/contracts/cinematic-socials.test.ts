import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DBSiteSocialLink, SiteSocialPlatform } from "@/lib/db-types";
import { cinematicDisplaySocialLinks, cinematicSocialPlatform } from "@/components/cinematic/social-platform";
import CinematicSocialLink from "@/components/cinematic/CinematicSocialLink";

const social = (platform: string): DBSiteSocialLink => ({ id: "60ca0f82-84cb-4f3f-ab63-67bc3d802051" as SiteSocialPlatform, label: platform, icon: `/images/logo/${platform}Logo.svg`, href: `https://social.example/${platform}?club=approved`, sort_order: 0, updated_at: "" });
describe("cinematic imported social links", () => {
  it.each(["instagram", "facebook", "tiktok", "youtube", "x"])("resolves UUID %s rows without changing their links", platform => {
    const row = social(platform);
    expect(cinematicSocialPlatform(row)).toBe(platform);
    const html = renderToStaticMarkup(createElement(CinematicSocialLink, { social: row }));
    expect(html).toContain(`href="${row.href.replaceAll("&", "&amp;")}"`);
    expect(html).toContain(platform === "x" ? "x-social" : "<svg");
    if (platform === "instagram") expect(html).toContain("#E1306C");
    if (platform === "facebook") expect(html).toContain("#1877F2");
    if (platform === "tiktok") expect(html).toContain("#25F4EE");
    if (platform === "youtube") expect(html).toContain("#FF0000");
  });
  it("keeps an unknown custom icon and destination rather than inserting a platform default", () => {
    const row = { ...social("custom"), icon: "https://club.example/custom-icon.png", href: "https://club.example/community" };
    expect(cinematicSocialPlatform(row)).toBeNull();
    const html = renderToStaticMarkup(createElement(CinematicSocialLink, { social: row }));
    expect(html).toContain(`src="${row.icon}"`);
    expect(html).toContain(`href="${row.href}"`);
    expect(html).not.toContain("<svg");
  });
  it("also supports canonical platform primary keys", () => {
    expect(cinematicSocialPlatform({ id: "instagram", icon: "/custom.png" })).toBe("instagram");
  });
});


describe("cinematic branding draft and saved social rows", () => {
  it("preserves the current UUID destinations before any override or canonical save", () => {
    const rows = ["instagram", "facebook", "tiktok", "x", "youtube"].map((platform, index) => ({ ...social(platform), id: `legacy-${platform}` as SiteSocialPlatform, sort_order: index }));
    expect(cinematicDisplaySocialLinks(rows)).toEqual(rows);
  });
  it("previews an explicit platform override over a legacy UUID row", () => {
    const row = social("instagram");
    expect(cinematicDisplaySocialLinks([row], { instagram: "https://instagram.example/new-club" })).toEqual([{ ...row, href: "https://instagram.example/new-club" }]);
    expect(cinematicDisplaySocialLinks([row], { instagram: "" })).toEqual([]);
  });
  it("also applies explicit row-ID overrides to legacy and custom rows", () => {
    const row = social("facebook");
    expect(cinematicDisplaySocialLinks([row], { [row.id]: "https://facebook.example/updated" })[0].href).toBe("https://facebook.example/updated");
    expect(cinematicDisplaySocialLinks([row], { [row.id]: "" })).toEqual([]);
    const custom = { ...social("custom"), id: "custom-row" as SiteSocialPlatform, icon: "/custom.png" };
    expect(cinematicDisplaySocialLinks([custom], { "custom-row": "https://custom.example/new" })).toEqual([{ ...custom, href: "https://custom.example/new" }]);
  });
  it("prefers a saved canonical row without duplicating the legacy platform", () => {
    const legacy = social("instagram");
    const canonical = { ...legacy, id: "instagram" as const, href: "https://instagram.example/saved" };
    for (const rows of [[legacy, canonical], [canonical, legacy]]) expect(cinematicDisplaySocialLinks(rows)).toEqual([canonical]);
  });
  it("honors a blank canonical save instead of reviving the old UUID destination", () => {
    const legacy = social("youtube");
    const canonical = { ...legacy, id: "youtube" as const, href: "" };
    expect(cinematicDisplaySocialLinks([legacy, canonical])).toEqual([]);
    expect(cinematicDisplaySocialLinks([legacy, canonical], { youtube: "https://youtube.example/draft" })).toEqual([{ ...canonical, href: "https://youtube.example/draft" }]);
  });
  it("renders a newly entered known-platform link using icon metadata only", () => {
    const links = cinematicDisplaySocialLinks([], { tiktok: "https://tiktok.example/explicit" });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ id: "tiktok", href: "https://tiktok.example/explicit", label: "TikTok", icon: "/images/logo/tiktokLogo.svg" });
    expect(cinematicDisplaySocialLinks([])).toEqual([]);
    expect(cinematicDisplaySocialLinks([], { instagram: "" })).toEqual([]);
  });
  it("preserves unknown custom icons alongside a deduplicated known platform", () => {
    const legacy = social("facebook");
    const canonical = { ...legacy, id: "facebook" as const, href: "https://facebook.example/saved" };
    const custom = { ...social("custom"), id: "custom-row" as SiteSocialPlatform, icon: "/custom.png", sort_order: 8 };
    expect(cinematicDisplaySocialLinks([legacy, canonical, custom])).toEqual([canonical, custom]);
  });
});
