import {
  cinematicInjuryReportDraftSchema, starterCinematicInjuryReportContent,
  type CinematicInjuryEntry, type CinematicInjuryReportContent, type CinematicInjuryReportSave,
} from "@/lib/cinematic-injury-report-content";
import type { CinematicInjuryReportSnapshot, InjuryMedia } from "@/lib/cinematic-injury-report-editor";
import { injuryReportView, type InjuryAsset, type InjuryPlayerRow, type InjuryReportView } from "@/lib/cinematic-injury-report-query";
import { mediaAssetUrl } from "@/lib/media-assets";

/** Pure pieces of the Injury Report editor: dialog ids, what counts as changed, and what each card previews. */

export type InjuryBlock = "presenter" | "rehab";
export type InjuryDialogId = InjuryBlock | `entry:${string}`;
export const BLOCK_TITLES: Record<InjuryBlock, string> = { presenter: "Presented by", rehab: "Photo, rehab quote and video" };
export const entryDialogId = (id: string): InjuryDialogId => `entry:${id}`;
export function parseInjuryDialogId(id: string): { kind: "block"; block: InjuryBlock } | { kind: "entry"; id: string } | null {
  if (id === "presenter" || id === "rehab") return { kind: "block", block: id };
  if (id.startsWith("entry:")) return { kind: "entry", id: id.slice(6) };
  return null;
}

export const savedContent = (snapshot: Pick<CinematicInjuryReportSnapshot, "content"> | null): CinematicInjuryReportContent => snapshot?.content ?? starterCinematicInjuryReportContent();

function normalized(content: CinematicInjuryReportContent): string {
  const parsed = cinematicInjuryReportDraftSchema.safeParse(content);
  return JSON.stringify(parsed.success ? parsed.data : content);
}
export const injuryDirty = (draft: CinematicInjuryReportContent, saved: CinematicInjuryReportContent) => normalized(draft) !== normalized(saved);

const piece = (value: unknown) => JSON.stringify(value);
export function changedBlocks(draft: CinematicInjuryReportContent, saved: CinematicInjuryReportContent): InjuryBlock[] {
  const out: InjuryBlock[] = [];
  const { presenterName } = draft.page, { rehabHeading, quote, quoteAttribution, videoUrl, bandAlt } = draft.page;
  if (piece([presenterName, draft.presenterLogoAssetId]) !== piece([saved.page.presenterName, saved.presenterLogoAssetId])) out.push("presenter");
  if (piece([rehabHeading, quote, quoteAttribution, videoUrl, bandAlt, draft.bandAssetId]) !== piece([saved.page.rehabHeading, saved.page.quote, saved.page.quoteAttribution, saved.page.videoUrl, saved.page.bandAlt, saved.bandAssetId])) out.push("rehab");
  return out;
}
/** An entry is changed when it is new, its fields differ, or it moved. */
export function changedEntryIds(draft: CinematicInjuryReportContent, saved: CinematicInjuryReportContent): Set<string> {
  const before = new Map(saved.entries.map((entry, index) => [entry.id, { index, text: piece(entry) }]));
  return new Set(draft.entries.flatMap((entry, index) => {
    const was = before.get(entry.id);
    return !was || was.index !== index || was.text !== piece(entry) ? [entry.id] : [];
  }));
}

export const asAsset = (item: InjuryMedia): InjuryAsset => ({ id: item.id, storage_bucket: "onzio-media", storage_path: item.storage_path, width: item.width, height: item.height });
export function mediaUrl(item: InjuryMedia | undefined): string {
  if (!item) return "";
  try { return mediaAssetUrl(asAsset(item)); } catch { return ""; }
}
export function mergeMedia(...lists: InjuryMedia[][]): InjuryMedia[] {
  const byId = new Map<string, InjuryMedia>();
  for (const item of lists.flat()) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()];
}

export function playerLabel(entry: CinematicInjuryEntry, players: readonly { id: string; name: string; number: number }[], index: number): string {
  const player = players.find(row => row.id === entry.playerId);
  return player ? player.name : `Former player ${index + 1}`;
}

const FORMER = { name: "Former player", number: null, position: "No longer on the Roster", photo: null } as const;

/** The public page's own view of the draft. An entry whose player left the Roster is hidden there, as on the live page, unless `showFormer` keeps it as a placeholder card. */
export function reportFor(
  content: CinematicInjuryReportContent, entries: readonly CinematicInjuryEntry[], roster: { players: InjuryPlayerRow[]; assets: InjuryAsset[] }, media: readonly InjuryMedia[], showFormer = false,
): InjuryReportView {
  const view = injuryReportView({ ...content, entries: [...entries] }, roster.players, [...roster.assets, ...media.map(asAsset)]);
  if (!showFormer) return view;
  const shown = new Map(view.entries.map(entry => [entry.id, entry]));
  return { ...view, entries: entries.map(entry => shown.get(entry.id) ?? { id: entry.id, injury: entry.injury, timeline: entry.timeline, note: entry.note, player: { ...FORMER } }) };
}

