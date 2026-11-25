"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { IconDelete } from "@/components/admin/icons";
import NativeImage from "@/components/ResilientNativeImage";
import { EditorGroup, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { adminImageRules } from "@/components/admin/ui/adminImageFiles";
import { ImageFieldWithDescription, ValidationMessage } from "@/components/admin/ui/editor-kit";
import type { StadiumArtworkSlot, StadiumContent, StadiumCrop, StadiumPageContent } from "@/lib/stadium-content";
import type { EditTargetId } from "@/lib/admin-edit-targets";
import { mediaHint } from "@/lib/media-rules";
import { GRAPHIC_UPLOAD_TYPES_LABEL } from "@/lib/media-upload-types";
import { FOOTHILL_TARGETS, benefitDetailTarget, benefitTitleTarget, sectionBodyTarget, sectionBulletTarget, sectionHeadingTarget, sectionNoteTarget } from "./foothill-edit-targets";
import { applyFoothillCrop, cropPercentLabel, foothillSectionTitle, FOOTHILL_FLAGS, type FoothillSectionId } from "./foothill-sections";
import { ActionButton, AlwaysShownRow, ReorderButtons, ShowRow, TextField } from "./PartnerPageParts";
import styles from "./PartnerPageParts.module.css";

// Stadium artwork uploads to the homepage-artwork bucket, so every slot takes a graphic.
const IMAGE_RULES = adminImageRules("graphic");
const TYPES = GRAPHIC_UPLOAD_TYPES_LABEL;
const ART_LABELS: Record<StadiumArtworkSlot, string> = { bus: "Bus", map: "Route card and walking map", partner: "Ticket partner" };
const ART_DESCRIPTIONS: Record<StadiumArtworkSlot, string> = {
  bus: `${TYPES}. Shown beside the page heading.`,
  map: `${TYPES}. Shown full width. Replacing it resets the phone layout to a full image.`,
  partner: `${TYPES}. Shown under the match card.`,
};
const CROP_FIELDS = [["x", "Left"], ["y", "Top"], ["width", "Width"], ["height", "Height"]] as const;
const CROP_CARDS = [["phoneCardCrop", "Route card"], ["phoneMapCrop", "Walking map"]] as const;

export type FoothillFieldsApi = {
  draft: StadiumContent;
  page: StadiumPageContent;
  locked: boolean;
  uploading: StadiumArtworkSlot | null;
  /** Edit a copy of the draft, exactly as the editor always did. */
  update: (edit: (content: StadiumContent) => void) => void;
  /** Replace the whole draft (used by the crop control, which validates first). */
  replace: (next: StadiumContent) => void;
  upload: (slot: StadiumArtworkSlot, file: File) => Promise<boolean>;
  removeImage: (slot: StadiumArtworkSlot) => void;
};

/** The image description each picture's click-to-field id points at. */
const ALT_TARGETS: Record<StadiumArtworkSlot, EditTargetId> = { bus: FOOTHILL_TARGETS.imagesBusImageAlt, map: FOOTHILL_TARGETS.imagesMapImageAlt, partner: FOOTHILL_TARGETS.matchPartnerImageAlt };

function ImageSlot({ api, slot }: { api: FoothillFieldsApi; slot: StadiumArtworkSlot }) {
  const { draft, page, locked, uploading, update, upload, removeImage } = api;
  const label = ART_LABELS[slot];
  return <EditorGroup legend={label}>
    <ImageFieldWithDescription label={label} description={ART_DESCRIPTIONS[slot]} previewUrl={page.artwork[slot].url} initials="" disabled={locked} uploading={uploading === slot}
      {...IMAGE_RULES} onUpload={async files => { const file = files[0]; return file ? upload(slot, file) : false; }}
      onRemove={draft.artwork[slot].assetId ? () => removeImage(slot) : undefined} />
    <TextField label="Image description" value={draft.artwork[slot].alt} max={1000} disabled={locked} target={ALT_TARGETS[slot]} onChange={alt => update(content => { content.artwork[slot].alt = alt; })} />
  </EditorGroup>;
}

/** Shows the saved value rounded to one decimal. What the owner types is shown exactly and saved exactly; an untouched field never writes. */
function CropField({ id, label, value, disabled, onChange }: { id: string; label: string; value: number; disabled: boolean; onChange: (percent: number) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  return <div className={kit.field}>
    <label htmlFor={id}>{label} (%)</label>
    <input id={id} type="number" inputMode="decimal" min={0} max={100} step={0.1} disabled={disabled} value={typed ?? cropPercentLabel(value)}
      onChange={event => { setTyped(event.target.value); if (event.target.value) onChange(Number(event.target.value)); }}
      onBlur={() => setTyped(null)} />
  </div>;
}

/** The phone map: how the image is shown on phones, and (for two parts) which part of the image each one is. The crop must fit inside the image. */
function PhoneMapControl({ api }: { api: FoothillFieldsApi }) {
  const { draft, page, locked, update, replace } = api;
  const base = useId();
  const [error, setError] = useState("");
  const map = page.artwork.map;
  const setCrop = (cropKey: "phoneCardCrop" | "phoneMapCrop", key: keyof StadiumCrop, percent: number) => {
    const next = applyFoothillCrop(draft, cropKey, key, percent);
    if (!next) { setError("The crop must fit inside the image. Reduce width or height before moving it toward an edge."); return; }
    setError(""); replace(next);
  };
  return <div className={styles.cropWrap} data-phone-map-control="">
    <div className={kit.field}>
      <label htmlFor={`${base}-layout`}>Display the map</label>
      <select id={`${base}-layout`} disabled={locked} value={draft.phoneMapLayout}
        onChange={event => { setError(""); update(content => { content.phoneMapLayout = event.target.value as "full" | "split"; }); }}>
        <option value="full">Show the full image</option>
        <option value="split">Show a route card, then a walking map</option>
      </select>
      <span className={kit.hint}>Replacement maps start as a full image. Choose two parts only when your artwork contains a separate route card and walking map.</span>
    </div>
    {error && <ValidationMessage live="assertive">{error}</ValidationMessage>}
    {draft.phoneMapLayout === "split" && <div className={styles.cropGrid}>
      {CROP_CARDS.map(([cropKey, title]) => {
        const crop = draft[cropKey];
        return <EditorGroup key={cropKey} legend={`${title} crop`}>
          <div className={styles.cropFrame} aria-hidden="true">
            {map.url ? <NativeImage src={map.url} alt="" width={map.width ?? undefined} height={map.height ?? undefined} /> : <span className={styles.cropEmpty}>Add the map image first.</span>}
            {map.url && <span className={styles.cropBox} style={{ insetInlineStart: `${crop.x * 100}%`, insetBlockStart: `${crop.y * 100}%`, inlineSize: `${crop.width * 100}%`, blockSize: `${crop.height * 100}%` }} />}
          </div>
          <div className={styles.cropFields}>
            {CROP_FIELDS.map(([key, text]) => <CropField key={key} id={`${base}-${cropKey}-${key}`} label={`${title} ${text.toLowerCase()}`} value={crop[key]} disabled={locked} onChange={percent => setCrop(cropKey, key, percent)} />)}
          </div>
        </EditorGroup>;
      })}
    </div>}
    {draft.phoneMapLayout === "full" && <p className={styles.note}>Phones show the whole image. Switch to two parts to crop a route card and a walking map out of it.</p>}
  </div>;
}

/** The fields of one card, with its show/hide switch first (or "Always shown" where the page has no flag). Each field edits the same StadiumContent key it always did. */
export function FoothillSectionFields({ api, id }: { api: FoothillFieldsApi; id: FoothillSectionId }) {
  const { draft, locked, update } = api;
  const title = foothillSectionTitle(id), flag = FOOTHILL_FLAGS[id];
  const top: ReactNode = flag
    ? <ShowRow label="Show on the page" switchLabel={`Show ${title} on the page`} checked={draft[flag]} disabled={locked} onChange={next => update(content => { content[flag] = next; })} />
    : <AlwaysShownRow note="The bus shows with Page heading, the map with Phone map." />;
  let body: ReactNode = null;
  switch (id) {
    case "heading": body = <div className="grid gap-5 md:grid-cols-2">
      <TextField label="Page heading" value={draft.title} max={120} disabled={locked} target={FOOTHILL_TARGETS.headingTitle} onChange={value => update(content => { content.title = value; })} />
      <TextField label="Subtitle" value={draft.subtitle} max={120} disabled={locked} target={FOOTHILL_TARGETS.headingSubtitle} onChange={value => update(content => { content.subtitle = value; })} />
    </div>; break;
    case "images": body = <>
      <p className={styles.note}>{mediaHint("graphic", { pixels: true })}. Words inside artwork change when you replace its image.</p>
      <ImageSlot api={api} slot="bus" /><ImageSlot api={api} slot="map" />
    </>; break;
    case "map": body = <PhoneMapControl api={api} />; break;
    case "match": body = <>
      <p className={styles.note}>Next-match wording comes from <Link className={kit.inlineLink} href="/admin/homepage">Homepage</Link>; fixtures from <Link className={kit.inlineLink} href="/admin/schedule">Schedule</Link>. The purchase link and its unavailable message are managed in <Link className={kit.inlineLink} href="/admin/tickets">Tickets</Link>.</p>
      <ImageSlot api={api} slot="partner" />
    </>; break;
    case "benefits": body = <>
      <TextField label="Benefits heading" value={draft.includesHeading} max={120} disabled={locked} target={FOOTHILL_TARGETS.benefitsHeading} onChange={value => update(content => { content.includesHeading = value; })} />
      {draft.benefits.map((benefit, index) => <EditorGroup key={index} legend={`Benefit ${index + 1}`}>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <TextField label="Title" value={benefit.title} max={120} disabled={locked} target={benefitTitleTarget(index)} onChange={value => update(content => { content.benefits[index].title = value; })} />
          <TextField label="Details" value={benefit.detail} max={4000} multiline disabled={locked} target={benefitDetailTarget(index)} onChange={value => update(content => { content.benefits[index].detail = value; })} />
        </div>
        <ReorderButtons index={index} length={draft.benefits.length} disabled={locked} noun="benefit"
          onMove={delta => update(content => { const next = index + delta; [content.benefits[index], content.benefits[next]] = [content.benefits[next], content.benefits[index]]; })}
          onRemove={() => update(content => { content.benefits.splice(index, 1); })} />
      </EditorGroup>)}
      <div><ActionButton disabled={locked || draft.benefits.length >= 10} onClick={() => update(content => { content.benefits.push({ title: "", detail: "" }); })}>Add benefit</ActionButton></div>
      <p className={styles.note}>{draft.benefits.length >= 10 ? "Maximum of 10 benefits reached." : `${draft.benefits.length} of 10 benefits.`}</p>
      <TextField label="Benefits footnote" value={draft.benefitsNote} max={4000} multiline disabled={locked} target={FOOTHILL_TARGETS.benefitsFootnote} onChange={value => update(content => { content.benefitsNote = value; })} />
    </>; break;
    case "sections": body = <>
      <p className={styles.note}>The switch above hides all of these. Each block also has its own switch.</p>
      {draft.sections.map((section, index) => <EditorGroup key={section.id} legend={`Section ${index + 1}`}>
        <ShowRow label={`Show section ${index + 1}`} switchLabel={`Show section ${index + 1}`} checked={section.visible} disabled={locked} onChange={next => update(content => { content.sections[index].visible = next; })} />
        <TextField label="Heading" value={section.heading} max={120} disabled={locked} target={sectionHeadingTarget(section.id)} onChange={value => update(content => { content.sections[index].heading = value; })} />
        <TextField label="Information" value={section.body} max={4000} multiline disabled={locked} target={sectionBodyTarget(section.id)} onChange={value => update(content => { content.sections[index].body = value; })} />
        <TextField label="Footnote" value={section.note} max={4000} multiline disabled={locked} target={sectionNoteTarget(section.id)} onChange={value => update(content => { content.sections[index].note = value; })} />
        {section.bullets.map((bullet, bulletIndex) => <div key={bulletIndex} className="grid min-w-0 gap-2">
          <TextField label={`Bullet ${bulletIndex + 1}`} value={bullet} max={4000} multiline disabled={locked} target={sectionBulletTarget(section.id, bulletIndex)} onChange={value => update(content => { content.sections[index].bullets[bulletIndex] = value; })} />
          <div className={styles.tools}><button type="button" className={`admin-press ${styles.tool}`} disabled={locked} onClick={() => update(content => { content.sections[index].bullets.splice(bulletIndex, 1); })}><IconDelete size={16} aria-hidden="true" />Remove bullet {bulletIndex + 1}</button></div>
        </div>)}
        <div><ActionButton disabled={locked || section.bullets.length >= 20} onClick={() => update(content => { content.sections[index].bullets.push(""); })}>Add bullet</ActionButton></div>
        <ReorderButtons index={index} length={draft.sections.length} disabled={locked} noun="section"
          onMove={delta => update(content => { const next = index + delta; [content.sections[index], content.sections[next]] = [content.sections[next], content.sections[index]]; })}
          onRemove={() => update(content => { content.sections.splice(index, 1); })} />
      </EditorGroup>)}
      <div><ActionButton disabled={locked || draft.sections.length >= 12} onClick={() => update(content => { content.sections.push({ id: crypto.randomUUID(), heading: "", body: "", note: "", bullets: [], visible: true }); })}>Add section</ActionButton></div>
      <p className={styles.note}>{draft.sections.length >= 12 ? "Maximum of 12 sections reached." : `${draft.sections.length} of 12 sections.`}</p>
    </>; break;
  }
  return <div className={styles.fields}>{top}<div className={kit.stack}>{body}</div></div>;
}
