"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { IconAdd, IconCaretDown, IconCaretUp, IconDelete } from "@/components/admin/icons";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { EditorField, EditorGroup, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ImageFieldWithDescription, ValidationMessage } from "@/components/admin/ui/editor-kit";
import {
  MAX_ROBINSON_BLOCKS, MAX_ROBINSON_BULLETS, MAX_ROBINSON_INFO_ROWS, MAX_ROBINSON_PARAGRAPHS,
  type RobinsonContent, type RobinsonImageSlot, type RobinsonPageContent,
} from "@/lib/cinematic-robinson-content";
import { addBlock, addInfoRow, appendItem, moveItem, removeItem, setImage, updateBlock } from "@/lib/cinematic-robinson-editor";
import { robinsonSectionTitle, type RobinsonSectionId } from "./robinson-sections";
import styles from "./RobinsonStadiumEditor.module.css";

const IMAGE_RULES = { allowedTypes: ["image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 } as const;

export type RobinsonFieldsApi = {
  draft: RobinsonContent;
  page: RobinsonPageContent;
  locked: boolean;
  uploading: RobinsonImageSlot | null;
  change: (edit: (value: RobinsonContent) => RobinsonContent) => void;
  patch: <K extends RobinsonSectionId>(section: K, value: Partial<RobinsonContent[K]>) => void;
  upload: (slot: RobinsonImageSlot, file: File) => Promise<boolean>;
};

/** Move up, move down and remove for one list item, with the icons.download glyphs the rest of the screen uses. */
function EditorReorderButtons({ index, length, disabled, noun, onMove, onRemove }: { index: number; length: number; disabled: boolean; noun: string; onMove: (delta: -1 | 1) => void; onRemove: () => void }) {
  const name = `${noun} ${index + 1}`;
  return <div className={styles.tools}>
    <button type="button" className={`admin-press ${styles.tool}`} aria-label={`Move ${name} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)}><IconCaretUp size={16} aria-hidden="true" /></button>
    <button type="button" className={`admin-press ${styles.tool}`} aria-label={`Move ${name} down`} disabled={disabled || index === length - 1} onClick={() => onMove(1)}><IconCaretDown size={16} aria-hidden="true" /></button>
    <button type="button" className={`admin-press ${styles.tool}`} disabled={disabled} onClick={onRemove}><IconDelete size={16} aria-hidden="true" />Remove {name}</button>
  </div>;
}

function EditorActionButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`admin-press ${styles.tool}`} disabled={disabled} onClick={onClick}><IconAdd size={16} aria-hidden="true" />{children}</button>;
}

/** A text field that tells the person when they have reached the limit the page allows. */
function TextField({ label, value, max, disabled, multiline, hint, onChange }: { label: string; value: string; max: number; disabled: boolean; multiline?: boolean; hint?: string; onChange: (value: string) => void }) {
  const limitId = useId();
  const atLimit = value.length >= max;
  return <div className={styles.fieldWithLimit}>
    <EditorField label={label} value={value} max={max} disabled={disabled} multiline={multiline} hint={hint} invalid={atLimit} describedBy={atLimit ? limitId : undefined} onChange={onChange} />
    {atLimit && <ValidationMessage id={limitId} live="polite">{label} is at its limit of {max} characters.</ValidationMessage>}
  </div>;
}

function TextList({ label, items, max, disabled, onChange }: { label: string; items: string[]; max: number; disabled: boolean; onChange: (items: string[]) => void }) {
  return <div className={kit.stack}>{items.map((item, index) => <div key={index} className="grid min-w-0 gap-2">
    <TextField label={`${label} ${index + 1}`} value={item} max={4000} multiline disabled={disabled} onChange={value => onChange(items.map((current, position) => position === index ? value : current))} />
    <EditorReorderButtons index={index} length={items.length} disabled={disabled} noun={label.toLowerCase()} onMove={delta => onChange(moveItem(items, index, delta))} onRemove={() => onChange(removeItem(items, index))} />
  </div>)}
    <div><EditorActionButton disabled={disabled || items.length >= max} onClick={() => onChange(appendItem(items, "", max))}>Add {label.toLowerCase()}</EditorActionButton></div>
  </div>;
}

function YesNoField({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const id = useId();
  return <div className={kit.field}><label htmlFor={id}>{label}</label>
    <select id={id} disabled={disabled} value={value ? "yes" : "no"} onChange={event => onChange(event.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></select>
  </div>;
}

function ImageSlot({ api, slot, label, hint, description }: { api: RobinsonFieldsApi; slot: RobinsonImageSlot; label: string; hint?: string; description: ReactNode }) {
  const { draft, page, locked, uploading, change, upload } = api;
  return <EditorGroup key={slot} legend={label}>
    <ImageFieldWithDescription label={label} description={description} previewUrl={page.images[slot].url} initials="" disabled={locked} uploading={uploading === slot}
      {...IMAGE_RULES} onUpload={async files => { const file = files[0]; return file ? upload(slot, file) : false; }}
      onRemove={draft.images[slot].assetId ? () => change(content => setImage(content, slot, null)) : undefined} />
    <TextField label="Image description" value={draft.images[slot].alt} max={1000} disabled={locked} hint={hint}
      onChange={alt => change(content => ({ ...content, images: { ...content.images, [slot]: { ...content.images[slot], alt } } }))} />
  </EditorGroup>;
}

/** The fields of one section, with its "Show on the page" switch first. Each field edits the same RobinsonContent key it always did. */
export function RobinsonSectionFields({ api, id }: { api: RobinsonFieldsApi; id: RobinsonSectionId }) {
  const { draft, locked, change, patch } = api;
  const title = robinsonSectionTitle(id);
  const visible = (
    <div className={styles.showRow}>
      <span aria-hidden="true">Show on the page</span>
      <AdminSwitch label={`Show ${title} on the page`} checked={draft[id].visible} disabled={locked} onCheckedChange={next => patch(id, { visible: next } as Partial<RobinsonContent[typeof id]>)} />
    </div>
  );
  let body: ReactNode = null;
  switch (id) {
    case "heading": body = <div className="grid gap-5 md:grid-cols-2">
      <TextField label="Title" value={draft.heading.title} max={120} disabled={locked} onChange={value => patch("heading", { title: value })} />
      <TextField label="Subtitle" value={draft.heading.subtitle} max={120} disabled={locked} onChange={subtitle => patch("heading", { subtitle })} />
    </div>; break;
    case "seating": body = <>
      <ImageSlot api={api} slot="seating" label="Seating map" hint="On phones, a link opens this image full size." description="PNG or WebP. Shown full width at the top of the page." />
      <div className="grid gap-5 md:grid-cols-2">
        <TextField label="Caption" value={draft.seating.caption} max={120} disabled={locked} onChange={caption => patch("seating", { caption })} />
        <TextField label="Full-size link (phones)" value={draft.seating.expandLabel} max={120} disabled={locked} onChange={expandLabel => patch("seating", { expandLabel })} />
      </div></>; break;
    case "story": body = <>
      <TextList label="Paragraph" items={draft.story.paragraphs} max={MAX_ROBINSON_PARAGRAPHS} disabled={locked} onChange={paragraphs => patch("story", { paragraphs })} />
      <TextField label="Quote" value={draft.story.quote} max={4000} multiline disabled={locked} hint="Quotation marks are added on the page." onChange={quote => patch("story", { quote })} />
      <TextField label="Quote attribution" value={draft.story.attribution} max={120} disabled={locked} onChange={attribution => patch("story", { attribution })} />
    </>; break;
    case "info": body = <>
      <div className="grid gap-5 md:grid-cols-2">
        <TextField label="Heading" value={draft.info.heading} max={120} disabled={locked} onChange={heading => patch("info", { heading })} />
        <TextField label="Note" value={draft.info.note} max={120} disabled={locked} onChange={note => patch("info", { note })} />
      </div>
      {draft.info.rows.map((row, index) => <EditorGroup key={index} legend={`Row ${index + 1}`}><div className="grid min-w-0 gap-4 md:grid-cols-[1fr_10rem]">
        <TextField label="Label" value={row.label} max={120} disabled={locked} onChange={label => patch("info", { rows: draft.info.rows.map((current, position) => position === index ? { ...current, label } : current) })} />
        <YesNoField label="Value" value={row.available} disabled={locked} onChange={available => patch("info", { rows: draft.info.rows.map((current, position) => position === index ? { ...current, available } : current) })} />
        <div className="md:col-span-2"><EditorReorderButtons index={index} length={draft.info.rows.length} disabled={locked} noun="row" onMove={delta => patch("info", { rows: moveItem(draft.info.rows, index, delta) })} onRemove={() => patch("info", { rows: removeItem(draft.info.rows, index) })} /></div>
      </div></EditorGroup>)}
      <div><EditorActionButton disabled={locked || draft.info.rows.length >= MAX_ROBINSON_INFO_ROWS} onClick={() => change(addInfoRow)}>Add row</EditorActionButton></div>
    </>; break;
    case "match": body = <>
      <p className={styles.note}>Match wording comes from <Link className={kit.inlineLink} href="/admin/homepage">Homepage</Link>, fixtures from <Link className={kit.inlineLink} href="/admin/schedule">Schedule</Link>, and the purchase link from <Link className={kit.inlineLink} href="/admin/tickets">Tickets</Link>.</p>
      <ImageSlot api={api} slot="partner" label="Partner logo under the match" description="PNG or WebP. Shown under the match card." />
    </>; break;
    case "lockers": body = <ImageSlot api={api} slot="lockers" label="Lockers image" hint="Decorative. Leave the description empty unless the image carries information." description="PNG or WebP. A wide divider image." />; break;
    case "food": body = <>
      <TextField label="Heading" value={draft.food.heading} max={120} disabled={locked} onChange={heading => patch("food", { heading })} />
      <ImageSlot api={api} slot="mealPass" label="Meal pass" description="PNG or WebP." />
      <TextField label="Text" value={draft.food.body} max={4000} multiline disabled={locked} hint="Line breaks show on desktop." onChange={text => patch("food", { body: text })} />
      <div className="grid gap-5">{draft.food.steps.map((step, index) => <div key={index} className="grid min-w-0 gap-2">
        <TextField label={`Step ${index + 1}`} value={step.label} max={120} disabled={locked} onChange={label => patch("food", { steps: draft.food.steps.map((current, position) => position === index ? { label } : current) })} />
        <ImageSlot api={api} slot={(["step1", "step2", "step3"] as const)[index]} label={`Step ${index + 1} icon`} description="PNG or WebP. A small icon." />
      </div>)}</div>
    </>; break;
    case "route": body = <>
      <div className="grid gap-5 md:grid-cols-2">
        <TextField label="Heading" value={draft.route.heading} max={120} disabled={locked} onChange={heading => patch("route", { heading })} />
        <TextField label="Subheading" value={draft.route.subheading} max={120} disabled={locked} onChange={subheading => patch("route", { subheading })} />
      </div>
      <ImageSlot api={api} slot="bus" label="Bus" description="PNG or WebP." />
      <ImageSlot api={api} slot="routeMap" label="Route map" description="PNG or WebP. Shown full width." />
    </>; break;
    case "directions": body = <>
      <p className={styles.note}>The Stadium parking menu link opens the section whose page link ends in #parking-lot-no-5.</p>
      {draft.directions.blocks.map((block, index) => <EditorGroup key={block.id} legend={`Section ${index + 1}`}>
        <TextField label="Heading" value={block.heading} max={120} disabled={locked} hint={`Page link: /stadium#${block.id}`} onChange={heading => change(content => updateBlock(content, index, { heading }))} />
        <TextList label="Paragraph" items={block.paragraphs} max={MAX_ROBINSON_PARAGRAPHS} disabled={locked} onChange={paragraphs => change(content => updateBlock(content, index, { paragraphs }))} />
        <TextField label="Italic note" value={block.note} max={4000} multiline disabled={locked} onChange={note => change(content => updateBlock(content, index, { note }))} />
        <TextList label="Bullet" items={block.bullets} max={MAX_ROBINSON_BULLETS} disabled={locked} onChange={bullets => change(content => updateBlock(content, index, { bullets }))} />
        <TextField label="Closing line" value={block.closing} max={4000} multiline disabled={locked} hint="Shown on its own line after the bullets." onChange={closing => change(content => updateBlock(content, index, { closing }))} />
        <EditorReorderButtons index={index} length={draft.directions.blocks.length} disabled={locked} noun="section" onMove={delta => patch("directions", { blocks: moveItem(draft.directions.blocks, index, delta) })} onRemove={() => patch("directions", { blocks: removeItem(draft.directions.blocks, index) })} />
      </EditorGroup>)}
      <div><EditorActionButton disabled={locked || draft.directions.blocks.length >= MAX_ROBINSON_BLOCKS} onClick={() => change(addBlock)}>Add section</EditorActionButton></div>
    </>; break;
  }
  return <div className={styles.fields}>{visible}<div className={kit.stack}>{body}</div>{["seating", "match", "lockers", "food", "route"].includes(id) && <p className={styles.note}>Images: PNG or WebP, up to 5 MB and 3000 pixels per side.</p>}</div>;
}
