"use client";

import { useId } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import FileUpload from "@/components/admin/FileUpload";
import { EditorActionButton, EditorGroup, EditorPageLink, EditorRemoveButton, EditorSwitch, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { APPROVED_SHOP_MAP_CROP, MAX_SHOP_ATTRIBUTES, MAX_SHOP_DETAILS, MAX_SHOP_EDITIONS, MAX_SHOP_SIZE_COLUMNS, MAX_SHOP_SIZE_ROWS, isShopEditionShown, withShopEditionShown, type CinematicShopPresentation, type ShopDetailPresentation, type ShopEdition } from "@/lib/cinematic-shop-content";

export type CinematicShopTarget = "map" | "sponsors" | "page" | "editions" | "details" | "attributes" | "sizeChart";
/** Option i is the kit SHOP_EDITION_VARIANTS[i]: Home, Away, Third. */
const EDITION_KIT_LABELS = ["Home kit option", "Away kit option", "Third kit option"];

export default function CinematicShopFields({ target, value, onChange, uploading, onUploadMap, onRemoveMap, onUploadDetail, onRemoveDetail }: {
  target: CinematicShopTarget;
  value: CinematicShopPresentation;
  onChange: <K extends keyof CinematicShopPresentation>(field: K, content: CinematicShopPresentation[K]) => void;
  uploading: boolean;
  onUploadMap: (files: FileList | null) => void;
  onRemoveMap: () => void;
  onUploadDetail: (index: number, files: FileList | null) => void;
  onRemoveDetail: (index: number) => void;
}) {
  const editionsHeadingId = useId();
  const editions = value.editions, details = value.details, chart = value.sizeChart;
  const setEdition = (index: number, changes: Partial<ShopEdition>) => onChange("editions", editions.map((item, i) => i === index ? { ...item, ...changes } : item));
  const setDetail = (index: number, changes: Partial<ShopDetailPresentation>) => onChange("details", details.map((item, i) => i === index ? { ...item, ...changes } : item));
  const setColumns = (text: string) => {
    const columns = text.split(",").map(size => size.trim()).slice(0, MAX_SHOP_SIZE_COLUMNS).filter((size, i, all) => size || i < all.length - 1);
    onChange("sizeChart", { ...chart, columns, rows: chart.rows.map(row => ({ ...row, values: columns.map((_, i) => row.values[i] ?? "") })) });
  };
  return <div className={kit.stack}>
    {target === "editions" && <>
      <p className={kit.hint}>Each option shows one whole kit: the first is the Home kit, the second the Away kit, the third the Third kit. Choosing an option switches the kit photos, words, photo row and the line under the title. An option appears on the website once its kit has been saved. Leave a purchase link blank to use that kit’s Buy now link. Switch an option off to hide that jersey from the website without deleting it.</p>
      <div className={kit.field}><label htmlFor={editionsHeadingId}>Section heading</label><input id={editionsHeadingId} type="text" value={value.editionsHeading ?? ""} placeholder="Select your jersey" maxLength={80} onChange={event => onChange("editionsHeading", event.target.value)} /></div>
      {editions.map((edition, index) => <EditorGroup key={index} legend={EDITION_KIT_LABELS[index] ?? `Jersey option ${index + 1}`}>
        <Toggle label="Show this jersey in the shop" offBadge="Hidden" value={isShopEditionShown(edition)} onChange={show => onChange("editions", editions.map((item, i) => i === index ? withShopEditionShown(item, show) : item))} />
        <Text label="Button label" value={edition.label} onChange={text => setEdition(index, { label: text })} />
        <Text label="Price" value={edition.price} onChange={text => setEdition(index, { price: text })} />
        <Text label="Line under the title" value={edition.line} onChange={text => setEdition(index, { line: text })} />
        <Text label="Purchase link (optional)" type="url" value={edition.link} onChange={text => setEdition(index, { link: text.trim() })} />
        {/* Only the last option can be removed, so the others keep their kits. */}
        {index === editions.length - 1 && <EditorRemoveButton onClick={() => onChange("editions", editions.slice(0, -1))}>Remove {(EDITION_KIT_LABELS[index] ?? `option ${index + 1}`).toLowerCase()}</EditorRemoveButton>}
      </EditorGroup>)}
      {editions.length < MAX_SHOP_EDITIONS && <div><EditorActionButton onClick={() => onChange("editions", [...editions, { label: "", price: "", line: "", link: "" }])}>Add {EDITION_KIT_LABELS[editions.length].toLowerCase()}</EditorActionButton></div>}
    </>}
    {target === "details" && <>
      <Text label="Section heading" value={value.detailsHeading} onChange={text => onChange("detailsHeading", text)} />
      {details.map((detail, index) => <EditorGroup key={index} legend={`Tile ${index + 1}`}>
        {detail.url ? <NativeImage src={detail.url} alt={detail.alt || `Tile ${index + 1} photo`} className="h-auto w-full rounded-lg border border-border" />
          : <p className={`${kit.hint} rounded-lg border border-dashed border-border p-3`}>No photo yet. The website shows a white box here.</p>}
        <FileUpload label={detail.assetId ? "Replace photo" : "Upload photo"} accept="image/png,image/jpeg,image/webp" onUpload={files => onUploadDetail(index, files)} uploading={uploading} />
        {detail.assetId && <EditorRemoveButton disabled={uploading} label={`Remove tile ${index + 1} photo`} onClick={() => onRemoveDetail(index)}>Remove photo</EditorRemoveButton>}
        <Text label="Photo description" value={detail.alt} onChange={text => setDetail(index, { alt: text })} />
        <Text label="Title" value={detail.title} onChange={text => setDetail(index, { title: text })} />
        <TextArea label="Text" value={detail.body} onChange={text => setDetail(index, { body: text })} />
        <EditorRemoveButton disabled={uploading} onClick={() => { if (detail.assetId) onRemoveDetail(index); onChange("details", details.filter((_, i) => i !== index)); }}>Remove tile {index + 1}</EditorRemoveButton>
      </EditorGroup>)}
      {details.length < MAX_SHOP_DETAILS && <div><EditorActionButton onClick={() => onChange("details", [...details, { assetId: null, alt: "", title: "", body: "" }])}>Add tile</EditorActionButton></div>}
    </>}
    {target === "attributes" && <>
      <TextArea label="Color, material and care, one per line" value={value.attributes.join("\n")} onChange={text => onChange("attributes", text.split("\n").slice(0, MAX_SHOP_ATTRIBUTES))} />
      <p className={kit.hint}>Up to {MAX_SHOP_ATTRIBUTES} items, shown in one line under the Jersey Information cards.</p>
    </>}
    {target === "sizeChart" && <>
      <Text label="Section heading" value={chart.heading} onChange={text => onChange("sizeChart", { ...chart, heading: text })} />
      <Text label="Sizes, separated by commas" value={chart.columns.join(", ")} onChange={setColumns} />
      {chart.rows.map((row, r) => <EditorGroup key={r} legend={`Measurement ${r + 1}`}>
        <Text label="Measurement" value={row.label} onChange={text => onChange("sizeChart", { ...chart, rows: chart.rows.map((item, i) => i === r ? { ...item, label: text } : item) })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{chart.columns.map((size, c) => <Text key={c} label={size || `Size ${c + 1}`} value={row.values[c] ?? ""} onChange={text => onChange("sizeChart", { ...chart, rows: chart.rows.map((item, i) => i === r ? { ...item, values: item.values.map((v, j) => j === c ? text : v) } : item) })} />)}</div>
        <EditorRemoveButton onClick={() => onChange("sizeChart", { ...chart, rows: chart.rows.filter((_, i) => i !== r) })}>Remove measurement {r + 1}</EditorRemoveButton>
      </EditorGroup>)}
      {chart.rows.length < MAX_SHOP_SIZE_ROWS && <div><EditorActionButton onClick={() => onChange("sizeChart", { ...chart, rows: [...chart.rows, { label: "", values: chart.columns.map(() => "") }] })}>Add measurement</EditorActionButton></div>}
      <Text label="Note under the chart" value={chart.note} onChange={text => onChange("sizeChart", { ...chart, note: text })} />
    </>}
    {target === "page" && <>
      <Text label="Home tab label" value={value.homeLabel} onChange={text => onChange("homeLabel", text)} />
      <Text label="Away tab label" value={value.awayLabel} onChange={text => onChange("awayLabel", text)} />
      <Text label="Photo row description" value={value.galleryLabel} onChange={text => onChange("galleryLabel", text)} />
      <Text label="Message when no kits are available" value={value.emptyMessage} onChange={text => onChange("emptyMessage", text)} />
      <NumberField label="Kit image width (%)" value={value.leadScale} min={30} max={100} onChange={number => onChange("leadScale", number)} />
      <NumberField label="Space above kit image (%)" value={value.leadTop} min={0} max={30} onChange={number => onChange("leadTop", number)} />
    </>}
    {target === "map" && <>
      <Toggle label="Show map on Shop page" value={value.mapVisible} onChange={show => onChange("mapVisible", show)} />
      <Text label="Map heading" value={value.mapHeading} onChange={text => onChange("mapHeading", text)} />
      {value.mapUrl && <NativeImage src={value.mapUrl} alt={value.mapAlt || "Shop map preview"} className="h-auto w-full rounded-lg border border-border" />}
      <FileUpload label={value.mapUrl ? "Replace map image" : "Upload map image"} accept="image/png,image/webp" onUpload={onUploadMap} uploading={uploading} />
      <p className={kit.hint}>Use PNG or WebP. The original map is kept; framing only changes what appears on this page.</p>
      {value.mapAssetId && <EditorRemoveButton disabled={uploading} onClick={onRemoveMap}>Remove map</EditorRemoveButton>}
      <Text label="Map description" value={value.mapAlt} onChange={text => onChange("mapAlt", text)} />
      <Toggle label="Show the whole map image" value={!value.mapCrop} onChange={whole => onChange("mapCrop", whole ? null : { ...APPROVED_SHOP_MAP_CROP })} />
      {value.mapCrop && <div className="grid grid-cols-2 gap-3">{(["x", "y", "width", "height"] as const).map(field => <NumberField key={field} label={field === "x" ? "Left edge (%)" : field === "y" ? "Top edge (%)" : field === "width" ? "Frame width (%)" : "Frame height (%)"} value={value.mapCrop![field]} min={field === "width" || field === "height" ? 1 : 0} max={100} onChange={number => {
        const crop = { ...value.mapCrop!, [field]: number };
        if (field === "x") crop.width = Math.min(crop.width, 100 - crop.x);
        if (field === "y") crop.height = Math.min(crop.height, 100 - crop.y);
        onChange("mapCrop", crop);
      }} />)}</div>}
    </>}
    {target === "sponsors" && <>
      <Toggle label="Show sponsors on Shop page" value={value.sponsorsVisible} onChange={show => onChange("sponsorsVisible", show)} />
      <Text label="Sponsor section heading" value={value.sponsorsHeading} onChange={text => onChange("sponsorsHeading", text)} />
      <p className={kit.hint}>These logos are shared with the homepage.</p>
      <div><EditorPageLink href="/admin/sponsors">Manage sponsor logos</EditorPageLink></div>
    </>}
  </div>;
}

function Text({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "url" }) {
  const id = useId();
  return <div className={kit.field}><label htmlFor={id}>{label}</label><input id={id} type={type} value={value} onChange={event => onChange(event.target.value)} /></div>;
}
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <div className={kit.field}><label htmlFor={id}>{label}</label><textarea id={id} rows={4} value={value} onChange={event => onChange(event.target.value)} /></div>;
}
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const id = useId();
  return <div className={kit.field}><label htmlFor={id}>{label}</label><input id={id} type="number" value={Math.round(value * 100) / 100} min={min} max={max} step={0.01} onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber); }} /></div>;
}
/** The kit's switch row. The surrounding fieldset still disables it while the page is locked. */
function Toggle({ label, value, onChange, offBadge }: { label: string; value: boolean; onChange: (value: boolean) => void; offBadge?: string }) {
  return <EditorSwitch label={label} checked={value} disabled={false} onChange={onChange} offBadge={offBadge} />;
}
