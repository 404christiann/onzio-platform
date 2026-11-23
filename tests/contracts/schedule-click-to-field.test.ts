import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, editTargetRowId, resolveEditTarget } from "@/lib/admin-edit-targets";
import {
  SCHEDULE_MATCH_FIELDS, SCHEDULE_RESULT_FIELDS, SCHEDULE_SPONSOR_FIELDS, SCHEDULE_SUMMARY_GROUP_FIELDS, SCHEDULE_SUMMARY_LINEUP_FIELDS, SCHEDULE_SUMMARY_ROW_FIELDS,
} from "@/lib/edit-targets/schedule";
import { RoseCityMatchFields } from "@/components/admin/schedule/rose-city/RoseCityMatchFields";
import MatchSummaryFields from "@/components/admin/schedule/MatchSummaryFields";
import { MATCH_SECTIONS } from "@/components/admin/schedule/rose-city/rose-city-schedule-model";
import {
  MATCH_FIELD_SECTION, matchOwnsTarget, matchSectionOf, matchTarget, matchThumbStamps, summaryRowTarget, type MatchField,
} from "@/components/admin/schedule/rose-city/match-edit-targets";
import { emptyForm, type FormState } from "@/components/admin/schedule/schedule-model";
import type { DBSeason } from "@/lib/db-types";
import type { MatchSummary } from "@/lib/match-summary";

/**
 * UI-PREVIEW-CLICK-SCHEDULE: every declared Rose City Schedule field has its control in the match dialog carrying the id a card
 * click focuses it by, keyed by the match (never by position in the list); the editor wires the card stamps, the click, the
 * section, the guard and the focus.
 */
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/admin-client", () => ({ createClient: () => ({}) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const noop = () => undefined;
const K1 = "8f1c1d2e-5a60-4c1e-9f0e-0a7a1b2c3d4e", K2 = "2b7d9e60-31aa-4f55-8c1b-6d0e5a4f9c11", NEW = "new:3";
const SEASONS = [{ id: "s1", label: "2027", active: true }] as unknown as DBSeason[];

const summary: MatchSummary = {
  events: [
    { minute: "12'", side: "club", kind: "goal", player: "A", detail: "" },
    { minute: "40'", side: "opponent", kind: "yellow", player: "B", detail: "" },
  ],
  stats: [{ label: "Shots", club: 5, opponent: 3 }, { label: "Fouls", club: 2, opponent: 4 }],
  officials: [{ role: "Referee", name: "R" }, { role: "VAR", name: "V" }],
  kit: [{ item: "Jersey", color: "Red" }, { item: "Shorts", color: "Black" }],
  lineups: { club: { starting: [{ number: "1", name: "GK" }], bench: [], staff: [] }, opponent: { starting: [], bench: [], staff: [] } },
};
const form = (patch: Partial<FormState> = {}): FormState => ({ ...emptyForm("s1"), opponent: "Ocelot FC", venue: "Robinson", summary, ...patch });
const dialog = (section: string, key = K1, f: FormState = form()) => renderToStaticMarkup(createElement(RoseCityMatchFields, {
  section: section as never, matchKey: key, form: f, onChange: noop, seasons: SEASONS, clubName: "Rose City FC", isNew: false, onUploadBusyChange: noop, onMediaActivity: noop,
}));
const stampsIn = (markup: string) => [...markup.matchAll(new RegExp(`${EDIT_TARGET_ATTRIBUTE}="([^"]+)"`, "g"))].map(match => match[1]);
const id = (key: string, section: string, field: string) => `schedule.${section}.row:${editTargetRowId(key)}.${field}`;
/** The markup from one stamped control on, enough to see which control it is. */
const around = (markup: string, target: string) => {
  const at = markup.indexOf(`${EDIT_TARGET_ATTRIBUTE}="${target}"`);
  expect(at, target).toBeGreaterThan(-1);
  return markup.slice(Math.max(0, at - 160), at + 700);
};

describe("Schedule registry", () => {
  const spec = EDIT_TARGET_REGISTRY.schedule;
  it("is the match dialog's sections, all row fields, on the Schedule route", () => {
    expect(spec.route).toBe("/admin/schedule");
    expect(Object.keys(spec.sections)).toEqual(MATCH_SECTIONS.map(section => section.id));
    for (const section of MATCH_SECTIONS) expect(spec.sections[section.id].fields).toBeUndefined();
    expect(spec.sections.match.rowFields).toEqual([...SCHEDULE_MATCH_FIELDS]);
    expect(spec.sections.result.rowFields).toEqual([...SCHEDULE_RESULT_FIELDS]);
    expect(spec.sections.sponsor.rowFields).toEqual([...SCHEDULE_SPONSOR_FIELDS]);
    expect(spec.sections.summary.rowFields).toEqual([...SCHEDULE_SUMMARY_GROUP_FIELDS, ...SCHEDULE_SUMMARY_LINEUP_FIELDS, ...SCHEDULE_SUMMARY_ROW_FIELDS]);
  });
  it("no field name is declared twice, so a field names its section", () => {
    const all = Object.values(spec.sections).flatMap(section => section.rowFields ?? []);
    expect(new Set(all).size).toBe(all.length);
  });
  it("the registry gets the module through one spread and nothing else of the shared registry moved", () => {
    expect(read("lib/admin-edit-targets.ts")).toMatch(/\n  \.\.\.SCHEDULE_EDIT_TARGETS,\n\};/);
    expect(Object.keys(EDIT_TARGET_REGISTRY)).toContain("sponsors");
  });
});

describe("Schedule match dialog: every declared field has its control", () => {
  it.each([[K1], [K2], [NEW]])("match section for %s: each field is stamped on exactly one control, under the match's own id", key => {
    const stamped = stampsIn(dialog("match", key));
    expect([...stamped].sort()).toEqual(SCHEDULE_MATCH_FIELDS.map(field => id(key, "match", field)).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const target of stamped) expect(resolveEditTarget(target), target).toMatchObject({ editor: "schedule", section: "match", row: editTargetRowId(key) });
  });
  it("result and sponsor sections stamp their fields and nothing else", () => {
    expect([...stampsIn(dialog("result"))].sort()).toEqual(SCHEDULE_RESULT_FIELDS.map(field => id(K1, "result", field)).sort());
    expect([...stampsIn(dialog("sponsor"))].sort()).toEqual(SCHEDULE_SPONSOR_FIELDS.map(field => id(K1, "sponsor", field)).sort());
  });
  it("each control's id is on the control the label names", () => {
    const match = dialog("match"), result = dialog("result"), sponsor = dialog("sponsor");
    const on = (markup: string, section: string, field: string, controlId: string) =>
      expect(markup, field).toContain(`id="${controlId}" ${EDIT_TARGET_ATTRIBUTE}="${id(K1, section, field)}"`);
    on(match, "match", "season", "match-season");
    on(match, "match", "homeAway", "match-home-away");
    on(match, "match", "date", "match-date");
    on(match, "match", "time", "match-time");
    on(match, "match", "competition", "match-competition");
    on(match, "match", "opponent", "match-opponent");
    on(match, "match", "opponentShortName", "match-opponent-short-name");
    on(match, "match", "venue", "match-venue");
    on(match, "match", "address", "match-address");
    on(match, "match", "city", "match-city");
    on(match, "match", "state", "match-state");
    on(result, "result", "clubScore", "match-club-score");
    on(result, "result", "opponentScore", "match-opponent-score");
    on(result, "result", "replayVideo", "match-replay-video");
    on(result, "result", "attendance", "match-attendance");
    on(sponsor, "sponsor", "name", "match-sponsor-name");
    on(sponsor, "sponsor", "link", "match-sponsor-link");
  });
  it("the three logo fields stamp the box around their upload control, so its first button takes focus", () => {
    expect(around(dialog("match"), id(K1, "match", "leagueLogo"))).toMatch(/league logo/i);
    expect(around(dialog("match"), id(K1, "match", "opponentLogo"))).toMatch(/Opponent logo/);
    expect(around(dialog("sponsor"), id(K1, "sponsor", "logo"))).toMatch(/Sponsor logo/);
  });
  it("controls follow their match: another match's dialog carries only its own ids", () => {
    for (const section of MATCH_SECTIONS) {
      expect(stampsIn(dialog(section.id, K2)).every(target => target.includes(`.row:${K2}`)), section.id).toBe(true);
      expect(stampsIn(dialog(section.id, K2)).some(target => target.includes(K1)), section.id).toBe(false);
    }
  });
  it("each field maps to the section that holds its control", () => {
    for (const [section, fields] of [["match", SCHEDULE_MATCH_FIELDS], ["result", SCHEDULE_RESULT_FIELDS], ["sponsor", SCHEDULE_SPONSOR_FIELDS], ["summary", [...SCHEDULE_SUMMARY_GROUP_FIELDS, ...SCHEDULE_SUMMARY_LINEUP_FIELDS]]] as const) {
      for (const field of fields) {
        expect(MATCH_FIELD_SECTION[field as MatchField], field).toBe(section);
        expect(matchSectionOf(matchTarget(K1, field as MatchField)), field).toBe(section);
      }
    }
    expect(matchSectionOf(undefined)).toBeUndefined();
    expect(matchSectionOf("partners.partner.row:x.name")).toBeUndefined();
    expect(matchSectionOf("schedule.nowhere.row:x.date")).toBeUndefined();
  });
});

describe("Schedule Match Summary controls", () => {
  const markup = dialog("summary");
  it("the four list groups and six lineup boxes are stamped once each, keyed by the match", () => {
    for (const field of [...SCHEDULE_SUMMARY_GROUP_FIELDS, ...SCHEDULE_SUMMARY_LINEUP_FIELDS]) expect(stampsIn(markup).filter(target => target === id(K1, "summary", field)), field).toHaveLength(1);
    for (const field of SCHEDULE_SUMMARY_GROUP_FIELDS) expect(markup, field).toContain(`<fieldset ${EDIT_TARGET_ATTRIBUTE}="${id(K1, "summary", field)}"`);
    expect(around(markup, id(K1, "summary", "clubStarting"))).toMatch(/<textarea[\s\S]*GK/);
    expect(around(markup, id(K1, "summary", "opponentBench"))).toMatch(/<textarea/);
  });
  it("list rows are keyed by the match plus the row's index in its own list (the draft's rows have no id)", () => {
    const rows = (field: string) => stampsIn(markup).filter(target => target.endsWith(`.${field}`));
    for (const index of [0, 1]) {
      for (const field of ["eventMinute", "eventTeam", "eventType", "eventPlayer", "eventDetail", "statLabel", "statClub", "statOpponent", "officialRole", "officialName", "kitItem", "kitColor"]) {
        expect(rows(field), field).toContain(`schedule.summary.row:${K1}-${index}.${field}`);
      }
    }
    for (const field of SCHEDULE_SUMMARY_ROW_FIELDS) expect(rows(field), field).toHaveLength(2);
    expect(summaryRowTarget(NEW, "kitColor", 4)).toBe("schedule.summary.row:new_3-4.kitColor");
  });
  it("each row id is on the control its label names, in the row it belongs to", () => {
    expect(around(markup, id(K1, "summary", "timeline")).length).toBeGreaterThan(0);
    expect(around(markup, `schedule.summary.row:${K1}-1.eventMinute`)).toMatch(/Minute[\s\S]*value="40&#x27;"/);
    expect(around(markup, `schedule.summary.row:${K1}-0.eventPlayer`)).toMatch(/Player<\/span>[\s\S]*value="A"/);
    expect(around(markup, `schedule.summary.row:${K1}-1.statLabel`)).toMatch(/Statistic<\/span>[\s\S]*value="Fouls"/);
    expect(around(markup, `schedule.summary.row:${K1}-1.statOpponent`)).toMatch(/value="4"/);
    expect(around(markup, `schedule.summary.row:${K1}-0.officialName`)).toMatch(/Name<\/span>[\s\S]*value="R"/);
    expect(around(markup, `schedule.summary.row:${K1}-1.kitColor`)).toMatch(/Color<\/span>[\s\S]*value="Black"/);
    expect(around(markup, `schedule.summary.row:${K1}-0.eventTeam`)).toMatch(/<select[^>]*>[\s\S]*Rose City FC/);
  });
  it("an empty summary still stamps the four groups and the six lineup boxes; no row fields", () => {
    const empty = dialog("summary", K1, form({ summary: { ...summary, events: [], stats: [], officials: [], kit: [] } }));
    expect(stampsIn(empty)).toHaveLength(SCHEDULE_SUMMARY_GROUP_FIELDS.length + SCHEDULE_SUMMARY_LINEUP_FIELDS.length);
  });
  it("without a match key (the classic Schedule page) nothing is stamped", () => {
    const classic = renderToStaticMarkup(createElement(MatchSummaryFields, { value: summary, clubLabel: "Rose City FC", opponentLabel: "Ocelot FC", onChange: noop }));
    expect(classic).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});

describe("Schedule card stamps", () => {
  it("one array per match, built from the key alone, found through the match's own data-fixture-id", () => {
    for (const key of [K1, NEW]) {
      const stamps = matchThumbStamps(key);
      for (const stamp of stamps) expect(stamp.selector.startsWith(`.fixture-item[data-fixture-id="${key}"] `), stamp.selector).toBe(true);
      const targets = stamps.map(stamp => stamp.target(null as never, 0));
      expect(targets).toEqual(["date", "opponent", "opponentLogo", "homeAway", "venue", "address", "time", "competition", "leagueLogo", "clubScore", "timeline", "replayVideo", "name", "logo"]
        .map(field => matchTarget(key, field as MatchField)));
      expect(new Set(targets).size).toBe(targets.length);
    }
  });
  it("the guard accepts only that match's own fields", () => {
    const own = resolveEditTarget(matchTarget(K1, "date"))!;
    expect(matchOwnsTarget(K1, own)).toBe(true);
    expect(matchOwnsTarget(K2, own)).toBe(false);
    expect(matchOwnsTarget(NEW, resolveEditTarget(matchTarget(NEW, "venue"))!)).toBe(true);
    expect(matchOwnsTarget(K1, resolveEditTarget("partners.partner.row:abc.name")!)).toBe(false);
    expect(matchOwnsTarget(K1, resolveEditTarget(summaryRowTarget(K1, "kitColor", 0))!)).toBe(false);
  });
  it("matches are keyed by their key, never by position", () => {
    const source = read("components/admin/schedule/rose-city/match-edit-targets.ts");
    // Summary list rows are the one place an index is used (their rows have no id); the cards' own stamps never are.
    const cards = source.slice(source.indexOf("export function matchThumbStamps"));
    expect(cards).not.toMatch(/\.indexOf\(|\[\d\]|index|:nth-|:first|:last/);
    expect(source.slice(0, source.indexOf("export function matchThumbStamps"))).not.toMatch(/\.indexOf\(\w+\)|findIndex/);
  });
});

describe("the Rose City Schedule editor", () => {
  const editor = read("components/admin/schedule/rose-city/RoseCityScheduleEditor.tsx");
  const thumb = read("components/admin/schedule/rose-city/MatchPreview.tsx");

  it("a card click opens the section of the clicked field (Match when there is none) on that match, then focuses the field", () => {
    expect(editor).toMatch(/function openMatch\(key: string, event\?: React\.MouseEvent<HTMLElement>, target\?: EditTargetId\) \{/);
    expect(editor).toMatch(/dialog\.openSection\(matchSectionOf\(target\) \?\? "match", event\);\s*dialog\.focusField\(target\);\s*\}\s*function openNew/);
    expect(editor).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });
  it("only a pointer click passes a field: the overlay's keyboard click (detail 0) and the Edit button pass none", () => {
    expect(editor).toMatch(/onClick=\{event => openMatch\(key, event, event\.detail > 0 \? matchFieldUnder\(event\.currentTarget, key, event\.clientX, event\.clientY\)\?\.id : undefined\)\}/);
    expect(editor).toMatch(/data-match-edit=\{key\} aria-label=\{label\} onClick=\{event => openMatch\(key, event\)\}/);
    expect(editor).toMatch(/onClick=\{\(\) => setQuick\(/);
    expect(editor).toMatch(/<EditorSecondaryButton disabled=\{saving\} onClick=\{\(\) => openMatch\(notice\.key!\)\}>/);
  });
  it("Add match still opens the new match on Match with no field", () => {
    expect(editor).toMatch(/setEditingKey\(key\);\s*dialog\.openSection\("match", event\);\s*\}/);
  });
  it("the card hover outline follows a mouse only, and the cards hit-test this match's own fields", () => {
    expect(editor).toMatch(/onPointerMove=\{event => \{ if \(event\.pointerType === "mouse"\) showMatchFieldHover\(event\.currentTarget, key, event\.clientX, event\.clientY\); \}\}/);
    expect(editor).toMatch(/onPointerLeave=\{event => hideMatchFieldHover\(event\.currentTarget\)\}/);
    expect(editor).toMatch(/data-field-hover-clip=""[^>]*><span className=\{previewCards\.fieldHover\} data-field-hover="" hidden \/>/);
    const hover = read("components/admin/schedule/rose-city/match-card-hover.ts");
    expect(hover).toMatch(/matchOwnsTarget\(matchKey, target\)/);
  });
  it("the thumb stamps from one array per match key, never from the draft", () => {
    expect(thumb).toMatch(/const stamps = useMemo\(\(\) => matchThumbStamps\(ownId\), \[ownId\]\);/);
    expect(thumb).toMatch(/return node && near \? watchEditTargetStamps\(node, stamps\) : undefined;\s*\}, \[near, stamps\]\);/);
    expect(thumb).toMatch(/<div ref=\{scaledRef\} className=\{previewCards\.scaled\}/);
  });
  it("the dialog's controls are given the match key; the dialog's live card stays inert (needs a kit change)", () => {
    expect(editor).toMatch(/<RoseCityMatchFields key=\{editingKey\} matchKey=\{editingKey\} section=/);
    const preview = editor.slice(editor.indexOf("renderPreview={() =>"));
    expect(preview).not.toMatch(/stamps|onClick|editTarget/);
  });
  it("only the admin preview stamps public nodes; the public components gain nothing", () => {
    for (const file of ["CinematicSchedule", "CinematicMatchSummary"]) expect(read(`components/cinematic/${file}.tsx`), file).not.toMatch(/edit-target|editTarget/);
  });
});
