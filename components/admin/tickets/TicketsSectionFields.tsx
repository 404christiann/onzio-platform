"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { kit, EditorGroup } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ValidationMessage, useStableKeys } from "@/components/admin/ui/editor-kit";
import { AddButton, IMAGE_NOTE, IMAGE_TYPES, ImageSlot, ReorderTools, ShowRow, TextField } from "@/components/admin/ticket-pages/editor-parts";
import styles from "@/components/admin/ticket-pages/ticket-editors.module.css";
import { type TicketArtworkSlot, type TicketVisibilityKey, type TicketsContent, type TicketsPageContent } from "@/lib/tickets-content";
import { moveItem } from "@/lib/cinematic-robinson-editor";
import type { EditTargetId } from "@/lib/admin-edit-targets";
import { TICKETS_TARGETS, benefitDetailTarget, benefitTitleTarget, perkLabelTarget } from "./tickets-edit-targets";
import { ticketsSectionFlag, ticketsSectionShown, ticketsSectionTitle, type TicketsSectionId } from "./tickets-sections";
import { LINK_DESTINATION_HINT, linkDestinationProblem } from "@/lib/link-destination";

export type TicketsFieldsApi = {
  draft: TicketsContent;
  page: TicketsPageContent;
  locked: boolean;
  uploading: TicketArtworkSlot | null;
  /** Edits a copy of the draft, as the editor always has. */
  update: (edit: (value: TicketsContent) => void) => void;
  setFlag: (key: TicketVisibilityKey, shown: boolean) => void;
  upload: (slot: TicketArtworkSlot, file: File) => Promise<boolean>;
  removeImage: (slot: TicketArtworkSlot) => void;
};

const MAX_BENEFITS = 10;

function BannerHeight({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (fraction: number) => void }) {
  const id = useId(), percent = Math.round(value * 1000) / 10;
  return <div className={styles.slider}>
    <label htmlFor={id}>Banner height</label>
    <div className={styles.sliderRow}>
      <input id={id} type="range" min={50} max={100} step={0.1} value={percent} disabled={disabled} aria-describedby={`${id}-hint`} aria-valuetext={`${percent} percent`}
        onChange={event => { const next = Number(event.target.value); if (next >= 50 && next <= 100) onChange(next / 100); }} />
      <output htmlFor={id}>{percent}%</output>
    </div>
    <span id={`${id}-hint`} className={kit.hint}>How much of the banner artwork shows, from 50% to 100%. Reduce it only to hide blank space beneath the artwork. A replacement image starts at 100%.</span>
  </div>;
}

function Benefits({ api }: { api: TicketsFieldsApi }) {
  const { draft, locked, update } = api;
  const { keys, removeAt } = useStableKeys(draft.benefits.length);
  return <div className={kit.stack}>
    {draft.benefits.map((benefit, index) => <EditorGroup key={keys[index]} legend={`Benefit ${index + 1}`}>
      <div className={styles.two}>
        <TextField label="Title" value={benefit.title} max={120} disabled={locked} target={benefitTitleTarget(index)} onChange={value => update(v => { v.benefits[index].title = value; })} />
        <TextField label="Details" value={benefit.detail} max={4000} multiline disabled={locked} target={benefitDetailTarget(index)} onChange={value => update(v => { v.benefits[index].detail = value; })} />
      </div>
      <ReorderTools index={index} length={draft.benefits.length} disabled={locked} noun="benefit"
        onMove={delta => update(v => { v.benefits = moveItem(v.benefits, index, delta); })}
        onRemove={() => { removeAt(index); update(v => { v.benefits.splice(index, 1); }); }} />
    </EditorGroup>)}
    <div><AddButton disabled={locked || draft.benefits.length >= MAX_BENEFITS} onClick={() => update(v => { v.benefits.push({ title: "", detail: "" }); })}>Add benefit</AddButton></div>
    <p className={styles.note}>{draft.benefits.length} of {MAX_BENEFITS} benefits.</p>
  </div>;
}

/** The fields of one card. Each edits the same TicketsContent key it always did. */
export function TicketsSectionFields({ api, id }: { api: TicketsFieldsApi; id: TicketsSectionId }) {
  const { draft, page, locked, uploading, update, setFlag, upload, removeImage } = api;
  const title = ticketsSectionTitle(id), flag = ticketsSectionFlag(id), shown = ticketsSectionShown(draft, id);
  const urlId = useId();
  const text = (label: string, key: "title" | "subtitle" | "perksHeading" | "includesHeading" | "benefitsNote" | "transitHeading" | "transitSubtitle" | "directionsHeading" | "directionsBody" | "parkingHeading" | "parkingBody" | "parkingNote" | "missingPurchaseLabel", target?: EditTargetId, multiline = false, hint?: string) =>
    <TextField label={label} value={draft[key]} max={multiline ? 4000 : 120} multiline={multiline} disabled={locked} hint={hint} target={target} onChange={value => update(v => { v[key] = value; })} />;
  const picture = (slot: TicketArtworkSlot, label: string, description: ReactNode, extra?: { dark?: boolean; hint?: string; size?: 64 | 72 | 96; altTarget?: EditTargetId }) =>
    <ImageSlot key={slot} label={label} description={description} previewUrl={page.artwork[slot].url} alt={draft.artwork[slot].alt} hasImage={!!draft.artwork[slot].assetId}
      disabled={locked} uploading={uploading === slot} {...extra} onUpload={file => upload(slot, file)} onRemove={() => removeImage(slot)}
      onAlt={alt => update(v => { v.artwork[slot].alt = alt; })} />;
  const urlProblem = linkDestinationProblem(draft.purchaseUrl);
  let body: ReactNode = null;
  switch (id) {
    case "page": body = <>
      <ShowRow label="Show the Buy button on the Tickets page" title="Show the Buy button on the Tickets page" checked={draft.purchaseVisible !== false} disabled={locked} onChange={next => setFlag("purchaseVisible", next)}
        copy="Hides the Buy button and its “coming soon” note on the Tickets page only. The Stadium and Chick-fil-A buy buttons are not affected." />
      <p className={styles.note}>Prices, ticket button text and the next-match announcement are shared with <Link className={kit.inlineLink} href="/admin/homepage">Homepage</Link>. Fixtures come from <Link className={kit.inlineLink} href="/admin/schedule">Schedule</Link>.</p>
      <div className={styles.two}>{text("Page heading", "title", TICKETS_TARGETS.pageTitle)}{text("Subtitle", "subtitle", TICKETS_TARGETS.pageSubtitle)}</div>
      <div className={styles.two}>
        <div className={styles.fieldWithLimit}>
          <TextField label="External ticket purchase URL" value={draft.purchaseUrl} max={2000} disabled={locked} invalid={!!urlProblem} target={TICKETS_TARGETS.pagePurchaseUrl} hint={LINK_DESTINATION_HINT}
            onChange={value => update(v => { v.purchaseUrl = value; })} />
          {urlProblem && <ValidationMessage id={urlId} live="polite">{urlProblem}</ValidationMessage>}
        </div>
        {text("Message until a purchase link is available", "missingPurchaseLabel", TICKETS_TARGETS.pageMissingPurchaseLabel)}
      </div>
      {picture("banner", "Banner", `${IMAGE_TYPES}. Shown across the top of the page, with the title.`, { altTarget: TICKETS_TARGETS.pageBannerImageAlt })}
      <BannerHeight value={draft.bannerHeightFraction} disabled={locked} onChange={fraction => update(v => { v.bannerHeightFraction = fraction; })} />
      {picture("partner", "Partner logo", `${IMAGE_TYPES}. Shown under the next home match, beside the Buy button.`, { altTarget: TICKETS_TARGETS.pagePartnerImageAlt })}
    </>; break;
    case "perks": body = <>
      {text("Perks heading", "perksHeading", TICKETS_TARGETS.perksHeading)}
      <div className={styles.perk}>
        {(["seat", "card", "raffle"] as const).map((slot, index) => <EditorGroup key={slot} legend={`Perk ${index + 1}`}>
          <TextField label="Label" value={draft.perkLabels[index]} max={120} disabled={locked} target={perkLabelTarget(index)} onChange={value => update(v => { v.perkLabels[index] = value; })} />
          {picture(slot, `Perk ${index + 1} image`, slot === "seat" ? `${IMAGE_TYPES}. White artwork: it sits on a dark tile on the page.` : `${IMAGE_TYPES}. A small icon above the label.`, { dark: slot === "seat", size: 64 })}
        </EditorGroup>)}
      </div></>; break;
    case "includes": body = <>
      {text("Benefits heading", "includesHeading", TICKETS_TARGETS.includesHeading)}
      <Benefits api={api} />
      {text("Benefits footnote", "benefitsNote", TICKETS_TARGETS.includesFootnote, true)}
    </>; break;
    case "transit": body = <>
      <div className={styles.two}>{text("Bus section heading", "transitHeading", TICKETS_TARGETS.transitHeading)}{text("Bus section subtitle", "transitSubtitle", TICKETS_TARGETS.transitSubtitle)}</div>
      <div className={styles.two}>
        {picture("bus", "Bus", `${IMAGE_TYPES}. The bus illustration.`, { altTarget: TICKETS_TARGETS.transitBusImageAlt })}
        {picture("map", "Bus and parking map", `${IMAGE_TYPES}. Shown full width under the bus.`, { altTarget: TICKETS_TARGETS.transitMapImageAlt })}
      </div></>; break;
    case "directions": body = <>
      <div className={styles.two}>{text("Directions heading", "directionsHeading", TICKETS_TARGETS.directionsHeading)}{text("Parking heading", "parkingHeading", TICKETS_TARGETS.directionsParkingHeading)}</div>
      {text("Directions", "directionsBody", TICKETS_TARGETS.directionsBody, true)}
      {text("Parking information", "parkingBody", TICKETS_TARGETS.directionsParkingBody, true)}
      {text("Parking footnote", "parkingNote", TICKETS_TARGETS.directionsParkingNote, true)}
    </>; break;
  }
  return <div className={styles.fields}>
    {flag && shown !== null && <ShowRow label={`Show ${title} on the page`} checked={shown} disabled={locked} onChange={next => setFlag(flag, next)} />}
    <div className={kit.stack}>{body}</div>
    {(id === "page" || id === "perks" || id === "transit") && <p className={styles.note}>{IMAGE_NOTE} Words in artwork change when you replace the image.</p>}
    {!flag && id === "page" && <p className={styles.note}>The heading, subtitle and banner are always shown.</p>}
  </div>;
}
