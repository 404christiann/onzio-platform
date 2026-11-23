"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { EditorGroup, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ImageFieldWithDescription } from "@/components/admin/ui/editor-kit";
import type { ChickFilAArtworkSlot, ChickFilAContent, ChickFilAPageContent } from "@/lib/chick-fil-a-content";
import { AlwaysShownRow, ShowRow, TextField } from "@/components/admin/stadium/PartnerPageParts";
import styles from "@/components/admin/stadium/PartnerPageParts.module.css";
import type { EditTargetId } from "@/lib/admin-edit-targets";
import { CHICK_FIL_A_TARGETS, stepIconAltTarget, stepLabelTarget, stepNumberTarget } from "./chick-fil-a-edit-targets";
import { chickFilACardTitle, chickFilAFlag, chickFilAImageRules, type ChickFilACardId } from "./chick-fil-a-sections";

const ART_LABELS: Record<ChickFilAArtworkSlot, string> = { mealPass: "Meal pass", driveThru: "Drive-thru illustration", freeTicket: "Free ticket illustration", enjoyGame: "Meal illustration", map: "Route map", restaurant: "Restaurant photo", partner: "Match card partner", background: "Seat background" };

export type ChickFilAFieldsApi = {
  draft: ChickFilAContent;
  page: ChickFilAPageContent;
  locked: boolean;
  uploading: ChickFilAArtworkSlot | null;
  /** Edit a copy of the draft, exactly as the editor always did. */
  update: (edit: (content: ChickFilAContent) => void) => void;
  upload: (slot: ChickFilAArtworkSlot, file: File) => Promise<boolean>;
  removeImage: (slot: ChickFilAArtworkSlot) => void;
};

function ImageSlot({ api, slot, altTarget }: { api: ChickFilAFieldsApi; slot: ChickFilAArtworkSlot; altTarget: EditTargetId }) {
  const { draft, page, locked, uploading, update, upload, removeImage } = api;
  const label = ART_LABELS[slot], rules = chickFilAImageRules(slot);
  return <EditorGroup legend={label}>
    <ImageFieldWithDescription label={label} description={`${rules.hint} Words inside artwork change when you replace its image.`} previewUrl={page.artwork[slot].url} initials="" disabled={locked} uploading={uploading === slot}
      allowedTypes={rules.allowedTypes} maxBytes={rules.maxBytes} onUpload={async files => { const file = files[0]; return file ? upload(slot, file) : false; }}
      onRemove={draft.artwork[slot].assetId ? () => removeImage(slot) : undefined} />
    <TextField label="Image description" value={draft.artwork[slot].alt} max={1000} disabled={locked} target={altTarget} onChange={alt => update(content => { content.artwork[slot].alt = alt; })} />
  </EditorGroup>;
}

/** The fields of one card, with its show/hide switch first (or "Always shown" for the background). Each field edits the same ChickFilAContent key it always did. */
export function ChickFilASectionFields({ api, id }: { api: ChickFilAFieldsApi; id: ChickFilACardId }) {
  const { draft, locked, update } = api;
  const title = chickFilACardTitle(id), flag = chickFilAFlag(id);
  const top: ReactNode = flag
    ? <ShowRow label="Show on the page" switchLabel={`Show ${title.toLowerCase()} on the page`} checked={draft.sections[flag]} disabled={locked} onChange={next => update(content => { content.sections[flag] = next; })} />
    : <AlwaysShownRow note="This picture has no show or hide switch." />;
  let body: ReactNode = null;
  switch (id) {
    case "heading": body = <div className="grid gap-5 md:grid-cols-2">
      <TextField label="Page heading" value={draft.title} max={120} disabled={locked} target={CHICK_FIL_A_TARGETS.headingTitle} onChange={value => update(content => { content.title = value; })} />
      <TextField label="Subtitle" value={draft.subtitle} max={120} disabled={locked} target={CHICK_FIL_A_TARGETS.headingSubtitle} onChange={value => update(content => { content.subtitle = value; })} />
    </div>; break;
    case "details": body = <>
      <TextField label="Details heading" value={draft.detailsHeading} max={120} disabled={locked} target={CHICK_FIL_A_TARGETS.detailsHeading} onChange={value => update(content => { content.detailsHeading = value; })} />
      <TextField label="Details copy" value={draft.detailsBody} max={4000} multiline disabled={locked} target={CHICK_FIL_A_TARGETS.detailsBody} onChange={value => update(content => { content.detailsBody = value; })} />
      <ImageSlot api={api} slot="mealPass" altTarget={CHICK_FIL_A_TARGETS.detailsMealPassImageAlt} />
    </>; break;
    case "steps": body = <>{draft.stepLabels.map((label, index) => <EditorGroup legend={`Step ${index + 1}`} key={index}>
      <div className="grid min-w-0 gap-4 md:grid-cols-[1fr_8rem]">
        <TextField label="Label" value={label} max={120} disabled={locked} target={stepLabelTarget(index)} onChange={value => update(content => { content.stepLabels[index] = value; })} />
        <TextField label="Number" value={draft.stepNumbers[index]} max={12} disabled={locked} target={stepNumberTarget(index)} onChange={value => update(content => { content.stepNumbers[index] = value; })} />
      </div>
      <ImageSlot api={api} slot={(["driveThru", "freeTicket", "enjoyGame"] as const)[index]} altTarget={stepIconAltTarget(index)} />
    </EditorGroup>)}</>; break;
    case "map": body = <ImageSlot api={api} slot="map" altTarget={CHICK_FIL_A_TARGETS.mapImageAlt} />; break;
    case "match": body = <>
      <p className={styles.note}>The purchase link and unavailable message are shared with <Link className={kit.inlineLink} href="/admin/tickets">Tickets</Link>. Match heading, announcement and button text come from <Link className={kit.inlineLink} href="/admin/homepage">Homepage</Link>. Fixtures come from <Link className={kit.inlineLink} href="/admin/schedule">Schedule</Link>.</p>
      <ImageSlot api={api} slot="partner" altTarget={CHICK_FIL_A_TARGETS.matchPartnerImageAlt} />
    </>; break;
    case "restaurant": body = <ImageSlot api={api} slot="restaurant" altTarget={CHICK_FIL_A_TARGETS.restaurantImageAlt} />; break;
    case "background": body = <>
      <p className={styles.note}>Shown behind the Next home match card. It has no show or hide switch on the page.</p>
      <ImageSlot api={api} slot="background" altTarget={CHICK_FIL_A_TARGETS.backgroundImageAlt} />
    </>; break;
  }
  return <div className={styles.fields}>{top}<div className={kit.stack}>{body}</div></div>;
}
