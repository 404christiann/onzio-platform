"use client";

import Link from "next/link";
import { useId } from "react";
import { kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ListField, PositionTools } from "@/components/admin/list-cards/ListField";
import styles from "@/components/admin/list-cards/ListEditor.module.css";
import { ImageFieldWithDescription, ValidationMessage } from "@/components/admin/ui/editor-kit";
import type { CinematicInjuryReportContent } from "@/lib/cinematic-injury-report-content";
import { availablePlayers, type InjuryRosterPlayer } from "@/lib/cinematic-injury-report-editor";
import { INJURY_TARGETS, injuryEntryTarget } from "./injury-edit-targets";
import { parseInjuryDialogId, playerLabel, type InjuryDialogId } from "./injury-sections";

export type InjurySlot = "logo" | "band";
const LOGO_RULES = { allowedTypes: ["image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 } as const;
const BAND_RULES = { allowedTypes: ["image/png", "image/jpeg", "image/webp"], maxBytes: 5 * 1024 * 1024 } as const;

export type InjuryFieldsApi = {
  draft: CinematicInjuryReportContent;
  players: InjuryRosterPlayer[];
  /** Entry ids whose player is no longer an active Roster player. */
  former: ReadonlySet<string>;
  locked: boolean;
  uploading: InjurySlot | null;
  mediaUrls: { logo: string; band: string };
  /** Field-level save errors by path ("page.rehabHeading", "entries.2.injury"), shown after a refused save. */
  errors: Record<string, string>;
  update: (change: (value: CinematicInjuryReportContent) => CinematicInjuryReportContent | void) => void;
  upload: (slot: InjurySlot, file: File) => Promise<boolean>;
  move: (index: number, delta: -1 | 1) => void;
  remove: (index: number) => void;
};

function EntryFields({ api, id }: { api: InjuryFieldsApi; id: string }) {
  const { draft, players, former, locked, errors, update, move, remove } = api;
  const index = draft.entries.findIndex(entry => entry.id === id);
  const entry = draft.entries[index];
  const selectId = useId();
  if (!entry) return null;
  const gone = former.has(id);
  const name = playerLabel(entry, players, index);
  const set = (change: (row: typeof entry) => void) => update(content => { const row = content.entries.find(candidate => candidate.id === id); if (row) change(row); });
  const options = availablePlayers(players, draft, id);
  return <div className={styles.fields}>
    {gone
      ? <ValidationMessage live="assertive" title="This player left the Roster">This player is no longer on the active Roster. Remove this entry to save.</ValidationMessage>
      : <div className={kit.field}>
        <label htmlFor={selectId}>Player</label>
        <select id={selectId} disabled={locked} value={entry.playerId} aria-describedby={`${selectId}-hint`} onChange={event => set(row => { row.playerId = event.target.value; })}>
          {options.map(player => <option key={player.id} value={player.id}>#{player.number} {player.name} · {player.position}</option>)}
        </select>
        <span id={`${selectId}-hint`} className={kit.hint}>Each player can appear once. Name, number, position and photo come from the <Link className={kit.inlineLink} href="/admin/roster">Roster</Link> and are read only here.</span>
      </div>}
    <div className={styles.row2}>
      <ListField label="Injury" value={entry.injury} max={80} disabled={locked} hint="For example: Hamstring strain." error={errors[`entries.${index}.injury`]} target={injuryEntryTarget(id, "injury")} onChange={value => set(row => { row.injury = value; })} />
      <ListField label="Timeline" value={entry.timeline} max={40} disabled={locked} hint="For example: 2–3 weeks, or Day-to-day." error={errors[`entries.${index}.timeline`]} target={injuryEntryTarget(id, "timeline")} onChange={value => set(row => { row.timeline = value; })} />
    </div>
    <ListField label="Note (optional)" value={entry.note} max={200} disabled={locked} hint="One short line, shown in italics." target={injuryEntryTarget(id, "note")} onChange={value => set(row => { row.note = value; })} />
    <p className={styles.note}>The photo, rehab heading, quote and video belong to the whole page, not to one injury. Edit them in the Photo, rehab quote and video section.</p>
    <PositionTools index={index} length={draft.entries.length} name={name} noun="injury" disabled={locked} note="The page shows injuries in this order."
      onMove={delta => move(index, delta)} onRemove={() => remove(index)} />
  </div>;
}

function PresenterFields({ api }: { api: InjuryFieldsApi }) {
  const { draft, locked, uploading, mediaUrls, errors, update, upload } = api;
  return <div className={styles.fields}>
    <ListField label="Partner name" value={draft.page.presenterName} max={60} disabled={locked} hint="Also the logo's description for screen readers." error={errors["page.presenterName"]} target={INJURY_TARGETS.presenterName}
      onChange={value => update(content => { content.page.presenterName = value; })} />
    <ImageFieldWithDescription label="Partner logo" target={INJURY_TARGETS.presenterLogo} description="PNG or WebP, ideally with a transparent background. Until a logo is uploaded, the page shows the partner's name."
      previewUrl={mediaUrls.logo} initials="" disabled={locked} uploading={uploading === "logo"} {...LOGO_RULES}
      onUpload={async files => { const file = files[0]; return file ? upload("logo", file) : false; }}
      onRemove={draft.presenterLogoAssetId ? () => update(content => { content.presenterLogoAssetId = null; }) : undefined} />
  </div>;
}

function RehabFields({ api }: { api: InjuryFieldsApi }) {
  const { draft, locked, uploading, mediaUrls, errors, update, upload } = api;
  return <div className={styles.fields}>
    <ImageFieldWithDescription label="Photo band" target={INJURY_TARGETS.rehabBand} description="Shown full width below the injuries. Without a photo the page goes straight to the Rehab heading."
      previewUrl={mediaUrls.band} initials="" disabled={locked} uploading={uploading === "band"} {...BAND_RULES}
      onUpload={async files => { const file = files[0]; return file ? upload("band", file) : false; }}
      onRemove={draft.bandAssetId ? () => update(content => { content.bandAssetId = null; }) : undefined} />
    <ListField label="Photo description" value={draft.page.bandAlt} max={200} disabled={locked} hint="Describe the photo for screen readers." target={INJURY_TARGETS.rehabBandAlt} onChange={value => update(content => { content.page.bandAlt = value; })} />
    <ListField label="Rehab heading" value={draft.page.rehabHeading} max={80} disabled={locked} error={errors["page.rehabHeading"]} target={INJURY_TARGETS.rehabHeading} onChange={value => update(content => { content.page.rehabHeading = value; })} />
    <ListField label="Quote" value={draft.page.quote} max={600} multiline disabled={locked} hint="Leave blank to hide the quote." target={INJURY_TARGETS.rehabQuote} onChange={value => update(content => { content.page.quote = value; })} />
    <ListField label="Quote by" value={draft.page.quoteAttribution} max={120} disabled={locked} target={INJURY_TARGETS.rehabQuoteAttribution} onChange={value => update(content => { content.page.quoteAttribution = value; })} />
    <ListField label="YouTube link" value={draft.page.videoUrl} max={200} disabled={locked} hint="Paste a YouTube video link. Leave blank to show “Coming soon”." error={errors["page.videoUrl"]} target={INJURY_TARGETS.rehabVideoUrl}
      onChange={value => update(content => { content.page.videoUrl = value; })} />
  </div>;
}

export function InjuryDialogFields({ api, id }: { api: InjuryFieldsApi; id: InjuryDialogId }) {
  const target = parseInjuryDialogId(id);
  if (!target) return null;
  if (target.kind === "entry") return <EntryFields api={api} id={target.id} />;
  return target.block === "presenter" ? <PresenterFields api={api} /> : <RehabFields api={api} />;
}
