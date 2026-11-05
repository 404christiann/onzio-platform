"use client";

import NativeImage from "@/components/ResilientNativeImage";
import FileUpload from "@/components/admin/FileUpload";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { APPROVED_SHOP_MAP_CROP, MAX_SHOP_ATTRIBUTES, MAX_SHOP_DETAILS, MAX_SHOP_EDITIONS, MAX_SHOP_SIZE_COLUMNS, MAX_SHOP_SIZE_ROWS, type CinematicShopPresentation, type ShopDetailPresentation, type ShopEdition } from "@/lib/cinematic-shop-content";

export type CinematicShopTarget = "map" | "sponsors" | "page" | "editions" | "details" | "attributes" | "sizeChart";

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
  const editions = value.editions, details = value.details, chart = value.sizeChart;
  const setEdition = (index: number, changes: Partial<ShopEdition>) => onChange("editions", editions.map((item, i) => i === index ? { ...item, ...changes } : item));
  const setDetail = (index: number, changes: Partial<ShopDetailPresentation>) => onChange("details", details.map((item, i) => i === index ? { ...item, ...changes } : item));
  const setColumns = (text: string) => {
    const columns = text.split(",").map(size => size.trim()).slice(0, MAX_SHOP_SIZE_COLUMNS).filter((size, i, all) => size || i < all.length - 1);
    onChange("sizeChart", { ...chart, columns, rows: chart.rows.map(row => ({ ...row, values: columns.map((_, i) => row.values[i] ?? "") })) });
  };
  return <div className="space-y-4">
    {target === "editions" && <>
      <p className="text-sm text-muted-foreground">These buttons replace Home/Away on the public Shop page and switch the price and the line under the title. Leave a purchase link blank to use the kit’s Buy now link.</p>
      {editions.map((edition, index) => <fieldset key={index} className="space-y-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold">Jersey option {index + 1}</legend>
        <Text label="Button label" value={edition.label} onChange={text => setEdition(index, { label: text })} />
        <Text label="Price" value={edition.price} onChange={text => setEdition(index, { price: text })} />
        <Text label="Line under the title" value={edition.line} onChange={text => setEdition(index, { line: text })} />
        <Text label="Purchase link (optional)" type="url" value={edition.link} onChange={text => setEdition(index, { link: text.trim() })} />
        <button type="button" onClick={() => onChange("editions", editions.filter((_, i) => i !== index))} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-destructive">Remove option {index + 1}</button>
      </fieldset>)}
      {editions.length < MAX_SHOP_EDITIONS && <button type="button" onClick={() => onChange("editions", [...editions, { label: "", price: "", line: "", link: "" }])} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">Add jersey option</button>}
    </>}
    {target === "details" && <>
      <Text label="Section heading" value={value.detailsHeading} onChange={text => onChange("detailsHeading", text)} />
      {details.map((detail, index) => <fieldset key={index} className="space-y-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold">Tile {index + 1}</legend>
        {detail.url ? <NativeImage src={detail.url} alt={detail.alt || `Tile ${index + 1} photo`} className="h-auto w-full rounded-lg border border-border" />
          : <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No photo yet. The website shows a white box here.</p>}
        <FileUpload label={detail.assetId ? "Replace photo" : "Upload photo"} accept="image/png,image/jpeg,image/webp" onUpload={files => onUploadDetail(index, files)} uploading={uploading} />
        {detail.assetId && <button type="button" disabled={uploading} onClick={() => onRemoveDetail(index)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-destructive">Remove photo</button>}
        <Text label="Photo description" value={detail.alt} onChange={text => setDetail(index, { alt: text })} />
        <Text label="Title" value={detail.title} onChange={text => setDetail(index, { title: text })} />
        <TextArea label="Text" value={detail.body} onChange={text => setDetail(index, { body: text })} />
        <button type="button" disabled={uploading} onClick={() => { if (detail.assetId) onRemoveDetail(index); onChange("details", details.filter((_, i) => i !== index)); }} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-destructive">Remove tile {index + 1}</button>
      </fieldset>)}
      {details.length < MAX_SHOP_DETAILS && <button type="button" onClick={() => onChange("details", [...details, { assetId: null, alt: "", title: "", body: "" }])} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">Add tile</button>}
    </>}
    {target === "attributes" && <>
      <TextArea label="Color, material and care, one per line" value={value.attributes.join("\n")} onChange={text => onChange("attributes", text.split("\n").slice(0, MAX_SHOP_ATTRIBUTES))} />
      <p className="text-xs text-muted-foreground">Up to {MAX_SHOP_ATTRIBUTES} items, shown in one line under the Jersey Information cards.</p>
    </>}
    {target === "sizeChart" && <>
      <Text label="Section heading" value={chart.heading} onChange={text => onChange("sizeChart", { ...chart, heading: text })} />
      <Text label="Sizes, separated by commas" value={chart.columns.join(", ")} onChange={setColumns} />
      {chart.rows.map((row, r) => <fieldset key={r} className="space-y-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold">Measurement {r + 1}</legend>
        <Text label="Measurement" value={row.label} onChange={text => onChange("sizeChart", { ...chart, rows: chart.rows.map((item, i) => i === r ? { ...item, label: text } : item) })} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{chart.columns.map((size, c) => <Text key={c} label={size || `Size ${c + 1}`} value={row.values[c] ?? ""} onChange={text => onChange("sizeChart", { ...chart, rows: chart.rows.map((item, i) => i === r ? { ...item, values: item.values.map((v, j) => j === c ? text : v) } : item) })} />)}</div>
        <button type="button" onClick={() => onChange("sizeChart", { ...chart, rows: chart.rows.filter((_, i) => i !== r) })} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-destructive">Remove measurement {r + 1}</button>
      </fieldset>)}
      {chart.rows.length < MAX_SHOP_SIZE_ROWS && <button type="button" onClick={() => onChange("sizeChart", { ...chart, rows: [...chart.rows, { label: "", values: chart.columns.map(() => "") }] })} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">Add measurement</button>}
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
      <p className="text-xs text-muted-foreground">Use PNG or WebP. The original map is kept; framing only changes what appears on this page.</p>
      {value.mapAssetId && <button type="button" disabled={uploading} onClick={onRemoveMap} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-destructive">Remove map</button>}
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
      <p className="text-sm text-muted-foreground">These logos are shared with the homepage.</p>
      <a href="/admin/sponsors" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-semibold">Manage sponsor logos<span className="sr-only"> (opens in a new tab)</span></a>
    </>}
  </div>;
}

function Text({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "url" }) {
  return <label className="block"><span className={ADMIN_LABEL_CLASS}>{label}</span><input type={type} className={ADMIN_INPUT_CLASS} style={{ fontSize: 16 }} value={value} onChange={event => onChange(event.target.value)} /></label>;
}
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className={ADMIN_LABEL_CLASS}>{label}</span><textarea rows={4} className={`${ADMIN_INPUT_CLASS} min-h-24`} style={{ fontSize: 16 }} value={value} onChange={event => onChange(event.target.value)} /></label>;
}
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="block"><span className={ADMIN_LABEL_CLASS}>{label}</span><input type="number" className={ADMIN_INPUT_CLASS} style={{ fontSize: 16 }} value={Math.round(value * 100) / 100} min={min} max={max} step={0.01} onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber); }} /></label>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-primary" /><span>{label}</span></label>;
}
