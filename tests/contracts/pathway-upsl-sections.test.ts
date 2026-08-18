import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const TRYOUT_COMPONENT = "components/pathway/PathwayUpslTryoutSpotlight.tsx";
const CHANNEL_COMPONENT = "components/pathway/PathwayUpslMatchChannelPanel.tsx";
const STANDINGS_COMPONENT = "components/pathway/PathwayUpslStandingsTable.tsx";
const UPSL_ROUTE = "app/%5Fclubs/[slug]/upsl/page.tsx";
const CONTENT = "components/pathway/content.ts";
const QUERIES = "lib/queries.ts";
const PATHWAY_STYLES = "styles/pathway.css";
const MLA_SEED = "scripts/seed-mla-local.ts";

describe("pathway UPSL presentation sections", () => {
  it("provides the reusable tryout spotlight content contract", () => {
    const source = read(TRYOUT_COMPONENT);

    expect(source).not.toContain('"use client"');
    expect(source).toContain("export type PathwayUpslTryoutSpotlightProps");
    for (const prop of [
      "heading: string;",
      "statusLabel?: string;",
      "subheading: string;",
      "body: string[];",
      "date: string;",
      "time: string;",
      "location: string;",
      "cta: PathwayUpslSpotlightCta;",
      "image?: PathwayUpslSpotlightImage;",
    ]) {
      expect(source).toContain(prop);
    }
    expect(source).toContain(
      '<PathwaySection className="pathway-upsl-spotlight-section">',
    );
    expect(source).toContain('<dl className="pathway-upsl-spotlight-details">');
    expect(source.match(/<dt>(?:Date|Time|Location)<\/dt>/g)).toHaveLength(3);
    expect(source).toContain("body.map((paragraph)");
    expect(source).toContain(
      '<h1 className="pathway-upsl-spotlight-heading">{heading}</h1>',
    );
  });

  it("keeps the tryout CTA safe and photography directly delivered", () => {
    const source = read(TRYOUT_COMPONENT);
    const content = read(CONTENT);
    const tryoutBlock = content.slice(
      content.indexOf("tryouts: {", content.indexOf("export const upslContent")),
      content.indexOf("channel: {", content.indexOf("export const upslContent")),
    );

    expect(source).toContain('target: "_blank", rel: "noopener noreferrer"');
    expect(source).toContain("<ResilientImage");
    expect(source).toContain("src={image.src}");
    expect(source).toContain("alt={image.alt}");
    expect(source).toContain('imageDeliveryProps("hero-photo")');
    expect(source).toContain("<PathwayImageFallback");
    expect(source).toContain("fallback={mediaFallback}");
    expect(source).toContain("pathway-upsl-spotlight-status");
    expect(source).not.toContain('from "next/image"');
    expect(source).not.toContain("/_next/image");
    expect(source).not.toContain("/storage/v1/render/image/");
    expect(tryoutBlock).toContain('label: "Register Here"');
    expect(tryoutBlock).toContain(
      'href: "https://docs.google.com/forms/d/e/1FAIpQLSdc4zEO4hF3rDazZz2IkEpYf5hf2PKgYkAwe3uQ9cWYf0fxrA/viewform"',
    );
    expect(tryoutBlock).not.toContain('label: "Ask about upcoming tryouts"');
  });

  it("keeps the match-channel panel server-rendered and explicitly linked", () => {
    const source = read(CHANNEL_COMPONENT);

    expect(source).not.toContain('"use client"');
    expect(source).toContain("export type PathwayUpslMatchChannelPanelProps");
    expect(source).toContain("kicker: string;");
    expect(source).toContain("headlineLead: string;");
    expect(source).toContain("headlineEmphasis: string;");
    expect(source).toContain("body: string[];");
    expect(source).toContain(
      '<PathwaySection className="pathway-upsl-channel-section">',
    );
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).not.toContain("socialLinks");
    expect(source).not.toContain("pathway-upsl-channel-visual");
  });

  it("renders the approved Royal card with real tenant identity and two explicit actions", () => {
    const component = read(CHANNEL_COMPONENT);
    const content = read(CONTENT);
    const route = read(UPSL_ROUTE);

    for (const prop of [
      "bannerMedia?: PathwayUpslChannelBannerMedia;",
      "channelName: string;",
      "channelHandle: string;",
      "channelCrest?: PathwayUpslChannelCrest;",
      "subscribeAction: PathwayUpslChannelAction;",
      "watchAction: PathwayUpslChannelAction;",
    ]) {
      expect(component).toContain(prop);
    }
    expect(component).toContain('className="pathway-upsl-channel-kicker"');
    expect(component).toContain('className="pathway-upsl-channel-platform"');
    expect(component).toContain(
      '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">',
    );
    expect(component).toContain(
      'className="pathway-upsl-channel-platform-play"',
    );
    expect(component).toContain("<span>YouTube</span>");
    expect(component).toContain('className="pathway-upsl-channel-heading-lead"');
    expect(component).toContain(
      'className="pathway-upsl-channel-heading-emphasis"',
    );
    for (const className of [
      "pathway-upsl-channel-copy",
      "pathway-upsl-channel-card",
      "pathway-upsl-channel-banner",
      "pathway-upsl-channel-identity",
      "pathway-upsl-channel-mark",
      "pathway-upsl-channel-name",
      "pathway-upsl-channel-handle",
      "pathway-upsl-channel-actions",
    ]) {
      expect(component).toContain(className);
    }
    expect(component).toContain("const youtubeActions = [");
    expect(component).toContain(
      '{ ...subscribeAction, variant: "primary" }',
    );
    expect(component).toContain(
      '{ ...watchAction, variant: "secondary" }',
    );
    expect(component).toContain("youtubeActions.map((action)");
    expect(component).toContain("src={bannerMedia.src}");
    expect(component).toContain("alt={bannerMedia.alt}");
    expect(component).toContain('fallback={bannerFallback}');
    expect(component).toContain('imageDeliveryProps("photograph")');
    expect(component).toContain('data-has-photo={bannerMedia ? "true" : "false"}');
    expect(component).toContain('data-network="youtube"');
    expect(component).toContain("data-variant={action.variant}");
    expect(component).toContain("src={channelCrest.src}");
    expect(component).toContain('alt=""');
    expect(component).toContain('fallbackVariant="logo"');
    expect(component).toContain('imageDeliveryProps("club-logo")');
    expect(component).toContain('className="pathway-upsl-channel-initials"');
    expect(component).toContain('aria-hidden="true"');
    expect(component).toContain(".slice(0, 3)");
    expect(component).toContain(
      "aria-label={`${channelName} official YouTube channel`}",
    );

    expect(content).toContain('label: "Subscribe on YouTube"');
    expect(content).toContain('kicker: "Official match channel"');
    expect(content).toContain(
      'headlineLead: "Subscribe to our official YouTube channel"',
    );
    expect(content).toContain('headlineEmphasis: "Watch our games live!"');
    expect(content).toContain(
      'src: "/images/pathway/upsl-teamwork-54151d0d.webp"',
    );
    expect(content).toContain(
      'alt: "Five players in orange kits pose together on the field after a match."',
    );
    expect(content).toContain(
      'href: "https://www.youtube.com/@ManuLedesmaAcademy?sub_confirmation=1"',
    );
    expect(content).toContain('label: "Watch games live"');
    expect(content).toContain(
      'href: "https://www.youtube.com/@ManuLedesmaAcademy/streams"',
    );
    expect(content).not.toContain('src: "/club-logo"');
    expect(route).toContain("fetchClubBranding(club.id, onzio)");
    expect(route).toContain("channelName={club.name}");
    expect(route).toContain("src: crestUrl");
    expect(route).toContain("crestUrl ?");
  });

  it("resolves the crest through the injected tenant-authorized client", () => {
    const source = read(QUERIES);
    const block = source.slice(
      source.indexOf("export async function fetchClubBranding"),
      source.indexOf("export async function fetchHomepageStorySection"),
    );

    expect(block).toContain("client: typeof supabase = supabase");
    expect(block).toContain("const query = client");
    expect(block.match(/resolveMediaStoragePath\([\s\S]*?client,\s*\)/g)).toHaveLength(2);
    expect(block).not.toContain("const query = supabase");
  });

  it("replaces the removed UPSL explainer sections with the MLA standings table", () => {
    const route = read(UPSL_ROUTE);
    const table = read(STANDINGS_COMPONENT);

    expect(route).not.toContain("PathwayHero");
    expect(route).not.toContain("PathwayInvertedFeature");
    expect(route).not.toContain("PathwayNumberedSteps");
    expect(route).toContain("fetchLeagueStandings(club.id, onzio)");
    expect(route).toContain("<PathwayUpslStandingsTable");
    expect(route.indexOf("<PathwayUpslStandingsTable")).toBeGreaterThan(
      route.indexOf("<PathwayUpslMatchChannelPanel"),
    );

    expect(table).not.toContain('"use client"');
    expect(table).toContain('role="table"');
    expect(table).toContain('role="row"');
    expect(table).toContain('role="columnheader"');
    expect(table).toContain('role="cell"');
    expect(table).toContain('aria-labelledby="pathway-upsl-standings-heading"');
    expect(table).toContain('<h2 id="pathway-upsl-standings-heading">');
    expect(table).toContain('label: "GP"');
    expect(table).toContain('label: "W"');
    expect(table).toContain('label: "D"');
    expect(table).toContain('label: "L"');
    expect(table).toContain('label: "GD"');
    expect(table).toContain('label: "PTS"');
    expect(table).toContain("a.sort_order - b.sort_order");
    expect(table).toContain("row.is_club ? clubCrest?.src : row.logo_url");
    expect(table).toContain('imageDeliveryProps(');
    expect(table).toContain('"club-logo" : "opponent-crest"');
    expect(table).toContain("teamAbbreviation(row.team_name)");
    expect(table).toContain('data-club={row.is_club ? "true" : "false"}');
    expect(table).not.toContain("EditorialStandingsTable");
    expect(table).not.toContain("Lions Football Club");
  });

  it("keeps the copied Ohio Valley snapshot tenant-owned and highlights MLA", () => {
    const seed = read(MLA_SEED);
    const standingsBlock = seed.slice(
      seed.indexOf("const MLA_UPSL_STANDINGS:"),
      seed.indexOf("function standingRowId"),
    );
    const teamRows = [...standingsBlock.matchAll(
      /\{ teamName: "([^"]+)", played: (\d+), wins: (\d+), draws: (\d+), losses: (\d+), goalDifference: (-?\d+), points: (\d+), isClub: (true|false) \}/g,
    )].map((match) => ({
      teamName: match[1],
      played: Number(match[2]),
      wins: Number(match[3]),
      draws: Number(match[4]),
      losses: Number(match[5]),
      goalDifference: Number(match[6]),
      points: Number(match[7]),
      isClub: match[8] === "true",
    }));

    expect(seed).toContain('eyebrow: "League standings"');
    expect(seed).toContain('title: "Ohio Valley Division"');
    expect(teamRows).toEqual([
      { teamName: "Lions Football Club", played: 10, wins: 7, draws: 3, losses: 0, goalDifference: 21, points: 24, isClub: false },
      { teamName: "Leal United FC", played: 10, wins: 5, draws: 4, losses: 1, goalDifference: 11, points: 19, isClub: false },
      { teamName: "Columbus Astray", played: 10, wins: 6, draws: 1, losses: 3, goalDifference: 7, points: 19, isClub: false },
      { teamName: "Fut Ohio SC", played: 10, wins: 4, draws: 5, losses: 1, goalDifference: 27, points: 17, isClub: false },
      { teamName: "Indy Gladiators SC", played: 10, wins: 3, draws: 5, losses: 2, goalDifference: 10, points: 14, isClub: false },
      { teamName: "Manu Ledesma Academy", played: 10, wins: 4, draws: 2, losses: 4, goalDifference: 9, points: 8, isClub: true },
      { teamName: "Ohio International FC", played: 10, wins: 1, draws: 2, losses: 7, goalDifference: -30, points: 5, isClub: false },
      { teamName: "Lightning SC", played: 10, wins: 1, draws: 2, losses: 7, goalDifference: -27, points: 5, isClub: false },
      { teamName: "Mahoning Trumbull United SC", played: 10, wins: 1, draws: 2, losses: 7, goalDifference: -28, points: 5, isClub: false },
    ]);
    expect(standingsBlock.match(/isClub: true/g)).toHaveLength(1);
    expect(seed).toContain("where club_id = $1");
    expect(seed).toContain("MLA_LOCAL_TENANT_ID");
  });

  it("uses the injected tenant client for the public standings query", () => {
    const source = read(QUERIES);
    const block = source.slice(
      source.indexOf("export async function fetchLeagueStandings"),
      source.indexOf("export async function fetchSiteSocialLinks"),
    );

    expect(block).toContain("client: typeof supabase = supabase");
    expect(block.match(/client\s*\.from\(/g)).toHaveLength(2);
    expect(block).toContain('.eq("club_id", tenantId)');
    expect(block).toContain("client,");
    expect(block).not.toContain("supabase.from(");
  });

  it("matches the Lions table geometry in pathway colors and responsive widths", () => {
    const source = read(PATHWAY_STYLES);
    const start = source.indexOf("/* UPSL standings");
    const end = source.indexOf("/* Senior Club", start);
    const block = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    for (const contract of [
      "width: min(100%, 1260px);",
      "border-radius: 8px;",
      "min-height: 52px;",
      "grid-template-columns: minmax(360px, 1fr) repeat(6, 78px);",
      "min-height: 44px;",
      "border-left: 4px solid var(--accent);",
      "object-fit: contain;",
    ]) {
      expect(block).toContain(contract);
    }
    expect(source).toMatch(
      /@media \(max-width: 800px\)[\s\S]*?\.pathway-upsl-standings-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) repeat\(6, 58px\)/,
    );
    expect(source).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.pathway-upsl-standings-row \{[\s\S]*?repeat\(6, 34px\)/,
    );
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.pathway-upsl-standings-row \{[\s\S]*?transition: none;/,
    );
    const tableSelectors = source
      .split("\n")
      .filter((line) => line.includes(".pathway-upsl-standings") && line.includes("{"));
    expect(tableSelectors.length).toBeGreaterThan(0);
    expect(
      tableSelectors.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
    expect(block).not.toContain("100vw");
    expect(block).not.toMatch(/#(?:002b80|fc6601|077df2)/i);
  });

  it("pins the approved Royal channel-card geometry and interaction states", () => {
    const source = read(PATHWAY_STYLES);
    const block = source.slice(
      source.indexOf('[data-site-template="pathway"] .pathway-upsl-channel {'),
      source.indexOf("/* Senior Club", source.indexOf(".pathway-upsl-channel")),
    );

    for (const contract of [
      "width: min(100%, 1120px);",
      "grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);",
      "background: var(--accent);",
      "border-radius: calc(var(--radius) + var(--radius));",
      "box-shadow: 0 22px 55px color-mix(in srgb, var(--primary) 16%, transparent);",
      "min-height: 118px;",
      "width: 80px;",
      "height: 80px;",
      "object-fit: contain;",
      "overflow-wrap: anywhere;",
      "min-height: 44px;",
      ".pathway-upsl-channel-link:focus-visible",
    ]) {
      expect(block).toContain(contract);
    }
    expect(block).toContain(".pathway-upsl-channel-banner::after");
    expect(block).toMatch(
      /\.pathway-upsl-channel-banner-image \{[\s\S]*?object-fit: cover;[\s\S]*?object-position: 50% 5%;/,
    );
    expect(block).toMatch(
      /\.pathway-upsl-channel-banner::after \{[\s\S]*?background: color-mix\(in srgb, var\(--primary\) 38%, transparent\);/,
    );
    expect(block).toMatch(
      /\.pathway-upsl-channel-platform \{[\s\S]*?top: 16px;[\s\S]*?right: 16px;[\s\S]*?z-index: 2;[\s\S]*?background: color-mix\(in srgb, var\(--panel\) 92%, transparent\);[\s\S]*?font-family: var\(--pathway-nav-font\);/,
    );
    expect(block).toMatch(
      /\.pathway-upsl-channel-platform svg \{[\s\S]*?width: 21px;[\s\S]*?height: 21px;[\s\S]*?fill: none;[\s\S]*?stroke: currentColor;[\s\S]*?stroke-width: 2.25;/,
    );
    expect(block).toMatch(
      /\.pathway-upsl-channel-platform-play \{[\s\S]*?fill: currentColor;[\s\S]*?stroke: none;/,
    );
    expect(block).toMatch(
      /\.pathway-upsl-channel-banner-fallback \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?background: var\(--primary-lift\);/,
    );
    expect(block).toContain(".pathway-upsl-channel-banner-fallback::before");
    expect(block).toContain(".pathway-upsl-channel-banner-fallback::after");
    expect(block).toContain(".pathway-upsl-channel-kicker::before");
    expect(block).toMatch(
      /\.pathway-upsl-channel-kicker \{[\s\S]*?font-family: var\(--pathway-nav-font\);[\s\S]*?letter-spacing: 0\.15em;[\s\S]*?text-transform: uppercase;/,
    );
    expect(block).toMatch(
      /\.pathway-upsl-channel-heading-lead \{[\s\S]*?font-family: var\(--pathway-nav-font\);[\s\S]*?letter-spacing: 0\.105em;[\s\S]*?text-transform: uppercase;/,
    );
    expect(block).toMatch(
      /\.pathway-upsl-channel-heading-emphasis \{[\s\S]*?font-size: clamp\(2\.35rem, 3\.4vw, 3\.5rem\);[\s\S]*?letter-spacing: -0\.055em;[\s\S]*?line-height: 0\.99;/,
    );
    expect(block).toMatch(
      /\.pathway-upsl-channel-body \{[\s\S]*?border-left: 2px solid var\(--accent\);[\s\S]*?font-size: clamp\(1rem, 1\.1vw, 1\.08rem\);[\s\S]*?line-height: 1\.72;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.pathway-upsl-channel-content \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(source).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.pathway-upsl-channel-identity \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?\.pathway-upsl-channel-actions \{[\s\S]*?flex-direction: column;/,
    );
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.pathway-upsl-channel-link,[\s\S]*?\.pathway-upsl-standings-row \{[\s\S]*?transition: none;/,
    );

    const channelSelectors = source
      .split("\n")
      .filter((line) => line.includes(".pathway-upsl-channel") && line.includes("{"));
    expect(channelSelectors.length).toBeGreaterThan(0);
    expect(
      channelSelectors.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
    expect(block).not.toMatch(
      /Manu Ledesma|manu-ledesma-academy|\bMLA\b|Real Madrid|#[0-9a-f]{3,8}|gradient\(/i,
    );
  });

  it("preserves resilient media and neutral shared-template boundaries", () => {
    const tryout = read(TRYOUT_COMPONENT);
    const channel = read(CHANNEL_COMPONENT);

    for (const source of [tryout, channel]) {
      expect(source).toContain(
        'import ResilientImage from "@/components/ResilientImage"',
      );
      expect(source).toContain("<ResilientImage");
      expect(source).not.toContain('from "next/image"');
      expect(source).not.toContain("/_next/image");
      expect(source).not.toContain("/storage/v1/render/image/");
      expect(source).not.toMatch(
        /Manu Ledesma|manu-ledesma-academy|\bMLA\b|Real Madrid/i,
      );
      expect(source).not.toMatch(/#(?:002b80|fc6601|077df2)/i);
      expect(source).not.toMatch(/club\.(?:slug|name)/);
    }
    expect(tryout).toContain("<PathwayImageFallback");
    expect(tryout).toContain("fallback={mediaFallback}");
    expect(channel).toContain("fallback={crestFallback}");
    expect(channel).toContain('imageDeliveryProps("club-logo")');
  });

  it("ships the supplied channel-banner photograph as normalized direct media", async () => {
    const asset = resolve(
      process.cwd(),
      "public/images/pathway/upsl-teamwork-54151d0d.webp",
    );

    expect(existsSync(asset)).toBe(true);
    const bytes = readFileSync(asset);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    const metadata = await sharp(bytes).metadata();
    expect(metadata).toMatchObject({
      format: "webp",
      width: 1536,
      height: 1024,
      hasAlpha: false,
    });
  });
});
