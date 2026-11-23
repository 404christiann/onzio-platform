import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";
import { EDIT_TARGET_ATTRIBUTE } from "@/lib/admin-edit-targets";
import { applyEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
import { matchPreviewFixtures } from "@/components/admin/schedule/rose-city/match-preview-fixtures";
import { matchTarget, matchThumbStamps, type MatchField } from "@/components/admin/schedule/rose-city/match-edit-targets";
import type { Fixture } from "@/lib/data";

/**
 * UI-PREVIEW-CLICK-SCHEDULE: the match card stamps, run against the real public Schedule (CinematicSchedule) rendered the way
 * a card renders it: the match itself, plus the Next match when the preview needs it for "Next" styling (that row is hidden by
 * CSS and belongs to another card). Each stamp must land on exactly the node that shows its field, only inside the match's own
 * row, found by the row's data-fixture-id and not by where the row is in the list.
 */
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => createElement("img", { src, alt, className }) }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));
import CinematicSchedule from "@/components/cinematic/CinematicSchedule";

beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.test"); });

const TZ = "America/Los_Angeles";
const NOW = new Date("2027-05-20T12:00:00-07:00");
const VIDEO = "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0";
const base = { opponentLogoUrl: null, venue: "Robinson Stadium", city: "Pasadena", state: "CA", scorers: [], time: "19:45:00" };
const PLAYED = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa", NEXT = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb", LATER = "33333333-cccc-4ccc-8ccc-cccccccccccc", DRAFT = "new:2";
const played: Fixture = { ...base, id: PLAYED, date: "2027-05-02", opponent: "Ocelot FC", competition: "UPSL", home: true, address: "1570 E Colorado Blvd, Pasadena, CA", roseCityScore: 2, opponentScore: 1,
  replayVideoUrl: VIDEO, sponsorName: "Tepito Coffee", sponsorLogoUrl: "https://media.test/sponsor.png", leagueLogoUrl: "https://media.test/league.png" };
const next: Fixture = { ...base, id: NEXT, date: "2027-05-25", opponent: "LA Sol Athletics", competition: "NPSL", home: false, venue: "Jesse Owens", address: "", roseCityScore: null, opponentScore: null, replayVideoUrl: "" };
const later: Fixture = { ...base, id: LATER, date: "2027-06-15", opponent: "AYSD D1", competition: "", home: true, address: "", roseCityScore: null, opponentScore: null, replayVideoUrl: VIDEO };
const unsaved: Fixture = { ...base, id: DRAFT, date: "2027-06-01", opponent: "Draft FC", competition: "", home: true, address: "", roseCityScore: null, opponentScore: null, replayVideoUrl: "" };

/** A card exactly as the editor renders it: the match (+ Next) through matchPreviewFixtures, the public Schedule at a fixed "now". */
function card(own: Fixture, nextFixture: Fixture | null, order: "natural" | "reversed" = "natural") {
  const { fixtures } = matchPreviewFixtures(own, nextFixture, TZ, NOW);
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", null,
    createElement(CinematicSchedule, { schedule: { fixtures: order === "reversed" ? [...fixtures].reverse() : fixtures, seasonLabel: "", timeZone: TZ }, initialNow: NOW }))));
  applyEditTargetStamps(root as unknown as ParentNode, matchThumbStamps(own.id!));
  return root;
}
const row = (root: StaticElement, id: string) => root.querySelectorAll(".fixture-item").find(item => item.getAttribute("data-fixture-id") === id)!;
const nodesFor = (root: StaticElement, id: string) => [...root.descendants()].filter(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) === id);
const only = (root: StaticElement, id: string) => {
  const nodes = nodesFor(root, id);
  expect(nodes, id).toHaveLength(1);
  return nodes[0];
};
const text = (node: StaticElement) => node.textContent.replace(/\s+/g, " ").trim();
const stampedIds = (root: StaticElement) => [...root.descendants()].flatMap(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) ?? []);
const t = (key: string, field: MatchField) => matchTarget(key, field);

describe("Schedule match card: stamps on the real public markup", () => {
  const root = card(played, next);

  it("a played match's date, opponent, home or away tag, venue line, kickoff, result and watch cell are each stamped on their own node", () => {
    expect(only(root, t(PLAYED, "date")).getAttribute("class")).toBe("fixture-date");
    expect(text(only(root, t(PLAYED, "date")))).toBe("May 2, 2027");
    expect(only(root, t(PLAYED, "opponent")).tagName).toBe("h2");
    expect(text(only(root, t(PLAYED, "opponent")))).toBe("Ocelot FC");
    expect(text(only(root, t(PLAYED, "homeAway")))).toBe("Home");
    expect(text(only(root, t(PLAYED, "venue")))).toBe("Robinson Stadium - Pasadena, CA");
    expect(text(only(root, t(PLAYED, "time")))).toContain("7:45");
    expect(only(root, t(PLAYED, "clubScore")).getAttribute("class")).toBe("fixture-result");
    expect(text(only(root, t(PLAYED, "clubScore")))).toContain("2-1");
    expect(only(root, t(PLAYED, "replayVideo")).getAttribute("class")).toBe("fixture-watch");
    expect(only(root, t(PLAYED, "replayVideo")).querySelectorAll("a")).toHaveLength(1);
  });

  it("Directions carries the address, the league cell the competition with its logo inside, the Match Summary cell the summary", () => {
    expect(only(root, t(PLAYED, "address")).getAttribute("class")).toBe("fixture-directions");
    expect(only(root, t(PLAYED, "competition")).getAttribute("class")).toBe("fixture-league");
    const logo = only(root, t(PLAYED, "leagueLogo"));
    expect(logo.tagName).toBe("img");
    expect(logo.getAttribute("src")).toBe("https://media.test/league.png");
    expect(logo.closest(".fixture-league")).toBe(only(root, t(PLAYED, "competition")));
    const summary = only(root, t(PLAYED, "timeline"));
    expect(summary.getAttribute("class")).toBe("fixture-summary");
    expect(summary.querySelectorAll("a")).toHaveLength(1);
  });

  it("the opponent crest and the sponsor strip: the crest node, the strip for the name, its picture for the logo", () => {
    expect(only(root, t(PLAYED, "opponentLogo")).classList.contains("schedule-opponent-crest")).toBe(true);
    expect(only(root, t(PLAYED, "name")).getAttribute("class")).toBe("match-sponsor");
    const logo = only(root, t(PLAYED, "logo"));
    expect(logo.getAttribute("src")).toBe("https://media.test/sponsor.png");
    expect(logo.closest(".match-sponsor")).toBe(only(root, t(PLAYED, "name")));
  });

  it("a row the card draws for Next (hidden by CSS) never carries this match's stamps, and stamps every one of them inside its own row", () => {
    expect(root.querySelectorAll(".fixture-item")).toHaveLength(2);
    expect(stampedIds(row(root, NEXT))).toEqual([]);
    const own = row(root, PLAYED);
    for (const node of root.descendants()) if (node.hasAttribute(EDIT_TARGET_ATTRIBUTE)) expect(node.closest(".fixture-item"), node.getAttribute(EDIT_TARGET_ATTRIBUTE)!).toBe(own);
    expect(new Set(stampedIds(root)).size).toBe(stampedIds(root).length);
    expect(stampedIds(root).every(id => id.startsWith(`schedule.`) && id.includes(`.row:${PLAYED}.`))).toBe(true);
  });

  it("the Next match's own card stamps Next's row, not the played match's", () => {
    const nextCard = card(next, null);
    expect(nextCard.querySelectorAll(".fixture-item")).toHaveLength(1);
    expect(text(only(nextCard, t(NEXT, "opponent")))).toBe("LA Sol Athletics");
    expect(text(only(nextCard, t(NEXT, "homeAway")))).toBe("Away");
    expect(text(only(nextCard, t(NEXT, "venue")))).toBe("Jesse Owens - Pasadena, CA");
    expect(stampedIds(nextCard).every(id => id.includes(`.row:${NEXT}.`))).toBe(true);
  });

  it("an unplayed match keeps the result and the watch cells stamped (the result cell draws nothing visible until a score exists, so only Watch is clickable), and drops what it does not draw", () => {
    const upcoming = card(next, null);
    expect(only(upcoming, t(NEXT, "clubScore")).getAttribute("class")).toBe("fixture-result");
    expect(text(only(upcoming, t(NEXT, "clubScore")))).toBe("Not played");
    expect(only(upcoming, t(NEXT, "replayVideo")).querySelectorAll("a")).toHaveLength(0);
    expect(only(upcoming, t(NEXT, "timeline")).querySelectorAll("a")).toHaveLength(0);
    for (const field of ["address", "leagueLogo", "name", "logo"] as const) expect(nodesFor(upcoming, t(NEXT, field)), field).toHaveLength(0);
  });

  it("a match with no competition keeps its league cell stamped (the dash), a match with no sponsor has no sponsor strip to click", () => {
    const bare = card(later, next);
    expect(text(only(bare, t(LATER, "competition")))).toBe("—");
    expect(nodesFor(bare, t(LATER, "name"))).toHaveLength(0);
  });

  it("a match later than Next is previewed alone (the public page would not list it) and is still stamped", () => {
    const { listed } = matchPreviewFixtures(later, next, TZ, NOW);
    expect(listed).toBe(false);
    const alone = card(later, next);
    expect(alone.querySelectorAll(".fixture-item")).toHaveLength(1);
    expect(text(only(alone, t(LATER, "opponent")))).toBe("AYSD D1");
  });

  it("a match not saved yet is keyed by its new: key, and its stamps never reach another match", () => {
    const draft = card(unsaved, next);
    expect(text(only(draft, t(DRAFT, "opponent")))).toBe("Draft FC");
    expect(stampedIds(draft).every(id => id.includes(".row:new_2."))).toBe(true);
    expect(draft.querySelectorAll(".fixture-item").every(item => item.getAttribute("data-fixture-id") === DRAFT)).toBe(true);
  });

  it("rows are found by their id, not their position: reversing the fixtures moves nothing", () => {
    const natural = card(played, next), reversed = card(played, next, "reversed");
    expect(stampedIds(reversed).sort()).toEqual(stampedIds(natural).sort());
    expect(text(only(reversed, t(PLAYED, "opponent")))).toBe("Ocelot FC");
    expect(stampedIds(row(reversed, NEXT))).toEqual([]);
    // The same stamps on a list holding someone else's match stamp nothing.
    const stranger = parseStaticMarkup(renderToStaticMarkup(createElement(CinematicSchedule, { schedule: { fixtures: [next], seasonLabel: "", timeZone: TZ }, initialNow: NOW })));
    expect(applyEditTargetStamps(stranger as unknown as ParentNode, matchThumbStamps(PLAYED))).toBe(0);
  });

  it("nothing is stamped inside the chrome a card hides (page heading, column titles, note, list numbers, pagination)", () => {
    const hidden = [".schedule-heading", ".schedule-columns", ".schedule-disclaimer", ".schedule-pagination", ".fixture-number"];
    const stamped = [...root.descendants()].filter(node => node.hasAttribute(EDIT_TARGET_ATTRIBUTE));
    expect(stamped.length).toBeGreaterThan(0);
    for (const node of stamped) for (const selector of hidden) expect(node.closest(selector), `${node.getAttribute(EDIT_TARGET_ATTRIBUTE)} is inside ${selector}`).toBeNull();
    for (const selector of hidden) for (const node of root.querySelectorAll(selector)) expect(node.hasAttribute(EDIT_TARGET_ATTRIBUTE), selector).toBe(false);
  });

  it("every field the card can draw has a stamp on the fully filled match", () => {
    const drawn: MatchField[] = ["date", "opponent", "opponentLogo", "homeAway", "venue", "address", "time", "competition", "leagueLogo", "clubScore", "timeline", "replayVideo", "name", "logo"];
    const present = new Set(stampedIds(root));
    expect(drawn.filter(field => !present.has(t(PLAYED, field)))).toEqual([]);
  });

  it("a stamp re-applied after the draft changes moves with the node, and clears nothing it does not own", () => {
    const again = card(played, next);
    const before = stampedIds(again).length;
    applyEditTargetStamps(again as unknown as ParentNode, matchThumbStamps(PLAYED));
    expect(stampedIds(again)).toHaveLength(before);
  });
});
