"use client";

import { useRef, type ReactNode } from "react";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { CINEMATIC_NAV_ITEMS, cinematicArtwork, isHomepageSectionShown, type CinematicArtworkSlot, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import type { PieceId } from "@/lib/homepage-editor/model";
import { IconUpload } from "@/components/admin/icons";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { EditorActionButton, EditorGroup, EditorReorderButtons, EditorRemoveButton, EditorSwitch, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { editTargetProps, type EditTargetId } from "@/lib/admin-edit-targets";
import { ARTWORK_TARGETS, HOMEPAGE_TARGETS, priceRowTarget } from "./homepage-edit-targets";

/** One labelled text field. The wrapping label keeps the field's accessible name equal to its visible label. */
function TextField({ label, value, maximum, disabled, multiline, target, onChange }: { label: string; value: string; maximum: number; disabled: boolean; multiline: boolean; target?: EditTargetId; onChange: (value: string) => void }) {
  return <label className={kit.field} {...editTargetProps(target)}><span className={kit.fieldLabel}>{label}</span>{multiline
    ? <textarea value={value} maxLength={maximum} disabled={disabled} onChange={event => onChange(event.target.value)} />
    : <input value={value} maxLength={maximum} disabled={disabled} onChange={event => onChange(event.target.value)} />}</label>;
}

/**
 * An artwork slot in the kit's image style. It keeps its own hidden file input labelled "Replace image" (the
 * browser tests choose files through that label) and runs the editor's replace, remove and retry handlers unchanged.
 */
function ArtworkField({ legend, help, url, alt, uploading, failed, error, disabled, removeLabel, onFile, onRemove, onRetry, children }: {
  legend: string; help?: string; url: string | null; alt: string; uploading: boolean; failed: boolean; error?: string | null; disabled: boolean;
  removeLabel?: string; onFile: (file: File) => void; onRemove?: () => void; onRetry: () => void; children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return <EditorGroup legend={legend}>
    {help && <p className={kit.hint}>{help}</p>}
    <div className={kit.image}>
      <div className={kit.imagePreview} aria-busy={uploading || undefined}>{url ? <ResilientNativeImage src={url} alt={alt} /> : <span className={kit.imageEmpty}>No image yet</span>}</div>
      <div className={kit.imageActions}>
        <input ref={input} type="file" className={kit.fileInput} tabIndex={-1} aria-label="Replace image" accept="image/png,image/webp" disabled={disabled || uploading} onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
        <button type="button" className={`admin-press ${kit.action}`} disabled={disabled || uploading} onClick={() => input.current?.click()}><IconUpload size={16} aria-hidden="true" />Replace image</button>
        {removeLabel && onRemove && <EditorRemoveButton disabled={disabled} onClick={onRemove}>{removeLabel}</EditorRemoveButton>}
      </div>
    </div>
    {uploading && <p role="status" className={kit.hint}>Adding your image…</p>}
    {failed && <div role="alert" className={`${kit.notice} grid gap-2`} data-tone="error"><p>{error ?? "This image could not be added."}</p><div><EditorActionButton disabled={disabled} onClick={onRetry}>Try adding it again</EditorActionButton></div></div>}
    {children}
    <p className={kit.hint}>PNG or WebP, up to 5 MB and 3000 pixels per side.</p>
    <p className={kit.hint}>Words inside the supplied image are changed by replacing the image.</p>
  </EditorGroup>;
}

export default function CinematicHomepageFields({ piece, part, content, disabled, change, replaceArtwork, retryArtwork }: {
  piece: PieceId;
  /** Overview editor: "Menu and footer" and "External forms" are separate parts of revamp.navigation. Omitted = both, as before. */
  part?: "menu" | "forms"; content: CinematicHomepageContent; disabled: boolean;
  change: (content: CinematicHomepageContent) => void;
  replaceArtwork: (slot: CinematicArtworkSlot, file: File) => void;
  retryArtwork: (slot: CinematicArtworkSlot) => void;
}) {
  const update = (edit: (draft: CinematicHomepageContent) => void) => { const draft = structuredClone(content); edit(draft); change(draft); };
  const text = (label: string, value: string, maximum: number, edit: (draft: CinematicHomepageContent, value: string) => void, multiline = false, target?: EditTargetId) =>
    <TextField label={label} value={value} maximum={maximum} disabled={disabled} multiline={multiline} target={target} onChange={next => update(draft => edit(draft, next))} />;
  const art = (slot: CinematicArtworkSlot, options: { legend?: string; help?: string; removeLabel?: string } = {}) => {
    const item = cinematicArtwork(content, slot);
    const uploading = item.upload === "uploading";
    return <ArtworkField legend={options.legend ?? "Image"} help={options.help} url={item.url} alt={item.alt} uploading={uploading} failed={item.upload === "failed"} error={item.error} disabled={disabled}
      removeLabel={options.removeLabel && (item.assetId || item.url) && !uploading ? options.removeLabel : undefined}
      onFile={file => replaceArtwork(slot, file)} onRetry={() => retryArtwork(slot)}
      onRemove={() => update(draft => { const art = cinematicArtwork(draft, slot); art.assetId = null; art.url = null; art.alt = ""; delete art.upload; delete art.localFileKey; delete art.error; })}>
      {text("Describe this image", item.alt, 1000, (draft, value) => { cinematicArtwork(draft, slot).alt = value; }, true, ARTWORK_TARGETS[slot])}
    </ArtworkField>;
  };
  /** The first row of a piece with a show/hide switch. All four homepage switches use it, so they read and sit the same. */
  const visibilitySwitch = (label: string, shown: boolean, edit: (draft: CinematicHomepageContent, visible: boolean) => void) =>
    <EditorSwitch checked={shown} label={label} disabled={disabled} offBadge="Hidden" onChange={visible => update(draft => edit(draft, visible))} />;
  const menuBody = <>{art("headerPartner", { legend: "Header sponsor logo", help: "Optional. Appears in the top header next to the menu. Remove it to show nothing there. Describe the Foothill Transit logo as “Foothill Transit” so it hides whenever the Foothill Transit page is hidden.", removeLabel: "Remove header sponsor logo" })}{art("footerLogo", { legend: "Footer logo", help: "Optional. When set, this logo appears alone in the footer instead of the club crest and name.", removeLabel: "Remove footer logo" })}<p className={kit.hint}>Rename the tabs and menu links. The footer uses the same names.</p>{CINEMATIC_NAV_ITEMS.flatMap(item => [item, ...("children" in item ? item.children ?? [] : [])]).map(item => <div key={item.id}>{text(item.label, content.navigation.labels[item.id] ?? item.label, 60, (draft, value) => { if (value.trim()) draft.navigation.labels[item.id] = value.trim(); else delete draft.navigation.labels[item.id]; })}</div>)}</>;
  const formsBody = <EditorGroup legend="External forms"><p className={kit.hint}>Tryouts, Media credentials, and National anthem request open these forms. Leave a destination blank to show the page placeholder.</p>{text("Tryouts form URL", content.navigation.destinations.tryouts, 2000, (draft, value) => { draft.navigation.destinations.tryouts = value; })}{text("Media credentials form URL", content.navigation.destinations.mediaCredentials, 2000, (draft, value) => { draft.navigation.destinations.mediaCredentials = value; })}{text("National anthem request form URL", content.navigation.destinations.nationalAnthem, 2000, (draft, value) => { draft.navigation.destinations.nationalAnthem = value; })}</EditorGroup>;
  if (piece === "revamp.sponsors") return <div className={kit.stack}>{text("Heading", content.sponsors.heading, 120, (draft, value) => { draft.sponsors.heading = value; }, false, HOMEPAGE_TARGETS.sponsorsHeading)}<p className={kit.hint}>Partner logos are managed in Branding.</p></div>;
  if (piece === "revamp.raffle") return <div className={kit.stack}>{visibilitySwitch("Show raffle photo on homepage", isHomepageSectionShown(content.raffle), (draft, visible) => { draft.raffle.visible = visible; })}{art("raffle")}</div>;
  if (piece === "revamp.ticket") return <div className={kit.stack}>{visibilitySwitch("Show ticket and map on homepage", content.ticket.visible, (draft, visible) => { draft.ticket.visible = visible; })}{art("ticket")}</div>;
  if (piece === "revamp.match") return <div className={kit.stack}>
    {visibilitySwitch("Show next home match on homepage", isHomepageSectionShown(content.match), (draft, visible) => { draft.match.visible = visible; })}
    <p className={kit.hint}>The next home match, opponent, date, time and venue come from Schedule.</p>
    {text("Heading", content.match.heading, 120, (draft, value) => { draft.match.heading = value; }, false, HOMEPAGE_TARGETS.matchHeading)}
    {text("Button text", content.match.buttonLabel, 60, (draft, value) => { draft.match.buttonLabel = value; }, false, HOMEPAGE_TARGETS.matchButton)}
    <label className={kit.field}><span className={kit.fieldLabel}>Where the button goes</span><NativeSelect className="min-h-11 rounded-[10px] text-base" disabled={disabled} value={content.match.buttonHref} onChange={event => update(draft => { draft.match.buttonHref = event.target.value; })}>{[{ href: "/tickets", label: "Tickets" }, { href: "/schedule", label: "Schedule" }, ...(!["/tickets", "/schedule"].includes(content.match.buttonHref) ? [{ href: content.match.buttonHref, label: "Current destination" }] : [])].map(item => <NativeSelectOption key={item.href} value={item.href}>{item.label}</NativeSelectOption>)}</NativeSelect></label>
    {text("When no home match is scheduled", content.match.emptyMessage, 1200, (draft, value) => { draft.match.emptyMessage = value; }, true, HOMEPAGE_TARGETS.matchEmpty)}
  </div>;
  if (piece === "revamp.prices") return <div className={kit.stack}>
    {visibilitySwitch("Show ticket prices on homepage", isHomepageSectionShown(content.prices), (draft, visible) => { draft.prices.visible = visible; })}
    {text("Heading", content.prices.heading, 120, (draft, value) => { draft.prices.heading = value; }, false, HOMEPAGE_TARGETS.pricesHeading)}
    {content.prices.rows.map((row, index) => <EditorGroup key={row.id} legend={`Ticket option ${index + 1}`}>
      {text("Name", row.label, 120, (draft, value) => { draft.prices.rows[index].label = value; }, false, priceRowTarget(row.id, "label"))}
      {text("Price or offer", row.price, 60, (draft, value) => { draft.prices.rows[index].price = value; }, false, priceRowTarget(row.id, "price"))}
      {text("Description", row.description, 1200, (draft, value) => { draft.prices.rows[index].description = value; }, true, priceRowTarget(row.id, "description"))}
      {text("Small print", row.note, 1200, (draft, value) => { draft.prices.rows[index].note = value; }, true, priceRowTarget(row.id, "note"))}
      <label className={kit.field}><span className={kit.fieldLabel}>Price color</span><NativeSelect className="min-h-11 rounded-[10px] text-base" value={row.accent} disabled={disabled} onChange={event => update(draft => { draft.prices.rows[index].accent = event.target.value as typeof row.accent; })}><NativeSelectOption value="none">Standard</NativeSelectOption><NativeSelectOption value="aqua">Aqua</NativeSelectOption><NativeSelectOption value="lime">Green</NativeSelectOption></NativeSelect></label>
      <EditorReorderButtons index={index} length={content.prices.rows.length} disabled={disabled} noun="ticket option" onMove={delta => update(draft => { [draft.prices.rows[index], draft.prices.rows[index + delta]] = [draft.prices.rows[index + delta], draft.prices.rows[index]]; })} onRemove={() => update(draft => { draft.prices.rows.splice(index, 1); })} />
    </EditorGroup>)}
    <div><EditorActionButton disabled={disabled || content.prices.rows.length >= 10} onClick={() => update(draft => { draft.prices.rows.push({ id: crypto.randomUUID(), label: "", price: "", description: "", note: "", accent: "none" }); })}>Add ticket option</EditorActionButton></div>
    {text("Footnote", content.prices.footnote, 1200, (draft, value) => { draft.prices.footnote = value; }, true, HOMEPAGE_TARGETS.pricesFootnote)}
  </div>;
  if (piece === "revamp.championship") return <div className={kit.stack}>
    {text("League or conference", content.championship.league, 120, (draft, value) => { draft.championship.league = value; }, false, HOMEPAGE_TARGETS.championshipLeague)}
    {text("Year", content.championship.year, 20, (draft, value) => { draft.championship.year = value; }, false, HOMEPAGE_TARGETS.championshipYear)}
    {text("Heading", content.championship.title, 120, (draft, value) => { draft.championship.title = value; }, false, HOMEPAGE_TARGETS.championshipTitle)}
    {text("Paragraph", content.championship.body, 1200, (draft, value) => { draft.championship.body = value; }, true, HOMEPAGE_TARGETS.championshipBody)}
    {art("trophy")}
  </div>;
  if (piece === "revamp.navigation") return <div className={kit.stack}>{part !== "forms" && menuBody}{part !== "menu" && formsBody}</div>;
  return null;
}
