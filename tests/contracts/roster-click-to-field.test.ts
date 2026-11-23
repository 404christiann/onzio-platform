import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, resolveEditTarget } from "@/lib/admin-edit-targets";
import { parseStaticMarkup } from "../helpers/static-dom";
import type { Player, PlayerForm } from "@/components/admin/roster/roster-model";
import { FIELD_STAT_FIELDS, KEEPER_STAT_FIELDS } from "@/components/admin/roster/rose-city/rose-city-roster-model";
import { RosterPlayerCard } from "@/components/admin/roster/rose-city/RosterPlayerCard";
import { PlayerBackgroundFields, PlayerBasicsFields, PlayerDetailsFields, PlayerVisibilityFields } from "@/components/admin/roster/rose-city/RosterPlayerFields";
import { RosterStatsSection } from "@/components/admin/roster/rose-city/RosterStatsSection";
import {
  ROSTER_FIELD_SECTION, cardStatField, clickTarget, rosterFieldAt, rosterSectionOf, rosterTarget, statField, type RosterField,
} from "@/components/admin/roster/rose-city/roster-edit-targets";

/**
 * UI-PREVIEW-CLICK-ROSTER: every declared Rose City Roster field has exactly one control in the player dialog carrying the id a
 * card click focuses it by; the card stamps its own fields with the same ids, keyed by the player's uuid; the page opens the
 * clicked field's section and asks the dialog to focus it.
 */
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/NationalityFlag", () => ({ default: ({ nationality }: { nationality: string }) => createElement("i", { "data-flag": nationality }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt, fallback: _f, ...rest }: { src: string; alt: string; fallback?: string }) => createElement("img", { src, alt, ...rest }) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const noop = () => undefined;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const player = (over: Partial<Player> = {}): Player => ({
  id: A, number: 9, name: "Ada Forward", caption: "", nationality: "Brazil", position: "Forward", height: "5'9\"", weight: "150 lbs", hometown: "Altadena, CA",
  age: 24, school: "UP", previous_club: "Rose FC", photo_url: "", active: true, bio: "Bio", pronunciation: "", foot: "Left", ...over,
});
const form = (over: Partial<PlayerForm> = {}): PlayerForm => { const { id: _i, active: _a, ...rest } = player(); return { ...rest, ...over }; };
const stampsIn = (markup: string) => [...markup.matchAll(new RegExp(`${EDIT_TARGET_ATTRIBUTE}="([^"]+)"`, "g"))].map(match => match[1]);
const around = (markup: string, target: string) => {
  const at = markup.indexOf(`${EDIT_TARGET_ATTRIBUTE}="${target}"`);
  expect(at, target).toBeGreaterThan(-1);
  return markup.slice(Math.max(0, markup.lastIndexOf("<", at)), at + 700);
};
const id = (section: string, field: string, row = A) => `roseCityRoster.${section}.row:${row}.${field}`;

const SECTION_FIELDS = {
  basics: ["photo", "name", "number", "position", "nationality", "pronunciation"],
  details: ["height", "weight", "age", "hometown", "foot", "captain"],
  background: ["school", "previousClub", "bio"],
  visibility: ["visible"],
} as const;
const FIELD_STATS = ["goals", "assists", "tackles", "offsides", "fouls", "foulsSuffered", "starts", "yellow", "red", "mins"];
const KEEPER_STATS = ["goalsAgainst", "saves", "cleanSheets", "starts", "yellow", "red", "mins"];

const common = { onChange: noop, problems: {} };
const UNSAVED = "unsaved";
/** `row` null is a player who is not saved yet (no id). */
const dialogMarkup = (section: keyof typeof SECTION_FIELDS, row: string | null = A, f = form(), playerId = row ?? undefined) => renderToStaticMarkup(
  section === "basics" ? createElement(PlayerBasicsFields, { ...common, playerId, form: f, photoPreview: null, uploading: false, onPhotoChange: noop, onPhotoPendingChange: noop })
    : section === "details" ? createElement(PlayerDetailsFields, { ...common, playerId, form: f })
      : section === "background" ? createElement(PlayerBackgroundFields, { playerId, form: f, onChange: noop })
        : createElement(PlayerVisibilityFields, { playerId, active: true, disabled: false, onChange: noop }));
const statsState = (keeper: boolean) => ({
  seasons: [], selectedId: "", loading: false, error: null, dirty: false, setStat: noop, changeSeason: async () => undefined, save: async () => true,
  stats: Object.fromEntries((keeper ? KEEPER_STAT_FIELDS : FIELD_STAT_FIELDS).map(([key], index) => [key, index + 3])),
}) as never;
const statsMarkup = (keeper: boolean, playerId = A) => renderToStaticMarkup(createElement(RosterStatsSection, { playerId, keeper, state: statsState(keeper) }));

describe("the registry", () => {
  const spec = EDIT_TARGET_REGISTRY.roseCityRoster;
  it("is the Roster route, with the player dialog's sections, every field keyed by the player's row", () => {
    expect(spec.route).toBe("/admin/roster");
    expect(Object.keys(spec.sections)).toEqual(["basics", "details", "background", "stats", "photos", "visibility"]);
    for (const [section, fields] of Object.entries(SECTION_FIELDS)) {
      expect(spec.sections[section].fields).toBeUndefined();
      expect(spec.sections[section].rowFields).toEqual(fields);
    }
    expect(new Set(spec.sections.stats.rowFields)).toEqual(new Set([...FIELD_STATS, ...KEEPER_STATS]));
    expect(spec.sections.photos).toEqual({});
  });
  it("is the one new entry in the shared registry: two lines in admin-edit-targets.ts", () => {
    const shared = read("lib/admin-edit-targets.ts");
    expect(shared).toContain('import { ROSE_CITY_ROSTER_EDIT_TARGETS } from "@/lib/edit-targets/roster";');
    expect(shared).toContain("...ROSE_CITY_ROSTER_EDIT_TARGETS,");
  });
  it("every field maps to the section that holds its control", () => {
    for (const [section, fields] of Object.entries({ ...SECTION_FIELDS, stats: spec.sections.stats.rowFields })) for (const field of fields ?? []) {
      expect(ROSTER_FIELD_SECTION[field as RosterField], field).toBe(section);
      expect(resolveEditTarget(rosterTarget(A, field as RosterField)), field).toMatchObject({ section, field, row: A });
    }
    expect(Object.keys(ROSTER_FIELD_SECTION).sort()).toEqual(Object.values(spec.sections).flatMap(section => section.rowFields ?? []).sort());
  });
});

describe("every declared field has exactly one control in the dialog", () => {
  it.each(Object.keys(SECTION_FIELDS) as (keyof typeof SECTION_FIELDS)[])("%s: each field is stamped once under the player's uuid, and nothing else is", section => {
    for (const row of [A, B]) {
      const stamped = stampsIn(dialogMarkup(section, row));
      expect([...stamped].sort()).toEqual(SECTION_FIELDS[section].map(field => id(section, field, row)).sort());
      expect(new Set(stamped).size).toBe(stamped.length);
    }
  });
  it.each([[false, FIELD_STATS], [true, KEEPER_STATS]] as const)("stats (keeper %s): each stat the dialog shows is stamped once, on its own input", (keeper, fields) => {
    const markup = statsMarkup(keeper);
    expect([...stampsIn(markup)].sort()).toEqual(fields.map(field => id("stats", field)).sort());
    for (const [key] of keeper ? KEEPER_STAT_FIELDS : FIELD_STAT_FIELDS) {
      expect(around(markup, id("stats", statField(key)))).toMatch(new RegExp(`for="roster-stat-${key}"`));
    }
  });
  it("a player who is not saved yet (no id) has no stamps", () => {
    for (const section of Object.keys(SECTION_FIELDS) as (keyof typeof SECTION_FIELDS)[]) expect(stampsIn(dialogMarkup(section, null))).toEqual([]);
  });
  it("each control's id is on the control the label names", () => {
    const basics = dialogMarkup("basics");
    expect(around(basics, id("basics", "name"))).toMatch(/>Name<[\s\S]*value="Ada Forward"/);
    expect(around(basics, id("basics", "number"))).toMatch(/>Jersey number<[\s\S]*value="9"/);
    expect(around(basics, id("basics", "nationality"))).toMatch(/>Nationality</);
    expect(around(basics, id("basics", "pronunciation"))).toMatch(/>Pronunciation</);
    expect(around(basics, id("basics", "photo"))).toMatch(/aria-label="Player photo"/);
    const details = dialogMarkup("details");
    expect(around(details, id("details", "height"))).toMatch(/>Height<[\s\S]*value="5&#x27;9&quot;"/);
    expect(around(details, id("details", "weight"))).toMatch(/>Weight<[\s\S]*value="150 lbs"/);
    expect(around(details, id("details", "age"))).toMatch(/>Age<[\s\S]*value="24"/);
    expect(around(details, id("details", "hometown"))).toMatch(/>Hometown<[\s\S]*value="Altadena, CA"/);
    expect(around(details, id("details", "foot"))).toMatch(/>Preferred foot</);
    expect(around(details, id("details", "captain"))).toMatch(/<b id="player-captain-label">Captain<\/b>/);
    const background = dialogMarkup("background");
    expect(around(background, id("background", "school"))).toMatch(/>School<[\s\S]*value="UP"/);
    expect(around(background, id("background", "previousClub"))).toMatch(/>Previous club<[\s\S]*value="Rose FC"/);
    expect(around(background, id("background", "bio"))).toMatch(/>Bio<[\s\S]*Bio/);
    expect(around(dialogMarkup("visibility"), id("visibility", "visible"))).toMatch(/Show on the public roster/);
  });
  it("the position id sits on the chosen position's button, so focus lands on the one that is pressed", () => {
    for (const [position, abbr] of [["Goalkeeper", "GK"], ["Midfielder", "MF"], ["Forward", "FW"]] as const) {
      const markup = dialogMarkup("basics", A, form({ position }));
      expect(stampsIn(markup).filter(stamp => stamp.endsWith(".position"))).toHaveLength(1);
      expect(around(markup, id("basics", "position"))).toMatch(new RegExp(`^[^>]*>${abbr}</button>`));
      expect(around(markup, id("basics", "position"))).toMatch(/^[^>]*aria-pressed="true"/);
    }
  });
  it("keeps the static ids FIELD_SECTION's validation jump relies on", () => {
    expect(dialogMarkup("basics")).toMatch(/id="player-name"[\s\S]*id="player-number"[\s\S]*id="player-nationality"/);
    expect(dialogMarkup("details")).toMatch(/id="player-hometown"[\s\S]*id="player-height"|id="player-height"[\s\S]*id="player-hometown"/);
  });
});

describe("the card stamps its own fields", () => {
  const SEASON = { goals: 4, assists: 2, mins: 540 };
  /** `totals` null: the season totals have not loaded. */
  const card = (p: Player, totals: Record<string, number> | null = SEASON) => renderToStaticMarkup(createElement(RosterPlayerCard, {
    player: p, totals: totals ?? undefined, flash: false, switching: false, onEdit: noop, onVisibleChange: noop,
  }));
  const dom = (markup: string) => parseStaticMarkup(markup);
  const nodeFor = (markup: string, target: string) => {
    const nodes = dom(markup).querySelectorAll(`[${EDIT_TARGET_ATTRIBUTE}]`).filter(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) === target);
    expect(nodes, target).toHaveLength(1);
    return nodes[0];
  };
  const text = (node: { textContent: string }) => node.textContent.replace(/\s+/g, " ").trim();

  it("a field player's card: photo, number, flag, name, position, hometown and the three stats, each under the player's uuid", () => {
    const markup = card(player());
    expect([...stampsIn(markup)].sort()).toEqual(["photo", "number", "nationality", "name", "hometown", "position", "goals", "assists", "mins"].map(field => rosterTarget(A, field as RosterField)).sort());
    expect(nodeFor(markup, rosterTarget(A, "number")).textContent).toBe("9");
    expect(text(nodeFor(markup, rosterTarget(A, "name")))).toBe("Ada Forward");
    expect(nodeFor(markup, rosterTarget(A, "position")).textContent).toBe("FW");
    expect(text(nodeFor(markup, rosterTarget(A, "hometown")))).toBe("FW · Altadena, CA");
    expect(nodeFor(markup, rosterTarget(A, "nationality")).querySelectorAll("[data-flag]")).toHaveLength(1);
    expect(nodeFor(markup, rosterTarget(A, "photo")).classList.contains("portrait") || nodeFor(markup, rosterTarget(A, "photo")).querySelectorAll("img").length === 1).toBe(true);
    expect(text(nodeFor(markup, rosterTarget(A, "goals")))).toBe("4Goals");
    expect(text(nodeFor(markup, rosterTarget(A, "assists")))).toBe("2Assists");
    expect(text(nodeFor(markup, rosterTarget(A, "mins")))).toBe("540Mins");
  });

  it("a goalkeeper's strip is Saves, Clean sheets, Mins, each its own stat", () => {
    const markup = card(player({ position: "Goalkeeper", name: "Gus Keeper" }), { saves: 31, clean_sheets: 5, mins: 900 });
    expect(text(nodeFor(markup, rosterTarget(A, "saves")))).toBe("31Saves");
    expect(text(nodeFor(markup, rosterTarget(A, "cleanSheets")))).toBe("5Clean sheets");
    expect(text(nodeFor(markup, rosterTarget(A, "mins")))).toBe("900Mins");
    expect(stampsIn(markup).some(stamp => stamp.endsWith(".goals") || stamp.endsWith(".assists"))).toBe(false);
  });

  it("only the player's own uuid is ever stamped: another player's card carries only its own id", () => {
    const markup = card(player({ id: B, name: "Bea Defender", position: "Defender" }));
    expect(stampsIn(markup).length).toBeGreaterThan(5);
    expect(stampsIn(markup).every(stamp => stamp.includes(`.row:${B}.`) && !stamp.includes(A))).toBe(true);
  });

  it("the captain mark is stamped Captain (details); a card without one, a flag or season totals leaves those nodes unstamped", () => {
    const captain = card(player({ caption: "(C)" }));
    expect(text(nodeFor(captain, rosterTarget(A, "captain")))).toBe("C");
    expect(stampsIn(card(player())).some(stamp => stamp.endsWith(".captain"))).toBe(false);
    expect(stampsIn(card(player({ caption: "VC" }))).some(stamp => stamp.endsWith(".captain"))).toBe(false);
    expect(stampsIn(card(player({ nationality: "" }))).some(stamp => stamp.endsWith(".nationality"))).toBe(false);
    expect(stampsIn(card(player(), null)).some(stamp => /\.(goals|assists|mins)$/.test(stamp))).toBe(false);
  });

  it("the footer's Shown switch and the Edit button are never stamped", () => {
    const li = dom(card(player())).querySelectorAll("li")[0];
    const foot = li.children[li.children.length - 1];
    expect(foot.tagName).toBe("div");
    expect(foot.querySelectorAll("button").length).toBeGreaterThan(0);
    expect(foot.querySelectorAll(`[${EDIT_TARGET_ATTRIBUTE}]`)).toHaveLength(0);
    const face = li.querySelectorAll("button").find(node => node.hasAttribute("data-kit-edit"))!;
    expect(face.hasAttribute(EDIT_TARGET_ATTRIBUTE)).toBe(false);
  });

  it("the stats a card shows come from the same keys as the dialog: Goals, Assists, Saves, Clean sheets and Mins are editable there; nothing else is stamped", () => {
    expect(["Goals", "Assists", "Saves", "Clean sheets", "Mins"].map(label => cardStatField(label))).toEqual(["goals", "assists", "saves", "cleanSheets", "mins"]);
    expect(cardStatField("Tackles")).toBeNull();
    expect(cardStatField("")).toBeNull();
  });

  it("every stat key the dialog edits maps to a declared stats field", () => {
    for (const [key] of [...FIELD_STAT_FIELDS, ...KEEPER_STAT_FIELDS]) expect(ROSTER_FIELD_SECTION[statField(key)], key).toBe("stats");
    expect(statField("fouls_suffered")).toBe("foulsSuffered");
    expect(statField("clean_sheets")).toBe("cleanSheets");
  });
});

describe("the click guard", () => {
  it("rosterSectionOf opens the clicked field's section, only for this player's own declared fields", () => {
    expect(rosterSectionOf(rosterTarget(A, "hometown"), A)).toBe("details");
    expect(rosterSectionOf(rosterTarget(A, "name"), A)).toBe("basics");
    expect(rosterSectionOf(rosterTarget(A, "goals"), A)).toBe("stats");
    expect(rosterSectionOf(rosterTarget(A, "bio"), A)).toBe("background");
    expect(rosterSectionOf(rosterTarget(A, "visible"), A)).toBe("visibility");
    expect(rosterSectionOf(rosterTarget(B, "name"), A)).toBeUndefined();
    expect(rosterSectionOf(undefined, A)).toBeUndefined();
    expect(rosterSectionOf("partners.partner.row:x.name", A)).toBeUndefined();
    expect(rosterSectionOf(`roseCityRoster.nowhere.row:${A}.name`, A)).toBeUndefined();
    expect(rosterSectionOf(`roseCityRoster.basics.row:${A}.undeclared`, A)).toBeUndefined();
  });

  /** A fake card with stamped nodes at known boxes: the real hit test (editTargetHitAt) runs over it. */
  const node = (target: string, left: number, top: number, width: number, height: number) => ({
    getAttribute: (name: string) => (name === EDIT_TARGET_ATTRIBUTE ? target : null),
    getBoundingClientRect: () => ({ left, top, width, height }),
  });
  const fakeCard = (nodes: ReturnType<typeof node>[]) => {
    const card = { querySelectorAll: (selector: string) => (selector === "iframe" ? [] : nodes) } as unknown as HTMLElement;
    return { card, currentTarget: { closest: () => card } as unknown as HTMLElement };
  };
  const outer = node(rosterTarget(A, "hometown"), 0, 100, 200, 20);
  const inner = node(rosterTarget(A, "position"), 0, 100, 20, 20);
  const strangers = node(rosterTarget(B, "name"), 0, 0, 200, 40);

  it("a real pointer click picks the innermost field of this player; Enter and Space (detail 0) pick none", () => {
    const { card, currentTarget } = fakeCard([outer, inner, strangers]);
    expect(rosterFieldAt(card, A, 10, 110)?.id).toBe(rosterTarget(A, "position"));
    expect(rosterFieldAt(card, A, 100, 110)?.id).toBe(rosterTarget(A, "hometown"));
    expect(clickTarget({ detail: 1, clientX: 10, clientY: 110, currentTarget }, A)).toBe(rosterTarget(A, "position"));
    expect(clickTarget({ detail: 1, clientX: 100, clientY: 110, currentTarget }, A)).toBe(rosterTarget(A, "hometown"));
    expect(clickTarget({ detail: 0, clientX: 10, clientY: 110, currentTarget }, A)).toBeUndefined();
  });
  it("a click on no field, on another player's field or outside the card passes no target", () => {
    const { card, currentTarget } = fakeCard([outer, inner, strangers]);
    expect(clickTarget({ detail: 1, clientX: 100, clientY: 60, currentTarget }, A)).toBeUndefined();
    expect(clickTarget({ detail: 1, clientX: 100, clientY: 20, currentTarget }, A)).toBeUndefined();
    expect(rosterFieldAt(card, A, 100, 20)).toBeNull();
    expect(clickTarget({ detail: 1, clientX: 10, clientY: 110, currentTarget: { closest: () => null } as unknown as HTMLElement }, A)).toBeUndefined();
  });
});

describe("the Roster page and card wiring", () => {
  const page = read("components/admin/roster/rose-city/RoseCityRosterPage.tsx");
  const card = read("components/admin/roster/rose-city/RosterPlayerCard.tsx");
  const dialog = read("components/admin/roster/rose-city/RoseCityPlayerDialog.tsx");
  const targets = read("components/admin/roster/rose-city/roster-edit-targets.ts");

  it("a card click opens the clicked field's section on that player, then focuses the field; no target opens Basics", () => {
    expect(page).toMatch(/function openPlayer\(player: Player \| null, event\?: MouseEvent<HTMLElement>, target\?: EditTargetId\) \{/);
    expect(page).toMatch(/const section = player \? rosterSectionOf\(target, player\.id\) : undefined;/);
    expect(page).toMatch(/dialog\.openSection\(section \?\? "basics", event\);\s*if \(section\) dialog\.focusField\(target\);/);
    expect(page).toMatch(/onEdit=\{\(event, target\) => openPlayer\(player, event, target\)\}/);
    expect(page).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
    expect(page).toMatch(/onClick=\{event => tab === "players" \? openPlayer\(null, event\)/);
  });
  it("the dialog hands the request to the kit dialog and its controls are given the saved player's id", () => {
    expect(dialog).toMatch(/focusRequest=\{focusRequest\}/);
    expect(dialog).toMatch(/PlayerBasicsFields playerId=\{persisted\?\.id\}/);
    expect(dialog).toMatch(/PlayerDetailsFields playerId=\{persisted\?\.id\}/);
    expect(dialog).toMatch(/PlayerBackgroundFields playerId=\{persisted\?\.id\}/);
    expect(dialog).toMatch(/RosterStatsSection playerId=\{persisted\.id\}/);
    expect(dialog).toMatch(/PlayerVisibilityFields playerId=\{persisted\?\.id\}/);
    expect(dialog).toMatch(/onActiveChange\(FIELD_SECTION\[firstField\]\)/);
  });
  it("the card: a click passes the field under the pointer, the hover outline moves for a mouse only", () => {
    expect(card).toMatch(/onClick=\{event => onEdit\(event, clickTarget\(event, player\.id\)\)\}/);
    expect(card).toMatch(/onPointerMove=\{event => \{ if \(event\.pointerType === "mouse"\) showFieldHover\(/);
    expect(card).toMatch(/onPointerLeave=\{event => hideFieldHover\(/);
    expect(targets).toMatch(/if \(event\.detail <= 0\) return undefined;/);
  });
  it("targets are keyed by the player's id, never by position", () => {
    expect(card).toContain("rosterTarget(player.id, field)");
    expect(targets + card).not.toMatch(/\bindex\b|\.indexOf\(|\[\d\]/);
  });
  it("nothing in the Diverse City roster or the public site gains a stamp", () => {
    for (const file of ["components/admin/roster/ClassicRosterPage.tsx", "components/admin/roster/classic-roster.module.css"]) {
      try { expect(read(file)).not.toMatch(/edit-target|editTarget|roseCityRoster/); } catch (problem) { if (!String(problem).includes("ENOENT")) throw problem; }
    }
  });
});
