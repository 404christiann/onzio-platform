"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import CinematicKnowBeforeYouGo from "@/components/cinematic/CinematicKnowBeforeYouGo";
import { kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { MAX_KBYG_TILES, type KnowBeforeYouGoContent } from "@/lib/cinematic-ticket-pages-content";
import { addListItem, moveListItem, removeListItem } from "@/lib/cinematic-ticket-pages-editor";
import { AddButton, ICON_HINT, IMAGE_NOTE, IMAGE_TYPES, ImageSlot, ReorderTools, LinkTextField, ShowRow, TextField } from "./editor-parts";
import TicketPageEditor, { type TicketPageFieldsApi } from "./TicketPageEditor";
import { KBYG_SPEC, ticketPageSectionShown, type KbygSectionId } from "./ticket-page-sections";
import { KBYG_TARGETS, kbygPreviewStamps, kbygTileIconAltTarget, kbygTileLabelTarget } from "./ticket-page-edit-targets";
import type { EditTargetId } from "@/lib/admin-edit-targets";
import styles from "./ticket-editors.module.css";

type Api = TicketPageFieldsApi<"know-before-you-go">;

/** The dialog body for one card. Exported so the contract tests can render every card's controls. */
export function fields(api: Api, id: string): ReactNode {
  const { draft, view, locked, uploading, change, setShown, upload, removeImage } = api;
  const section = id as KbygSectionId, { heading, match, facts, raffle, donor } = draft;
  const set = <S extends keyof KnowBeforeYouGoContent>(part: S, value: Partial<KnowBeforeYouGoContent[S]>) => change(content => ({ ...content, [part]: { ...content[part], ...value } }));
  const shown = ticketPageSectionShown(KBYG_SPEC, draft, section);
  const title = KBYG_SPEC.sections.find(item => item.id === section)!.title;
  const picture = (slot: string, label: string, description: ReactNode, altTarget: EditTargetId, hint?: string, extra?: { bare?: boolean; size?: 64 | 72 | 96 }) => draft.images[slot] &&
    <ImageSlot key={slot} label={label} description={description} hint={hint} altTarget={altTarget} {...extra} previewUrl={view.images[slot]?.url ?? null} alt={draft.images[slot].alt} hasImage={!!draft.images[slot].assetId}
      disabled={locked} uploading={uploading === slot} onUpload={file => upload(slot, file)} onRemove={() => removeImage(slot)}
      onAlt={alt => change(content => ({ ...content, images: { ...content.images, [slot]: { ...content.images[slot], alt } } }))} />;
  let body: ReactNode = null;
  switch (section) {
    case "heading": body = <>
      <div className={styles.two}>
        <TextField label="Title" value={heading.title} max={120} disabled={locked} target={KBYG_TARGETS.headingTitle} onChange={title => set("heading", { title })} />
        <TextField label="Subtitle (red line)" value={heading.subtitle} max={120} disabled={locked} target={KBYG_TARGETS.headingSubtitle} onChange={subtitle => set("heading", { subtitle })} />
      </div>
      <p className={styles.note}>The page heading is always shown.</p>
    </>; break;
    case "match": body = <>
      <p className={styles.note}>The date, venue, opponent and both crests come from the next home match in <Link className={kit.inlineLink} href="/admin/schedule">Schedule</Link>. You edit only the words around them.</p>
      <TextField label="Competition line" value={match.competition} max={120} disabled={locked} hint="Used when the Schedule match has no competition." target={KBYG_TARGETS.matchCompetition} onChange={competition => set("match", { competition })} />
      <div className={styles.two}>
        <TextField label="Watch line" value={match.watchLabel} max={120} disabled={locked} target={KBYG_TARGETS.matchWatchLabel} onChange={watchLabel => set("match", { watchLabel })} />
        <LinkTextField label="Game-day live stream link" value={match.watchHref} max={2000} disabled={locked} target={KBYG_TARGETS.matchWatchHref} onChange={watchHref => set("match", { watchHref })} />
      </div>
      {picture("youtube", "YouTube logo", `${IMAGE_TYPES}. Shown after the watch line.`, KBYG_TARGETS.matchYoutubeImageAlt, "Until the logo is added, this description shows as text after the watch line.")}
    </>; break;
    case "facts": body = <>
      <p className={styles.note}>An icon and a short label each, 3 across on desktop. Up to {MAX_KBYG_TILES} tiles.</p>
      <div className={styles.grid} data-tiles-grid="">{facts.tiles.map((tile, index) => <fieldset key={tile.id} className={styles.tile}>
        <legend>Tile {index + 1}</legend>
        <TextField label="Label" value={tile.label} max={120} disabled={locked} target={kbygTileLabelTarget(tile.id)} onChange={label => set("facts", { tiles: facts.tiles.map((current, position) => position === index ? { ...current, label } : current) })} />
        {picture(tile.id, `Icon for tile ${index + 1}`, `${IMAGE_TYPES}.`, kbygTileIconAltTarget(tile.id), ICON_HINT, { bare: true, size: 64 })}
        <ReorderTools index={index} length={facts.tiles.length} disabled={locked} noun="tile" onMove={delta => change(content => moveListItem("know-before-you-go", content, "tiles", index, delta))}
          onRemove={() => change(content => removeListItem("know-before-you-go", content, "tiles", index))} />
      </fieldset>)}</div>
      <div><AddButton disabled={locked || facts.tiles.length >= MAX_KBYG_TILES} onClick={() => change(content => addListItem("know-before-you-go", content, "tiles"))}>Add tile</AddButton></div>
      <p className={styles.note}>{facts.tiles.length} of {MAX_KBYG_TILES} tiles.</p>
    </>; break;
    case "raffle": body = <>
      <div className={styles.two}>
        <TextField label="Heading" value={raffle.heading} max={120} disabled={locked} target={KBYG_TARGETS.raffleHeading} onChange={value => set("raffle", { heading: value })} />
        <TextField label="Prize (red line)" value={raffle.subheading} max={120} disabled={locked} target={KBYG_TARGETS.raffleSubheading} onChange={subheading => set("raffle", { subheading })} />
      </div>
      {picture("raffle", "Prize photo", `${IMAGE_TYPES}. Shown under the prize line.`, KBYG_TARGETS.raffleImageAlt, "Leave empty when the text next to the image already says the same thing.")}
      <TextField label="Text" value={raffle.body} max={2000} multiline disabled={locked} hint="Put **two stars** on each side of words to make them bold, for example **PlayStation 5**." target={KBYG_TARGETS.raffleBody} onChange={body => set("raffle", { body })} />
    </>; break;
    case "donor": body = <>
      <div className={styles.two}>
        <TextField label="Heading" value={donor.heading} max={120} disabled={locked} target={KBYG_TARGETS.donorHeading} onChange={value => set("donor", { heading: value })} />
        <TextField label="Donor name" value={donor.name} max={120} disabled={locked} hint="Shows in place of the logo until the logo is added." target={KBYG_TARGETS.donorName} onChange={name => set("donor", { name })} />
      </div>
      {picture("donor", "Donor logo", `${IMAGE_TYPES}. Shown under the heading.`, KBYG_TARGETS.donorImageAlt)}
      <TextField label="About the donor" value={donor.body} max={4000} multiline disabled={locked} target={KBYG_TARGETS.donorBody} onChange={body => set("donor", { body })} />
      <div className={styles.two}>
        <TextField label="Button text" value={donor.buttonLabel} max={60} disabled={locked} target={KBYG_TARGETS.donorButtonLabel} onChange={buttonLabel => set("donor", { buttonLabel })} />
        <LinkTextField label="Button link" value={donor.buttonHref} max={2000} disabled={locked} target={KBYG_TARGETS.donorButtonHref} onChange={buttonHref => set("donor", { buttonHref })} />
      </div>
    </>; break;
  }
  return <div className={styles.fields}>
    {shown !== null && <ShowRow label={`Show ${title} on the page`} checked={shown} disabled={locked} onChange={next => setShown(section, next)} />}
    <div className={kit.stack}>{body}</div>
    {section !== "heading" && <p className={styles.note}>{IMAGE_NOTE} Dashed boxes in the preview mark images still to add. Visitors never see them.</p>}
  </div>;
}

/** Module-level, so TicketPageEditor builds each card's stamps once per draft. */
const stamps = (content: KnowBeforeYouGoContent, id: string) => kbygPreviewStamps(content, id as KbygSectionId);

export default function KnowBeforeYouGoEditor() {
  return <TicketPageEditor spec={KBYG_SPEC} title="Know Before You Go" description="Edit the Know Before You Go page in the Tickets menu. Update the raffle prize and donor each match. Save applies all changes together."
    openPageHref="/tickets/know-before-you-go" renderFields={fields} stamps={stamps}
    renderLive={view => <CinematicKnowBeforeYouGo content={view} placeholders />} />;
}
