"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import ResilientImage from "@/components/ResilientImage";
import FileUpload from "@/components/admin/FileUpload";
import { ChevronDown as OrderDown, ChevronUp as OrderUp, X as RemoveIcon } from "@/components/admin/icons";
import { EditorActionButton, EditorGroup, EditorPageLink, EditorRemoveButton, EditorSegmented, EditorSwitch, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { TableEditor, ValidationMessage } from "@/components/admin/ui/editor-kit";
import { editTargetProps, type EditTargetId } from "@/lib/admin-edit-targets";
import {
  APPROVED_SHOP_MAP_CROP, MAX_SHOP_ATTRIBUTES, MAX_SHOP_DETAILS, MAX_SHOP_EDITIONS, MAX_SHOP_SIZE_COLUMNS, MAX_SHOP_SIZE_ROWS,
  SHOP_CARD_ICONS, isShopEditionShown, withShopEditionShown, type CinematicShopPresentation, type ShopCardIcon, type ShopDetailPresentation, type ShopEdition,
} from "@/lib/cinematic-shop-content";
import type { ShopPhoto, ShopSection, ShopSurface, ShopVariant } from "@/lib/shop-editor/contract";
import type { ShopPageDraft } from "@/lib/shop-editor/model";
import { SmoothSlider } from "./SmoothSlider";
import { sizeColumnsFromText, sizeRowsFromTable, sizeTableRows } from "./shop-fields-model";
import { SHOP_TARGETS, cardTarget, editionTarget, kitTarget, measurementCellTarget, tileTarget } from "../shop-edit-targets";

export type ShopSectionId = "editions" | "kitPhotos" | "kitText" | "photoRow" | "purchase" | "details" | "care" | "sizes" | "map" | "partners" | "labels";

export const KIT_NAMES: Record<ShopVariant, string> = { home: "Home kit", away: "Away kit", third: "Third kit" };
/** Option i is the kit SHOP_EDITION_VARIANTS[i]: Home, Away, Third. */
const EDITION_KIT_LABELS = ["Home kit option", "Away kit option", "Third kit option"];
const CARD_ICON_LABELS: Record<ShopCardIcon, string> = { "": "No icon", video: "Video camera", jersey: "Jersey", "shipping-box": "Shipping box", "no-access": "No returns" };

export type ShopFieldsProps = {
  surface: ShopSurface;
  kitId: ShopVariant;
  draft: ShopPageDraft;
  maxBulletPoints: number;
  uploading: boolean;
  setSectionField: <K extends keyof ShopSection>(variant: ShopVariant, field: K, value: ShopSection[K]) => void;
  setKitPhotos: (variant: ShopVariant, photos: ShopPhoto[]) => void;
  setRowPhotos: (variant: ShopVariant, photos: ShopPhoto[]) => void;
  uploadPhotos: (variant: ShopVariant, files: FileList | null, strip: boolean) => void;
  removePhoto: (variant: ShopVariant, photo: ShopPhoto, strip: boolean) => void;
  updatePurchase: (field: keyof ShopPageDraft["purchase"], value: string | ShopPageDraft["purchase"]["cards"]) => void;
  updatePresentation: <K extends keyof CinematicShopPresentation>(field: K, value: CinematicShopPresentation[K]) => void;
  uploadMap: (files: FileList | null) => void;
  removeMap: () => void;
  uploadDetail: (index: number, files: FileList | null) => void;
  removeDetail: (index: number) => void;
};

function Text({ label, value, onChange, type = "text", maxLength, help, target }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "url"; maxLength?: number; help?: ReactNode; target?: EditTargetId }) {
  const id = useId();
  return <div className={kit.field} {...editTargetProps(target)}><label htmlFor={id}>{label}</label><input id={id} type={type} value={value} maxLength={maxLength} onChange={event => onChange(event.target.value)} />{help && <span className={kit.hint}>{help}</span>}</div>;
}
function TextArea({ label, value, onChange, maxLength, rows = 4, target }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number; rows?: number; target?: EditTargetId }) {
  const id = useId();
  return <div className={kit.field} {...editTargetProps(target)}><label htmlFor={id}>{label}</label><textarea id={id} rows={rows} value={value} maxLength={maxLength} onChange={event => onChange(event.target.value)} /></div>;
}
/** `offBadge` names the state beside the switch while it is off ("Hidden"); the switch keeps its label as its accessible name. */
function Toggle({ label, value, onChange, target, offBadge }: { label: string; value: boolean; onChange: (value: boolean) => void; target?: EditTargetId; offBadge?: string }) {
  return <div {...editTargetProps(target)}><EditorSwitch label={label} checked={value} disabled={false} onChange={onChange} offBadge={offBadge} /></div>;
}

/** The kit photos or the photo row: up to six, reorder with arrows, upload several at once. */
export function ShopPhotoList({ photos, label, uploading, min, onUpload, onRemove, onChange }: {
  photos: ShopPhoto[]; label: "kit" | "photo row"; uploading: boolean; min: number;
  onUpload: (files: FileList | null) => void; onRemove: (photo: ShopPhoto) => void; onChange: (photos: ShopPhoto[]) => void;
}) {
  const order = (next: ShopPhoto[]) => next.map((photo, i) => ({ ...photo, order: i }));
  const move = (index: number, to: number) => { const next = [...photos]; [next[to], next[index]] = [next[index], next[to]]; onChange(order(next)); };
  return <div className={kit.stack}>
    <p className={kit.hint}>{photos.length} of 6 photos{min ? ` · at least ${min}` : ""}. Use the arrows to set the order visitors see.</p>
    {photos.map((photo, index) => <div key={photo.rowId ?? photo.assetId ?? index} className="flex items-center gap-2 rounded-lg border border-border p-2">
      <ResilientImage src={photo.url} alt={`${label} ${index + 1}`} width={56} height={56} className="h-14 w-14 rounded-md object-cover" />
      <span className="flex-1 text-sm">Photo {index + 1}</span>
      <button type="button" aria-label={`Move ${label} photo ${index + 1} up`} disabled={uploading || index === 0} onClick={() => move(index, index - 1)} className="admin-press min-h-11 min-w-11 rounded-md border border-border disabled:opacity-40"><OrderUp size={16} className="inline-block align-middle" /></button>
      <button type="button" aria-label={`Move ${label} photo ${index + 1} down`} disabled={uploading || index === photos.length - 1} onClick={() => move(index, index + 1)} className="admin-press min-h-11 min-w-11 rounded-md border border-border disabled:opacity-40"><OrderDown size={16} className="inline-block align-middle" /></button>
      <button type="button" aria-label={`Remove ${label} photo ${index + 1}`} disabled={uploading} onClick={() => onRemove(photo)} className="admin-press min-h-11 min-w-11 rounded-md bg-destructive font-semibold text-destructive-foreground disabled:opacity-40"><RemoveIcon size={16} className="inline-block align-middle" /></button>
    </div>)}
    <FileUpload label={`Add ${label} photos`} accept="image/*" multiple onUpload={onUpload} uploading={uploading} disabled={photos.length >= 6} />
    {label === "kit" && photos.length === 0 && <ValidationMessage live="polite">Add at least one photo before saving this kit.</ValidationMessage>}
  </div>;
}

/** Sizes as typed text. The typed text is kept locally so a trailing comma survives; the saved columns follow it. */
function SizeColumnsField({ columns, onChange }: { columns: string[]; onChange: (columns: string[]) => void }) {
  const id = useId();
  const [text, setText] = useState(columns.join(", "));
  useEffect(() => {
    // Follow external changes (discard, reload) but not our own typing.
    setText(current => JSON.stringify(sizeColumnsFromText(current)) === JSON.stringify(columns) ? current : columns.join(", "));
  }, [columns]);
  return <div className={kit.field} {...editTargetProps(SHOP_TARGETS.sizes)}>
    <label htmlFor={id}>Sizes, separated by commas</label>
    <input id={id} type="text" value={text} onChange={event => { setText(event.target.value); onChange(sizeColumnsFromText(event.target.value)); }} />
    <span className={kit.hint}>Up to {MAX_SHOP_SIZE_COLUMNS} sizes. Every measurement keeps one value per size.</span>
  </div>;
}

export function RoseCityShopFields(props: ShopFieldsProps & { id: ShopSectionId }) {
  const { id, surface, kitId, draft, maxBulletPoints, uploading, updatePresentation, updatePurchase } = props;
  const editionsHeadingId = useId();
  const value = draft.presentation;
  const kitDraft = draft.variants[kitId];
  const section = kitDraft.section;
  const editions = value.editions, details = value.details, chart = value.sizeChart;
  const setEdition = (index: number, changes: Partial<ShopEdition>) => updatePresentation("editions", editions.map((item, i) => i === index ? { ...item, ...changes } : item));
  const setDetail = (index: number, changes: Partial<ShopDetailPresentation>) => updatePresentation("details", details.map((item, i) => i === index ? { ...item, ...changes } : item));
  const field = <K extends keyof ShopSection>(name: K, next: ShopSection[K]) => props.setSectionField(kitId, name, next);

  if (id === "kitPhotos") return <div className={kit.stack}>
    <p className={kit.hint}>The {KIT_NAMES[kitId].toLowerCase()} needs at least one photo, at most six. The first is the large one.</p>
    <ShopPhotoList photos={kitDraft.photos} label="kit" min={1} uploading={uploading} onUpload={files => props.uploadPhotos(kitId, files, false)} onRemove={photo => props.removePhoto(kitId, photo, false)} onChange={photos => props.setKitPhotos(kitId, photos)} />
  </div>;

  if (id === "kitText") return <div className={kit.stack}>
    <Text target={kitTarget(kitId, "eyebrow")} label="Small heading" value={section.eyebrow} maxLength={160} onChange={text => field("eyebrow", text)} />
    <Text target={kitTarget(kitId, "title")} label="Kit title" value={section.title} maxLength={240} onChange={text => field("title", text)} />
    <TextArea target={kitTarget(kitId, "description")} label="Description" value={section.description} maxLength={3000} onChange={text => field("description", text)} />
    <TextArea target={kitTarget(kitId, "bullets")} label="Bullet points, one per line" value={section.bullet_points.join("\n")} onChange={text => field("bullet_points", text.split("\n").slice(0, maxBulletPoints))} />
    <TextArea target={kitTarget(kitId, "storeNote")} label="Store information" value={section.store_note} maxLength={180} rows={3} onChange={text => field("store_note", text)} />
    <Text target={kitTarget(kitId, "buttonLabel")} label="Button text" value={section.cta_label} maxLength={100} onChange={text => field("cta_label", text)} />
    {surface === "home"
      ? <p className={kit.hint}>The homepage button opens this club’s Shop page.</p>
      : <Text target={kitTarget(kitId, "buyLink")} label="Buy link" value={section.cta_link} onChange={text => field("cta_link", text)} help="The full https:// address of your store or merchandise partner, or an email address if supporters order by email." />}
  </div>;

  if (id === "photoRow") return <div className={kit.stack}>
    <p className={kit.hint}>Photos in the row under the {KIT_NAMES[kitId].toLowerCase()}. Up to six.</p>
    <ShopPhotoList photos={draft.photoRows[kitId]} label="photo row" min={0} uploading={uploading} onUpload={files => props.uploadPhotos(kitId, files, true)} onRemove={photo => props.removePhoto(kitId, photo, true)} onChange={photos => props.setRowPhotos(kitId, photos)} />
  </div>;

  if (id === "editions") return <div className={kit.stack}>
    <p className={kit.hint}>Each option shows one whole kit: the first is the Home kit, the second the Away kit, the third the Third kit. Choosing an option switches the kit photos, words, photo row and the line under the title. An option appears on the website once its kit has been saved. Leave a purchase link blank to use that kit’s Buy now link. Switch an option off to hide that jersey from the website without deleting it.</p>
    <div className={kit.field} {...editTargetProps(SHOP_TARGETS.editionsHeading)}><label htmlFor={editionsHeadingId}>Section heading</label><input id={editionsHeadingId} type="text" value={value.editionsHeading ?? ""} placeholder="Select your jersey" maxLength={80} onChange={event => updatePresentation("editionsHeading", event.target.value)} /></div>
    {editions.map((edition, index) => <EditorGroup key={index} legend={EDITION_KIT_LABELS[index] ?? `Jersey option ${index + 1}`}>
      {/* First row: switching a jersey off hides it from the website without deleting it. Its fields stay editable. */}
      <Toggle label="Show this jersey in the shop" offBadge="Hidden" value={isShopEditionShown(edition)} onChange={show => updatePresentation("editions", editions.map((item, i) => i === index ? withShopEditionShown(item, show) : item))} />
      <Text target={editionTarget(index, "label")} label="Button label" value={edition.label} maxLength={80} onChange={text => setEdition(index, { label: text })} />
      <Text target={editionTarget(index, "price")} label="Price" value={edition.price} maxLength={40} onChange={text => setEdition(index, { price: text })} />
      <Text target={editionTarget(index, "line")} label="Line under the title" value={edition.line} maxLength={160} onChange={text => setEdition(index, { line: text })} />
      <Text target={editionTarget(index, "link")} label="Purchase link (optional)" type="url" value={edition.link} onChange={text => setEdition(index, { link: text.trim() })} />
      {/* Only the last option can be removed, so the others keep their kits. */}
      {index === editions.length - 1
        ? <EditorRemoveButton onClick={() => updatePresentation("editions", editions.slice(0, -1))}>Remove {(EDITION_KIT_LABELS[index] ?? `option ${index + 1}`).toLowerCase()}</EditorRemoveButton>
        : <p className={kit.hint} data-edition-locked="">Only the last option can be removed.</p>}
    </EditorGroup>)}
    {editions.length < MAX_SHOP_EDITIONS && <div><EditorActionButton onClick={() => updatePresentation("editions", [...editions, { label: "", price: "", line: "", link: "" }])}>Add {EDITION_KIT_LABELS[editions.length].toLowerCase()}</EditorActionButton></div>}
  </div>;

  if (id === "purchase") return <div className={kit.stack}>
    <Text target={SHOP_TARGETS.purchaseHeading} label="Section heading" value={draft.purchase.heading} maxLength={160} onChange={text => updatePurchase("heading", text)} />
    {draft.purchase.cards.map((card, index) => <EditorGroup key={index} legend={`Detail card ${index + 1}`}>
      <Text target={cardTarget(index, "label")} label="Label" value={card.label} maxLength={100} onChange={text => updatePurchase("cards", draft.purchase.cards.map((item, i) => i === index ? { ...item, label: text } : item))} />
      <Text target={cardTarget(index, "title")} label="Title" value={card.title} maxLength={160} onChange={text => updatePurchase("cards", draft.purchase.cards.map((item, i) => i === index ? { ...item, title: text } : item))} />
      <TextArea target={cardTarget(index, "body")} label="Body" value={card.body} maxLength={600} onChange={text => updatePurchase("cards", draft.purchase.cards.map((item, i) => i === index ? { ...item, body: text } : item))} />
      <div className={kit.field} {...editTargetProps(cardTarget(index, "icon"))}><label htmlFor={`${editionsHeadingId}-icon-${index}`}>Icon</label>
        <select id={`${editionsHeadingId}-icon-${index}`} value={value.cardIcons[index] ?? ""} onChange={event => updatePresentation("cardIcons", draft.purchase.cards.map((_, i) => i === index ? event.target.value as ShopCardIcon : value.cardIcons[i] ?? ""))}>
          {SHOP_CARD_ICONS.map(icon => <option key={icon} value={icon}>{CARD_ICON_LABELS[icon]}</option>)}
        </select></div>
      <EditorRemoveButton label={`Remove detail card ${index + 1}`} onClick={() => {
        updatePurchase("cards", draft.purchase.cards.filter((_, i) => i !== index));
        if (value.cardIcons.length > index) updatePresentation("cardIcons", value.cardIcons.filter((_, i) => i !== index));
      }}>Remove card</EditorRemoveButton>
    </EditorGroup>)}
    {draft.purchase.cards.length < 4 && <div><EditorActionButton onClick={() => updatePurchase("cards", [...draft.purchase.cards, { label: "", title: "", body: "" }])}>Add detail card</EditorActionButton></div>}
    <Text target={SHOP_TARGETS.purchaseFooterLabel} label="Footer label" value={draft.purchase.cta_eyebrow} maxLength={120} onChange={text => updatePurchase("cta_eyebrow", text)} />
    <TextArea target={SHOP_TARGETS.purchaseFooterText} label="Footer text" value={draft.purchase.cta_text} maxLength={600} onChange={text => updatePurchase("cta_text", text)} />
    <Text target={SHOP_TARGETS.purchaseButtonLabel} label="Button text" value={draft.purchase.cta_label} maxLength={100} onChange={text => updatePurchase("cta_label", text)} />
    <Text target={SHOP_TARGETS.purchaseButtonLink} label="Button link" type="url" value={draft.purchase.cta_link} onChange={text => updatePurchase("cta_link", text)} />
  </div>;

  if (id === "details") return <div className={kit.stack}>
    <Text target={SHOP_TARGETS.detailsHeading} label="Section heading" value={value.detailsHeading} maxLength={120} onChange={text => updatePresentation("detailsHeading", text)} />
    <p className={kit.hint}>Up to {MAX_SHOP_DETAILS} tiles. A tile without a photo shows a white box on the website.</p>
    {details.map((detail, index) => <EditorGroup key={index} legend={`Tile ${index + 1}`}>
      {detail.url ? <NativeImage src={detail.url} alt={detail.alt || `Tile ${index + 1} photo`} className="h-auto w-full rounded-lg border border-border" />
        : <p className={`${kit.hint} rounded-lg border border-dashed border-border p-3`}>No photo yet. The website shows a white box here.</p>}
      <FileUpload label={detail.assetId ? "Replace photo" : "Upload photo"} accept="image/png,image/jpeg,image/webp" onUpload={files => props.uploadDetail(index, files)} uploading={uploading} />
      {detail.assetId && <EditorRemoveButton disabled={uploading} label={`Remove tile ${index + 1} photo`} onClick={() => props.removeDetail(index)}>Remove photo</EditorRemoveButton>}
      <Text target={tileTarget(index, "photoAlt")} label="Photo description" value={detail.alt} maxLength={600} onChange={text => setDetail(index, { alt: text })} />
      <Text target={tileTarget(index, "title")} label="Title" value={detail.title} maxLength={80} onChange={text => setDetail(index, { title: text })} />
      <TextArea target={tileTarget(index, "text")} label="Text" value={detail.body} maxLength={600} onChange={text => setDetail(index, { body: text })} />
      <EditorRemoveButton disabled={uploading} onClick={() => { if (detail.assetId) props.removeDetail(index); updatePresentation("details", details.filter((_, i) => i !== index)); }}>Remove tile {index + 1}</EditorRemoveButton>
    </EditorGroup>)}
    {details.length < MAX_SHOP_DETAILS && <div><EditorActionButton onClick={() => updatePresentation("details", [...details, { assetId: null, alt: "", title: "", body: "" }])}>Add tile</EditorActionButton></div>}
  </div>;

  if (id === "care") return <div className={kit.stack}>
    <TextArea target={SHOP_TARGETS.care} label="Color, material and care, one per line" value={value.attributes.join("\n")} onChange={text => updatePresentation("attributes", text.split("\n").slice(0, MAX_SHOP_ATTRIBUTES))} />
    <p className={kit.hint}>Up to {MAX_SHOP_ATTRIBUTES} items, shown in one line under the Jersey Information cards.</p>
  </div>;

  if (id === "sizes") {
    const columns = [{ key: "label", label: "Measurement", maxLength: 40 }, ...chart.columns.map((size, i) => ({ key: `c${i}`, label: size || `Size ${i + 1}`, maxLength: 30 }))];
    return <div className={kit.stack}>
      <Text target={SHOP_TARGETS.sizesHeading} label="Section heading" value={chart.heading} maxLength={80} onChange={text => updatePresentation("sizeChart", { ...chart, heading: text })} />
      <SizeColumnsField columns={chart.columns} onChange={cols => updatePresentation("sizeChart", { ...chart, columns: cols, rows: chart.rows.map(row => ({ ...row, values: cols.map((_, i) => row.values[i] ?? "") })) })} />
      <TableEditor label="Measurements" columns={columns} rows={sizeTableRows(chart)} maxRows={MAX_SHOP_SIZE_ROWS} rowLabel="measurement" cellTarget={measurementCellTarget}
        onChange={rows => updatePresentation("sizeChart", { ...chart, rows: sizeRowsFromTable(rows, chart.columns.length) })} />
      <Text target={SHOP_TARGETS.sizesNote} label="Note under the chart" value={chart.note} maxLength={80} onChange={text => updatePresentation("sizeChart", { ...chart, note: text })} />
    </div>;
  }

  if (id === "map") return <div className={kit.stack}>
    <Toggle target={SHOP_TARGETS.mapVisible} label="Show map on Shop page" value={value.mapVisible} onChange={show => updatePresentation("mapVisible", show)} />
    <Text target={SHOP_TARGETS.mapHeading} label="Map heading" value={value.mapHeading} maxLength={120} onChange={text => updatePresentation("mapHeading", text)} />
    {value.mapUrl && <NativeImage src={value.mapUrl} alt={value.mapAlt || "Shop map preview"} className="h-auto w-full rounded-lg border border-border" />}
    <FileUpload label={value.mapUrl ? "Replace map image" : "Upload map image"} accept="image/png,image/webp" onUpload={props.uploadMap} uploading={uploading} />
    <p className={kit.hint}>Use PNG or WebP. The original map is kept; framing only changes what appears on this page.</p>
    {value.mapAssetId && <EditorRemoveButton disabled={uploading} onClick={props.removeMap}>Remove map</EditorRemoveButton>}
    <Text target={SHOP_TARGETS.mapDescription} label="Map description" value={value.mapAlt} maxLength={600} onChange={text => updatePresentation("mapAlt", text)} />
    <Toggle target={SHOP_TARGETS.mapWholeImage} label="Show the whole map image" value={!value.mapCrop} onChange={whole => updatePresentation("mapCrop", whole ? null : { ...APPROVED_SHOP_MAP_CROP })} />
    {value.mapCrop && <div className="grid grid-cols-2 gap-3" {...editTargetProps(SHOP_TARGETS.mapCrop)}>{(["x", "y", "width", "height"] as const).map(name => <NumberField key={name} label={name === "x" ? "Left edge (%)" : name === "y" ? "Top edge (%)" : name === "width" ? "Frame width (%)" : "Frame height (%)"} value={value.mapCrop![name]} min={name === "width" || name === "height" ? 1 : 0} max={100} onChange={number => {
      const crop = { ...value.mapCrop!, [name]: number };
      if (name === "x") crop.width = Math.min(crop.width, 100 - crop.x);
      if (name === "y") crop.height = Math.min(crop.height, 100 - crop.y);
      updatePresentation("mapCrop", crop);
    }} />)}</div>}
  </div>;

  if (id === "partners") return <div className={kit.stack}>
    <Toggle target={SHOP_TARGETS.partnersVisible} label="Show sponsors on Shop page" value={value.sponsorsVisible} onChange={show => updatePresentation("sponsorsVisible", show)} />
    <Text target={SHOP_TARGETS.partnersHeading} label="Sponsor section heading" value={value.sponsorsHeading} maxLength={160} onChange={text => updatePresentation("sponsorsHeading", text)} />
    <p className={kit.hint}>These logos are shared with the homepage.</p>
    <div><EditorPageLink href="/admin/sponsors">Manage sponsor logos</EditorPageLink></div>
  </div>;

  // labels
  return <div className={kit.stack}>
    <Text target={SHOP_TARGETS.homeLabel} label="Home tab label" value={value.homeLabel} maxLength={80} onChange={text => updatePresentation("homeLabel", text)} />
    <Text target={SHOP_TARGETS.awayLabel} label="Away tab label" value={value.awayLabel} maxLength={80} onChange={text => updatePresentation("awayLabel", text)} />
    <Text target={SHOP_TARGETS.photoRowLabel} label="Photo row description" value={value.galleryLabel} maxLength={160} onChange={text => updatePresentation("galleryLabel", text)} />
    <TextArea target={SHOP_TARGETS.emptyMessage} label="Message when no kits are available" value={value.emptyMessage} maxLength={600} rows={3} onChange={text => updatePresentation("emptyMessage", text)} />
    <div {...editTargetProps(SHOP_TARGETS.imageWidth)}><SmoothSlider label="Kit image width" unit="%" min={30} max={100} step={0.5} value={value.leadScale} onChange={number => updatePresentation("leadScale", number)} help="How wide the main kit photo is next to the words, 30% to 100%." /></div>
    <div {...editTargetProps(SHOP_TARGETS.imageTop)}><SmoothSlider label="Space above kit image" unit="%" min={0} max={30} step={0.5} value={value.leadTop} onChange={number => updatePresentation("leadTop", number)} help="Distance from the top of the photo frame, 0% to 30%." /></div>
  </div>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const id = useId();
  return <div className={kit.field}><label htmlFor={id}>{label}</label><input id={id} type="number" value={Math.round(value * 100) / 100} min={min} max={max} step={0.01} onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber); }} /></div>;
}

/** Kit picker inside the dialog for the kit sections (photos, text, photo row). */
export function KitPicker({ value, kits, onChange }: { value: ShopVariant; kits: readonly ShopVariant[]; onChange: (kit: ShopVariant) => void }) {
  if (kits.length < 2) return null;
  return <EditorSegmented label="Kit" value={value} options={kits.map(kitId => ({ value: kitId, label: KIT_NAMES[kitId] }))} onChange={onChange} />;
}
