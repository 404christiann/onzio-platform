import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TELEMETRY-03: the club layout mounts SiteTelemetry only for clubs with the add-on, and the cinematic sponsor strip
// links and counts only database sponsors, only inside that provider, never in the admin's homepage preview.
const UUID_LINKED = "8f1c2a64-3d0e-4b57-9a11-5c2e7d9f0a31";
const UUID_PLAIN = "0b6d3e21-77a4-4c90-8e5f-1a9d2c4b6e08";
const FALLBACK = "default-carousel-chronic";
const CLUB = { id: "11111111-1111-4111-8111-111111111111", slug: "rose-city", name: "Rose City FC", presentationTemplateKey: "cinematic@2" };

const mocks = vi.hoisted(() => ({
  effects: [] as Array<{ effect: () => unknown; deps?: readonly unknown[] }>,
  club: vi.fn(), telemetry: vi.fn(), codeSite: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  // The server renderer never runs effects; capture them so the test can run the strip's tracking effect by hand.
  return { ...actual, useEffect: (effect: () => unknown, deps?: readonly unknown[]) => { mocks.effects.push({ effect, deps }); } };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/", notFound: () => { throw new Error("not found"); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/telemetry/entitlement", () => ({ clubHasTelemetry: mocks.telemetry }));
vi.mock("@/lib/code-site", () => ({ codeSiteFor: mocks.codeSite }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: () => ({}) }) }));
vi.mock("@/lib/cinematic-homepage-content", () => ({ fetchCinematicHomepageContent: async () => null, withoutHiddenHomepageSections: (content: unknown) => content }));
vi.mock("@/lib/public-club-time-zone", () => ({ readPublicClubTimeZone: async () => "America/Los_Angeles" }));
vi.mock("@/lib/academy-shell-branding", () => ({ loadAcademyShellBranding: async () => null }));
vi.mock("@/components/cinematic/CinematicShell", () => ({ default: () => null }));
vi.mock("@/components/cinematic/CinematicDisplayFont", () => ({ default: () => null }));
vi.mock("@/components/Nav", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/ClubContextProvider", () => ({ ClubContextProvider: () => null }));
vi.mock("@/components/ClubBrandingProvider", () => ({ ClubBrandingProvider: () => null }));
vi.mock("@/components/ClubTimeZoneProvider", () => ({ ClubTimeZoneProvider: () => null }));
vi.mock("@/components/TemplateFontScope", () => ({ default: () => null }));
vi.mock("@/components/sites/diverse-city/RouteLoadingSkeleton", () => ({ default: () => null }));
vi.mock("@/components/sites/diverse-city/Shell", () => ({ default: () => null }));

import TenantLayout from "@/app/%5Fclubs/[slug]/layout";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import CinematicSponsors from "@/components/cinematic/CinematicSponsors";
import { SiteTelemetry, useTelemetryEnabled } from "@/components/telemetry/TelemetryContext";
import PageBeacon from "@/components/telemetry/PageBeacon";
import { HomepagePreviewContext, type HomepagePreviewValue } from "@/lib/homepage-editor/preview-context";
import type { DBSiteSponsorLogo } from "@/lib/db-types";

const sponsor = (id: string, name: string, website_url: string | null): DBSiteSponsorLogo => ({
  id, placement: "carousel", name, logo_url: `https://example.test/${name}.png`, sort_order: 0, created_at: "", show_on_homepage: true, show_in_footer: false, website_url,
});
const SPONSORS = [
  sponsor(UUID_LINKED, "Tepito", "https://tepito.example"),
  sponsor(UUID_PLAIN, "Pack", null),
  sponsor(FALLBACK, "Chronic", "https://forced.example"),
];

const strip = (sponsors = SPONSORS) => createElement(CinematicSponsors, { sponsors, treatments: {}, heading: "Partners" });
const preview = (children: ReactNode) =>
  createElement(HomepagePreviewContext.Provider, { value: { draft: {}, videoSource: "", selection: null, allowedPieces: [], select: () => {} } as unknown as HomepagePreviewValue }, children);
// useId gives every render its own filter id; the rest of the markup must match exactly.
const html = (node: ReactElement) => renderToStaticMarkup(node).replace(/dark-lettering-[^"')]+/g, "dark-lettering-ID");

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  constructor() { FakeIntersectionObserver.instances.push(this); }
  observe() {} unobserve() {} disconnect() {}
}
const sponsorEl = (id: string) => ({ getAttribute: (name: string) => (name === "data-sponsor-id" ? id : null) });

/** Runs the strip's tracking effect against a root holding one database sponsor, the way the browser would after mount. */
function runTrackingEffect(): void {
  const tracking = mocks.effects.filter(({ deps }) => deps?.[2] === SPONSORS.map((s) => s.id).join(","));
  expect(tracking).toHaveLength(1);
  const rootRef = tracking[0].deps?.[3] as { current: unknown };
  rootRef.current = { querySelectorAll: () => [sponsorEl(UUID_LINKED)] };
  const cleanup = tracking[0].effect();
  if (typeof cleanup === "function") cleanup();
}

beforeEach(() => {
  mocks.effects.length = 0;
  FakeIntersectionObserver.instances.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  mocks.club.mockResolvedValue(CLUB);
  mocks.telemetry.mockResolvedValue(true);
  mocks.codeSite.mockReturnValue(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("sponsor strip markup", () => {
  const markup = html(strip());
  const anchors = markup.match(/<a [^>]*>/g) ?? [];

  it("links a database sponsor with a website to /r/<id> in both copies of the track", () => {
    expect(anchors).toHaveLength(2);
    for (const anchor of anchors) {
      expect(anchor).toContain(`href="/r/${UUID_LINKED}"`);
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="sponsored noopener"');
      expect(anchor).toContain('class="sponsor-link"');
      expect(anchor).toContain(`data-sponsor-id="${UUID_LINKED}"`);
      expect(anchor).toContain("display:flex;flex-shrink:0;text-decoration:none");
    }
  });

  it("keeps the original link in the tab order and takes the aria-hidden clone out of it", () => {
    expect(anchors[0]).not.toContain("tabindex");
    expect(anchors[1]).toContain('tabindex="-1"');
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(1);
  });

  it("keeps the image inside the link unchanged: sponsor name as alt, empty alt in the clone", () => {
    expect(markup).toContain(`<a href="/r/${UUID_LINKED}"`);
    expect(markup.match(/<a [^>]*><img [^>]*alt="Tepito"[^>]*\/><\/a>/g)).toHaveLength(1);
    expect(markup.match(/<a [^>]*><img [^>]*alt=""[^>]*\/><\/a>/g)).toHaveLength(1);
  });

  it("marks a database sponsor without a website for counting but does not link it", () => {
    expect(markup).not.toContain(`/r/${UUID_PLAIN}`);
    const images = markup.match(/<img [^>]*>/g) ?? [];
    expect(images.filter((image) => image.includes(`data-sponsor-id="${UUID_PLAIN}"`))).toHaveLength(2);
  });

  it("neither links nor marks a built-in fallback sponsor, even if it were given a website", () => {
    expect(markup).not.toContain(`/r/${FALLBACK}`);
    expect(markup).not.toContain(`data-sponsor-id="${FALLBACK}"`);
    expect(markup).toContain('alt="Chronic"');
  });

  it("puts data-sponsor-id on the outermost logo element only, never on the image inside a link", () => {
    const linkedImages = (markup.match(/<a [^>]*>(<img [^>]*>)<\/a>/g) ?? []).join("");
    expect(linkedImages.match(/data-sponsor-id=/g)).toHaveLength(2);
    expect(markup.match(/data-sponsor-id="/g)).toHaveLength(4);
  });

  it("renders the same markup inside SiteTelemetry or the preview, and nothing for an empty strip", () => {
    expect(html(createElement(SiteTelemetry, null, strip()))).toBe(markup);
    expect(html(preview(strip()))).toBe(markup);
    expect(html(strip([]))).toBe("");
  });

  it("leaves a strip of only fallback logos exactly as before: no links, no data-sponsor-id", () => {
    const plain = html(strip([sponsor(FALLBACK, "Chronic", null), sponsor("default-carousel-modern", "Modern", null)]));
    expect(plain).not.toContain("<a ");
    expect(plain).not.toContain("data-sponsor-id");
  });
});

describe("SiteTelemetry context", () => {
  const Probe = () => createElement("i", null, String(useTelemetryEnabled()));

  it("is off by default and on inside SiteTelemetry", () => {
    expect(html(createElement(Probe))).toBe("<i>false</i>");
    expect(html(createElement(SiteTelemetry, null, createElement(Probe)))).toBe("<i>true</i>");
  });

  it("mounts the page beacon alongside its children", () => {
    const node = SiteTelemetry({ children: createElement("p") }) as ReactElement<{ children: ReactNode[] }>;
    const kids = node.props.children as ReactElement[];
    expect(kids[0].type).toBe(PageBeacon);
    expect(kids[1].type).toBe("p");
  });
});

describe("sponsor strip tracking effect", () => {
  it("builds no IntersectionObserver without SiteTelemetry", () => {
    html(strip());
    runTrackingEffect();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("builds one inside SiteTelemetry on the public site", () => {
    html(createElement(SiteTelemetry, null, strip()));
    // Browser globals exist only once the page has loaded, after the server render above.
    vi.stubGlobal("window", Object.assign(new EventTarget(), { location: { pathname: "/" } }));
    vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }));
    runTrackingEffect();
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
  });

  it("builds none inside the homepage preview, even with SiteTelemetry", () => {
    html(createElement(SiteTelemetry, null, preview(strip())));
    runTrackingEffect();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("builds none when the browser has no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    html(createElement(SiteTelemetry, null, strip()));
    runTrackingEffect();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });
});

describe("club layout telemetry gating", () => {
  const PAGE = "page-slot";
  const walk = (node: unknown, match: (element: ReactElement) => boolean, found: ReactElement[] = []): ReactElement[] => {
    if (Array.isArray(node)) node.forEach((child) => walk(child, match, found));
    else if (node && typeof node === "object" && "props" in node) {
      const element = node as ReactElement<{ children?: ReactNode }>;
      if (match(element)) found.push(element);
      walk(element.props.children, match, found);
    }
    return found;
  };
  const layout = async () => (await TenantLayout({ children: createElement(PAGE), params: Promise.resolve({ slug: "rose-city" }) })) as ReactElement;
  const shells: Array<[string, () => void]> = [
    ["cinematic", () => { mocks.club.mockResolvedValue({ ...CLUB, presentationTemplateKey: "cinematic@2" }); }],
    ["academy", () => { mocks.club.mockResolvedValue({ ...CLUB, presentationTemplateKey: "classic" }); mocks.codeSite.mockReturnValue("diverse-city"); }],
    ["default", () => { mocks.club.mockResolvedValue({ ...CLUB, presentationTemplateKey: "classic" }); }],
  ];

  it.each(shells)("%s shell: wraps the page in SiteTelemetry once, inside the club context, when the add-on is on", async (_, setup) => {
    setup();
    const root = await layout();
    expect(root.type).toBe(ClubContextProvider);
    const telemetry = walk(root, (element) => element.type === SiteTelemetry);
    expect(telemetry).toHaveLength(1);
    expect(walk(telemetry[0], (element) => element.type === PAGE)).toHaveLength(1);
    expect(walk(root, (element) => element.type === PageBeacon)).toHaveLength(0);
    expect(mocks.telemetry).toHaveBeenCalledWith(CLUB.id);
  });

  it.each(shells)("%s shell: renders no provider and no beacon when the add-on is off", async (_, setup) => {
    setup();
    mocks.telemetry.mockResolvedValue(false);
    const root = await layout();
    expect(walk(root, (element) => element.type === SiteTelemetry)).toHaveLength(0);
    expect(walk(root, (element) => element.type === PageBeacon)).toHaveLength(0);
    expect(walk(root, (element) => element.type === PAGE)).toHaveLength(1);
  });

  it("checks the add-on once per request", async () => {
    await layout();
    expect(mocks.telemetry).toHaveBeenCalledTimes(1);
  });
});
