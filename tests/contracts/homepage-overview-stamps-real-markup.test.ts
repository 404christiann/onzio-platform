import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { homepageDraft } from "../fixtures/homepage-editor";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";
import { defaultCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { EDIT_TARGET_ATTRIBUTE } from "@/lib/admin-edit-targets";
import { HomepagePreviewContext } from "@/lib/homepage-editor/preview-context";
import type { HomepageDraft } from "@/lib/homepage-editor/model";
import { applyEditTargetStamps, watchEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
import { PREVIEW_PIECES } from "@/components/admin/homepage/homepage-parts";
import { HOMEPAGE_TARGETS, homepagePreviewStamps, priceRowTarget } from "@/components/admin/homepage/homepage-edit-targets";
import CinematicHome from "@/components/cinematic/CinematicHome";

/**
 * UI-PREVIEW-CLICK-HOMEPAGE: the Overview's preview stamps, run against the real public homepage markup
 * (CinematicHome, CinematicHero, CinematicEpisode, CinematicSponsors) rendered from a fixture draft, the same tree the
 * Overview's frames render. Each stamp must land on exactly the node that shows its field's draft text.
 */
let revamp: CinematicHomepageContent;
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "club-1", slug: "rose-city", name: "Rose City FC", storeEnabled: true }) }));
vi.mock("@/components/ClubTimeZoneProvider", () => ({ useClubTimeZone: () => "America/Los_Angeles" }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: null }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: revamp }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => createElement("img", { src, alt, className }) }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));
vi.mock("@/lib/queries", () => {
  const never = () => new Promise(() => undefined);
  return { fetchHomepageContent: never, fetchSchedule: never, fetchShopKitContent: never, fetchSiteSponsorLogos: never };
});
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: () => new Promise(() => undefined) }));

type Row = CinematicHomepageContent["prices"]["rows"][number];
const ROWS: Row[] = [
  { id: "general", label: "General Seats", price: "$5", description: "No bad view at Robinson", note: "Ages 3 and up", accent: "aqua" },
  { id: "pcc", label: "PCC Students", price: "Free", description: "Pasadena City College students", note: "Show your ID", accent: "none" },
  { id: "tennis", label: "Tennis Ball Throw", price: "$2", description: "Closest ball to the circle wins", note: "Each ball", accent: "lime" },
];

function fixtureDraft(rows: Row[] = ROWS): HomepageDraft {
  const content = defaultCinematicHomepageContent();
  content.raffle = { ...content.raffle, url: "https://media.test/raffle.webp", alt: "Raffle prizes" };
  content.ticket = { ...content.ticket, visible: true, url: "https://media.test/ticket.webp", alt: "Ticket and map" };
  content.match = { ...content.match, heading: "Next Home Match", buttonLabel: "Buy Tickets", emptyMessage: "No home match yet" };
  content.prices = { ...content.prices, heading: "Ticket Prices", rows: structuredClone(rows), footnote: "Tennis balls sold at the gate" };
  content.championship = { ...content.championship, league: "UPSL SoCal North", year: "2024", title: "Champions", body: "Rose City won the title.", trophy: { ...content.championship.trophy, url: "https://media.test/trophy.webp", alt: "Trophy" } };
  content.sponsors = { ...content.sponsors, heading: "Powered by our partners" };
  const base = homepageDraft();
  return {
    ...base,
    hero: { ...base.hero, eyebrow: "UPSL 2027", headline_line_one: "City of", headline_line_two: "Roses", intro: "Pasadena's club.", primary_cta_label: "Shop the kit", secondary_cta_label: "Meet the squad" },
    video: { ...base.video, eyebrow: "Season 1", title: "Behind the Rose", description: "Go behind the scenes." },
    revamp: content,
  };
}

/** Renders the real public homepage for a draft and runs the Overview's stamps over it. */
function stamped(draft: HomepageDraft) {
  revamp = draft.revamp!;
  const value = { playback: false, draft, videoSource: "https://video.test/episode.mp4", selection: null, allowedPieces: PREVIEW_PIECES, select: () => undefined };
  const root = parseStaticMarkup(renderToStaticMarkup(createElement(HomepagePreviewContext.Provider, { value }, createElement(CinematicHome, { initialHeroContent: null }))));
  applyEditTargetStamps(root as unknown as ParentNode, homepagePreviewStamps(draft));
  return root;
}
const nodesFor = (root: StaticElement, id: string) => [...root.descendants()].filter(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) === id);
const only = (root: StaticElement, id: string) => {
  const nodes = nodesFor(root, id);
  expect(nodes, id).toHaveLength(1);
  return nodes[0];
};
const text = (node: StaticElement) => node.textContent.replace(/\s+/g, " ").trim();

describe("Overview stamps on the real public homepage markup", () => {
  const draft = fixtureDraft();
  const root = stamped(draft);

  it("hero: each field's id is on the node showing that field", () => {
    expect(text(only(root, HOMEPAGE_TARGETS.heroEyebrow))).toBe("UPSL 2027");
    const heading = only(root, HOMEPAGE_TARGETS.heroLineOne);
    expect(heading.tagName).toBe("h1");
    expect(text(heading)).toBe("City ofRoses");
    expect(text(only(root, HOMEPAGE_TARGETS.heroIntro))).toBe("Pasadena's club.");
    expect(text(only(root, HOMEPAGE_TARGETS.heroPrimaryCta))).toBe("Shop the kit");
    expect(text(only(root, HOMEPAGE_TARGETS.heroSecondaryCta))).toBe("Meet the squad");
  });

  it("match, prices heading and footnote, championship, video and partners heading", () => {
    expect(text(only(root, HOMEPAGE_TARGETS.matchHeading))).toBe("Next Home Match");
    expect(text(only(root, HOMEPAGE_TARGETS.matchButton))).toBe("Buy Tickets");
    // Before Schedule answers, the empty-match line shows its loading text in the same node.
    expect(only(root, HOMEPAGE_TARGETS.matchEmpty).matches("p.venue[role=status]")).toBe(true);
    expect(text(only(root, HOMEPAGE_TARGETS.pricesHeading))).toBe("Ticket Prices");
    expect(text(only(root, HOMEPAGE_TARGETS.pricesFootnote))).toBe("Tennis balls sold at the gate");
    expect(text(only(root, HOMEPAGE_TARGETS.championshipLeague))).toBe("UPSL SoCal North");
    expect(text(only(root, HOMEPAGE_TARGETS.championshipTitle))).toBe("2024Champions");
    expect(text(only(root, HOMEPAGE_TARGETS.championshipBody))).toBe("Rose City won the title.");
    expect(text(only(root, HOMEPAGE_TARGETS.videoEyebrow))).toBe("Season 1");
    expect(text(only(root, HOMEPAGE_TARGETS.videoTitle))).toBe("Behind the Rose");
    expect(text(only(root, HOMEPAGE_TARGETS.videoDescription))).toBe("Go behind the scenes.");
    expect(text(only(root, HOMEPAGE_TARGETS.sponsorsHeading))).toBe("Powered by our partners");
  });

  it("images: the raffle, ticket and trophy images carry their Describe-this-image ids", () => {
    expect(only(root, HOMEPAGE_TARGETS.raffleImage).getAttribute("src")).toBe("https://media.test/raffle.webp");
    expect(only(root, HOMEPAGE_TARGETS.ticketImage).getAttribute("src")).toBe("https://media.test/ticket.webp");
    expect(only(root, HOMEPAGE_TARGETS.championshipImage).getAttribute("src")).toBe("https://media.test/trophy.webp");
  });

  it("each ticket option's name, price, description and small print carry that row's ids", () => {
    for (const row of ROWS) {
      expect(text(only(root, priceRowTarget(row.id, "label")))).toBe(`${row.label} ${row.price}`);
      expect(only(root, priceRowTarget(row.id, "label")).tagName).toBe("h3");
      expect(text(only(root, priceRowTarget(row.id, "price")))).toBe(row.price);
      expect(text(only(root, priceRowTarget(row.id, "description")))).toBe(row.description);
      expect(text(only(root, priceRowTarget(row.id, "note")))).toBe(row.note);
    }
  });

  it("every declared field is stamped except the two that share another field's node", () => {
    const unstamped = Object.entries(HOMEPAGE_TARGETS).filter(([, id]) => nodesFor(root, id).length === 0).map(([name]) => name);
    // Line two is text inside Line one's h1; the year is text inside the championship heading.
    expect(unstamped.sort()).toEqual(["championshipYear", "heroLineTwo"]);
  });

  it("Schedule-owned text and the photos carry no id", () => {
    for (const node of root.querySelectorAll(".match-card .teams, .match-card .match-date, .cinematic-slides")) {
      expect(node.getAttribute(EDIT_TARGET_ATTRIBUTE)).toBeNull();
    }
  });
});

describe("Overview stamps follow the draft", () => {
  it("after a reorder, each ticket option's nodes carry its own row id", () => {
    const reordered = [ROWS[2], ROWS[0], ROWS[1]];
    const root = stamped(fixtureDraft(reordered));
    const items = root.querySelectorAll(".prices-card .price-item");
    expect(items.map(item => item.querySelectorAll(":scope > h3")[0].getAttribute(EDIT_TARGET_ATTRIBUTE))).toEqual(reordered.map(row => priceRowTarget(row.id, "label")));
    expect(text(only(root, priceRowTarget("tennis", "description")))).toBe(ROWS[2].description);
  });

  it("a newly added ticket option is stamped", () => {
    const added = { id: "family", label: "Family Pack", price: "$15", description: "Two adults, two kids", note: "Weekend only", accent: "none" as const };
    const root = stamped(fixtureDraft([...ROWS, added]));
    expect(text(only(root, priceRowTarget("family", "price")))).toBe("$15");
    expect(text(only(root, priceRowTarget("family", "note")))).toBe("Weekend only");
  });

  it("the Overview re-stamps when the draft changes and whenever the frame's content changes", () => {
    const preview = readFileSync("components/admin/homepage/HomepageOverviewPreview.tsx", "utf8");
    expect(preview).toMatch(/useEffect\(\(\) => body \? watchEditTargetStamps\(body, homepagePreviewStamps\(draft\)\) : undefined, \[body, draft\]\);/);
  });
});

describe("watchEditTargetStamps", () => {
  function environment() {
    const frames: (() => void)[] = [];
    let onChange: (() => void) | null = null;
    let disconnected = false;
    return {
      frames, change: () => onChange?.(), disconnected: () => disconnected,
      env: {
        requestFrame: (callback: () => void) => { frames.push(callback); return frames.length; },
        cancelFrame: (handle: number) => { frames[handle - 1] = () => undefined; },
        observe: (_: Node, callback: () => void) => { onChange = callback; return { disconnect: () => { disconnected = true; } }; },
      },
    };
  }

  it("stamps on the next frame, again after the content changes (content that renders later), and stops on cleanup", () => {
    const draft = fixtureDraft();
    const root = stamped(draft);
    for (const node of root.descendants()) node.removeAttribute(EDIT_TARGET_ATTRIBUTE);
    const world = environment();
    const stop = watchEditTargetStamps(root as unknown as Node & ParentNode, homepagePreviewStamps(draft), world.env);
    expect(nodesFor(root, HOMEPAGE_TARGETS.heroLineOne)).toHaveLength(0);
    world.frames.at(-1)!();
    expect(nodesFor(root, HOMEPAGE_TARGETS.heroLineOne)).toHaveLength(1);
    // A later render (Schedule, logos) replaces nodes: the observer stamps them on the next frame.
    for (const node of root.descendants()) node.removeAttribute(EDIT_TARGET_ATTRIBUTE);
    const before = world.frames.length;
    world.change();
    expect(world.frames.length).toBe(before + 1);
    // The superseded frame is cancelled; only the new one stamps.
    world.frames[before - 1]();
    expect(nodesFor(root, HOMEPAGE_TARGETS.heroLineOne)).toHaveLength(0);
    world.frames.at(-1)!();
    expect(nodesFor(root, HOMEPAGE_TARGETS.heroLineOne)).toHaveLength(1);
    stop();
    expect(world.disconnected()).toBe(true);
  });
});
