// RC2027-INJURY-REPORT: the owner-editable Injury Report (/news/injury-report, cinematic@2).
// Each entry points at a Roster player; the player's name, number, position and photo always come
// from the Roster, so only injury, timeline and note live here. Mirrored by
// onzio_private.check_cinematic_injury_report_content.
import { z } from "zod";
import { MATCH_REPLAY_EMBED_PATTERN, matchReplayEmbedUrl } from "@/lib/youtube-embed";

export const MAX_INJURY_ENTRIES = 24;
export const INJURY_REPORT_ROUTE = "/news/injury-report";

const text = (max: number) => z.string().max(max);

const pageCopy = z.object({
  presenterName: text(60),
  rehabHeading: text(80),
  quote: text(600),
  quoteAttribution: text(120),
  videoUrl: text(200),
  bandAlt: text(200),
}).strict();

const entryRow = z.object({
  id: z.uuid(),
  playerId: z.uuid(),
  injury: text(80),
  timeline: text(40),
  note: text(200),
}).strict();

export const cinematicInjuryReportDraftSchema = z.object({
  page: pageCopy,
  presenterLogoAssetId: z.uuid().nullable(),
  bandAssetId: z.uuid().nullable(),
  entries: z.array(entryRow).max(MAX_INJURY_ENTRIES),
}).strict();

export const cinematicInjuryReportContentSchema = cinematicInjuryReportDraftSchema.superRefine((value, context) => {
  if (!value.page.presenterName.trim()) context.addIssue({ code: "custom", path: ["page", "presenterName"], message: "Enter the partner's name." });
  if (!value.page.rehabHeading.trim()) context.addIssue({ code: "custom", path: ["page", "rehabHeading"], message: "Enter a heading." });
  if (value.page.videoUrl && !MATCH_REPLAY_EMBED_PATTERN.test(value.page.videoUrl)) {
    context.addIssue({ code: "custom", path: ["page", "videoUrl"], message: "Paste a YouTube video link." });
  }
  const ids = new Set<string>();
  const players = new Set<string>();
  value.entries.forEach((row, index) => {
    if (!row.injury.trim()) context.addIssue({ code: "custom", path: ["entries", index, "injury"], message: "Enter the injury." });
    if (!row.timeline.trim()) context.addIssue({ code: "custom", path: ["entries", index, "timeline"], message: "Enter the timeline." });
    if (ids.has(row.id)) context.addIssue({ code: "custom", path: ["entries", index, "id"], message: "Duplicate entry." });
    if (players.has(row.playerId)) context.addIssue({ code: "custom", path: ["entries", index, "playerId"], message: "This player already has an entry." });
    ids.add(row.id);
    players.add(row.playerId);
  });
});
export type CinematicInjuryReportContent = z.infer<typeof cinematicInjuryReportContentSchema>;
export type CinematicInjuryEntry = CinematicInjuryReportContent["entries"][number];

export const cinematicInjuryReportSaveSchema = z.object({
  operationId: z.uuid(),
  expectedRevision: z.string().regex(/^[0-9]{1,20}$/),
  designRevision: z.string().min(1).max(100),
  content: cinematicInjuryReportContentSchema,
}).strict();
export type CinematicInjuryReportSave = z.infer<typeof cinematicInjuryReportSaveSchema>;

/** A pasted YouTube link (watch, youtu.be, live or embed) as stored; "" when blank, null when not a YouTube video. */
export function injuryVideoLink(input: string): string | null {
  return matchReplayEmbedUrl(input);
}

export function starterCinematicInjuryReportContent(): CinematicInjuryReportContent {
  return {
    page: { presenterName: "MVMNT CULTR", rehabHeading: "Rehab with MVMNT CULTR", quote: "", quoteAttribution: "", videoUrl: "", bandAlt: "" },
    presenterLogoAssetId: null,
    bandAssetId: null,
    entries: [],
  };
}
