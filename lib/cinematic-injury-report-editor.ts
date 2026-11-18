import {
  MAX_INJURY_ENTRIES, cinematicInjuryReportContentSchema, injuryVideoLink,
  type CinematicInjuryReportContent, type CinematicInjuryReportSave,
} from "@/lib/cinematic-injury-report-content";

/** An active Roster player the editor can pick. Name, number and position are shown, never edited here. */
export type InjuryRosterPlayer = { id: string; name: string; number: number; position: string };
export type InjuryMedia = { id: string; storage_path: string; width: number; height: number; kind: "graphic" | "photograph" };
export type CinematicInjuryReportSnapshot = {
  revision: string;
  designRevision: string;
  content: CinematicInjuryReportContent | null;
  players: InjuryRosterPlayer[];
  /** The logo and band the saved content uses, for the preview. */
  media: InjuryMedia[];
  retiredMediaAssetIds?: string[];
  operation?: { status: "not-committed" } | { status: "committed"; receipt: CinematicInjuryReportSnapshot };
};

/** Adds a blank entry for the first Roster player who has none yet. */
export function addInjuryEntry(content: CinematicInjuryReportContent, players: InjuryRosterPlayer[]): CinematicInjuryReportContent {
  if (content.entries.length >= MAX_INJURY_ENTRIES) return content;
  const taken = new Set(content.entries.map(row => row.playerId));
  const next = players.find(player => !taken.has(player.id));
  if (!next) return content;
  return { ...content, entries: [...content.entries, { id: crypto.randomUUID(), playerId: next.id, injury: "", timeline: "", note: "" }] };
}

export function moveInjuryEntry(content: CinematicInjuryReportContent, index: number, delta: -1 | 1): CinematicInjuryReportContent {
  const destination = index + delta;
  if (destination < 0 || destination >= content.entries.length) return content;
  const entries = [...content.entries];
  [entries[index], entries[destination]] = [entries[destination], entries[index]];
  return { ...content, entries };
}

export function removeInjuryEntry(content: CinematicInjuryReportContent, index: number): CinematicInjuryReportContent {
  return { ...content, entries: content.entries.filter((_, position) => position !== index) };
}

/** The players one entry's picker offers: its own player plus everyone without an entry. */
export function availablePlayers(players: InjuryRosterPlayer[], content: CinematicInjuryReportContent, entryId: string): InjuryRosterPlayer[] {
  const takenElsewhere = new Set(content.entries.filter(row => row.id !== entryId).map(row => row.playerId));
  return players.filter(player => !takenElsewhere.has(player.id));
}

/** Entries whose player is no longer an active Roster player. They must be removed before saving. */
export function retiredFromRoster(content: CinematicInjuryReportContent, players: InjuryRosterPlayer[]): string[] {
  const active = new Set(players.map(player => player.id));
  return content.entries.filter(row => !active.has(row.playerId)).map(row => row.id);
}

/** Logo and band uploads from this editing session that the draft no longer uses. */
export function unusedInjuryUploads(uploads: string[], content: CinematicInjuryReportContent): string[] {
  const used = new Set([content.presenterLogoAssetId, content.bandAssetId]);
  return uploads.filter(id => !used.has(id));
}

/** Trims the draft, stores a pasted YouTube link in its embed form, and returns the request or field messages. */
export function injuryReportSaveRequest(
  draft: CinematicInjuryReportContent, snapshot: Pick<CinematicInjuryReportSnapshot, "revision" | "designRevision">, operationId: string,
): { ok: true; request: CinematicInjuryReportSave } | { ok: false; errors: Record<string, string> } {
  const video = injuryVideoLink(draft.page.videoUrl);
  const content: CinematicInjuryReportContent = {
    ...draft,
    page: { ...draft.page, presenterName: draft.page.presenterName.trim(), rehabHeading: draft.page.rehabHeading.trim(), videoUrl: video ?? draft.page.videoUrl },
    entries: draft.entries.map(row => ({ ...row, injury: row.injury.trim(), timeline: row.timeline.trim(), note: row.note.trim() })),
  };
  const parsed = cinematicInjuryReportContentSchema.safeParse(content);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    return { ok: false, errors };
  }
  return { ok: true, request: { operationId, expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: parsed.data } };
}

export async function loadCinematicInjuryReportEditor(operationId?: string): Promise<CinematicInjuryReportSnapshot> {
  const response = await fetch(`/api/admin/cinematic-injury-report${operationId ? `?operationId=${encodeURIComponent(operationId)}` : ""}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Unable to load the Injury Report.");
  return data;
}

export async function saveCinematicInjuryReportEditor(request: CinematicInjuryReportSave): Promise<
  { status: "committed"; snapshot: CinematicInjuryReportSnapshot } |
  { status: "conflict" | "rejected"; message: string } |
  { status: "uncertain"; request: CinematicInjuryReportSave; message: string }
> {
  try {
    const response = await fetch("/api/admin/cinematic-injury-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    const data = await response.json();
    if (response.ok) return { status: "committed", snapshot: data };
    if (response.status >= 500) throw new Error("Save status unknown");
    return { status: response.status === 409 ? "conflict" : "rejected", message: data.error?.message ?? "Unable to save the Injury Report." };
  } catch {
    try {
      const loaded = await loadCinematicInjuryReportEditor(request.operationId);
      if (loaded.operation?.status === "committed") return { status: "committed", snapshot: loaded.operation.receipt };
    } catch {}
    return { status: "uncertain", request, message: "Save could not be confirmed. Retry the same save. Your draft is locked until then." };
  }
}
