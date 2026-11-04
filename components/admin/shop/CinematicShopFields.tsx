"use client";

import NativeImage from "@/components/ResilientNativeImage";
import FileUpload from "@/components/admin/FileUpload";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { APPROVED_SHOP_MAP_CROP, type CinematicShopPresentation } from "@/lib/cinematic-shop-content";

export default function CinematicShopFields({ target, value, onChange, uploading, onUploadMap, onRemoveMap }: {
  target: "map" | "sponsors" | "page";
  value: CinematicShopPresentation;
  onChange: <K extends keyof CinematicShopPresentation>(field: K, content: CinematicShopPresentation[K]) => void;
  uploading: boolean;
  onUploadMap: (files: FileList | null) => void;
  onRemoveMap: () => void;
}) {
  return <div className="space-y-4">
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

function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className={ADMIN_LABEL_CLASS}>{label}</span><input className={ADMIN_INPUT_CLASS} style={{ fontSize: 16 }} value={value} onChange={event => onChange(event.target.value)} /></label>;
}
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="block"><span className={ADMIN_LABEL_CLASS}>{label}</span><input type="number" className={ADMIN_INPUT_CLASS} style={{ fontSize: 16 }} value={Math.round(value * 100) / 100} min={min} max={max} step={0.01} onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber); }} /></label>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-primary" /><span>{label}</span></label>;
}
