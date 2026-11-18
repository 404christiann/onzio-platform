import { z } from "zod";

/**
 * RC2027-MATCH-SUMMARY: the per-match summary Sam designed (timeline, statistics, officials, kit
 * colors, lineups). Stored in onzio.matches.summary and mirrored by
 * onzio_private.match_summary_is_valid. "club" is this club's side; "opponent" is the other team.
 */
export const MATCH_EVENT_KINDS = ["goal", "yellow", "red", "sub"] as const;
export const MATCH_SIDES = ["club", "opponent"] as const;
export const MATCH_SUMMARY_LIMITS = { events: 60, stats: 24, officials: 8, kit: 6, starting: 15, bench: 15, staff: 10 } as const;
/** Sam's sixteen statistics, offered as a starting list in the Schedule editor. */
export const STANDARD_MATCH_STAT_LABELS = [
  "Possession %", "Shots", "Shots on goal", "Blocked shots", "Total passes", "Passing accuracy %", "Corners", "Total crosses",
  "Offsides", "Aerial duels won", "Expected goals", "Goalkeeper saves", "Clearances", "Fouls", "Yellow cards", "Red cards",
] as const;

const text = (max: number) => z.string().max(max);
export const matchEventSchema = z.object({
  minute: text(12), side: z.enum(MATCH_SIDES), kind: z.enum(MATCH_EVENT_KINDS), player: text(80), detail: text(80),
}).strict();
export const matchStatSchema = z.object({
  label: text(40), club: z.number().finite().min(0).max(100_000), opponent: z.number().finite().min(0).max(100_000),
}).strict();
export const matchPersonSchema = z.object({ number: z.string().regex(/^[0-9]{0,3}$/), name: text(60) }).strict();
export const matchStaffSchema = z.object({ name: text(60), role: text(40) }).strict();
export const matchLineupSchema = z.object({
  starting: z.array(matchPersonSchema).max(MATCH_SUMMARY_LIMITS.starting),
  bench: z.array(matchPersonSchema).max(MATCH_SUMMARY_LIMITS.bench),
  staff: z.array(matchStaffSchema).max(MATCH_SUMMARY_LIMITS.staff),
}).strict();
export const matchSummarySchema = z.object({
  events: z.array(matchEventSchema).max(MATCH_SUMMARY_LIMITS.events),
  stats: z.array(matchStatSchema).max(MATCH_SUMMARY_LIMITS.stats),
  officials: z.array(z.object({ role: text(40), name: text(60) }).strict()).max(MATCH_SUMMARY_LIMITS.officials),
  kit: z.array(z.object({ item: text(20), color: text(30) }).strict()).max(MATCH_SUMMARY_LIMITS.kit),
  lineups: z.object({ club: matchLineupSchema, opponent: matchLineupSchema }).strict(),
}).strict();

export type MatchEvent = z.infer<typeof matchEventSchema>;
export type MatchStat = z.infer<typeof matchStatSchema>;
export type MatchPerson = z.infer<typeof matchPersonSchema>;
export type MatchStaff = z.infer<typeof matchStaffSchema>;
export type MatchLineup = z.infer<typeof matchLineupSchema>;
export type MatchSummary = z.infer<typeof matchSummarySchema>;

const emptyLineup = (): MatchLineup => ({ starting: [], bench: [], staff: [] });
export const EMPTY_MATCH_SUMMARY: MatchSummary = { events: [], stats: [], officials: [], kit: [], lineups: { club: emptyLineup(), opponent: emptyLineup() } };

/** A stored summary, or null when it is missing or does not match the rules. */
export function readMatchSummary(value: unknown): MatchSummary | null {
  const parsed = matchSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** "#8 J. Hernandez" or "8 J. Hernandez", one per line. A line without a number keeps a blank number. */
export function parsePeopleLines(value: string): MatchPerson[] {
  return value.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const match = line.match(/^#?([0-9]{1,3})\s+(.+)$/);
    return match ? { number: match[1], name: match[2].trim() } : { number: "", name: line };
  });
}
export function formatPeopleLines(people: MatchPerson[]): string {
  return people.map(person => person.number ? `#${person.number} ${person.name}` : person.name).join("\n");
}

/** "G. Morales - Head Coach" (also accepts an en or em dash), one per line. */
export function parseStaffLines(value: string): MatchStaff[] {
  return value.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const [name, ...role] = line.split(/\s+[-–—]\s+/);
    return { name: name.trim(), role: role.join(" - ").trim() };
  });
}
export function formatStaffLines(staff: MatchStaff[]): string {
  return staff.map(person => person.role ? `${person.name} - ${person.role}` : person.name).join("\n");
}

/** This club's goals as "J. Hernandez (23′)", kept in onzio.matches.scorers for the Home strip. */
export function scorersFromEvents(events: MatchEvent[]): string[] {
  return events.filter(event => event.side === "club" && event.kind === "goal" && event.player.trim())
    .map(event => `${event.player.trim().replace(/^#[0-9]{1,3}\s+/, "")}${event.minute.trim() ? ` (${event.minute.trim()})` : ""}`);
}

/** Trim words, drop empty rows, and return null when nothing is left. */
export function normalizeMatchSummary(summary: MatchSummary): MatchSummary | null {
  const lineup = (value: MatchLineup): MatchLineup => ({
    starting: value.starting.map(p => ({ number: p.number.trim(), name: p.name.trim() })).filter(p => p.name),
    bench: value.bench.map(p => ({ number: p.number.trim(), name: p.name.trim() })).filter(p => p.name),
    staff: value.staff.map(p => ({ name: p.name.trim(), role: p.role.trim() })).filter(p => p.name),
  });
  const next: MatchSummary = {
    events: summary.events.map(e => ({ ...e, minute: e.minute.trim(), player: e.player.trim(), detail: e.detail.trim() })).filter(e => e.player),
    stats: summary.stats.map(s => ({ ...s, label: s.label.trim() })).filter(s => s.label),
    officials: summary.officials.map(o => ({ role: o.role.trim(), name: o.name.trim() })).filter(o => o.name),
    kit: summary.kit.map(k => ({ item: k.item.trim(), color: k.color.trim() })).filter(k => k.item && k.color),
    lineups: { club: lineup(summary.lineups.club), opponent: lineup(summary.lineups.opponent) },
  };
  const empty = !next.events.length && !next.stats.length && !next.officials.length && !next.kit.length
    && MATCH_SIDES.every(side => !next.lineups[side].starting.length && !next.lineups[side].bench.length && !next.lineups[side].staff.length);
  return empty ? null : next;
}

/**
 * What the Schedule editor saves for a match. A blank summary saves as null. When the timeline has
 * goals, onzio.matches.scorers follows them, so the Home strip and the summary header agree.
 */
export function matchSummaryColumns(draft: MatchSummary): { summary: MatchSummary | null; scorers?: string[] } {
  const summary = normalizeMatchSummary(draft);
  if (!summary) return { summary: null };
  return summary.events.some(event => event.kind === "goal") ? { summary, scorers: scorersFromEvents(summary.events) } : { summary };
}
