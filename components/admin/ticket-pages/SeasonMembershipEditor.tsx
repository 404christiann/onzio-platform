"use client";

import { useRef, type ReactNode } from "react";
import CinematicSeasonMembership from "@/components/cinematic/CinematicSeasonMembership";
import { EditorGroup, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { StringListField, TableEditor } from "@/components/admin/ui/editor-kit";
import { MAX_SEASON_BENEFITS, MAX_SEASON_HIGHLIGHTS, MAX_SEASON_INCLUDES, MAX_SEASON_PRICE_ROWS, type SeasonMembershipContent } from "@/lib/cinematic-ticket-pages-content";
import { addListItem, moveListItem, removeListItem } from "@/lib/cinematic-ticket-pages-editor";
import { AddButton, IMAGE_NOTE, ImageSlot, ReorderTools, ShowRow, TextField } from "./editor-parts";
import TicketPageEditor, { type TicketPageFieldsApi } from "./TicketPageEditor";
import { SEASON_SPEC, ticketPageSectionShown, type SeasonSectionId } from "./ticket-page-sections";
import styles from "./ticket-editors.module.css";

const ICON_HINT = "Leave the description empty: the label says what it is. Upload icons on the 752 × 350 canvas (PNG or WebP) so every icon keeps its size and lines up.";
const LINK_HINT = "Starts with https://, mailto: or / for a page on this site. Leave empty until the link is ready: the button then shows but does nothing.";
const SWITCH_COPY: Partial<Record<SeasonSectionId, string>> = {
  button: "Hides both Buy buttons on the page: the one under the price table and the one in the closing call to action.",
};

type Api = TicketPageFieldsApi<"season-membership">;

/** Price rows as a small table. Adding and removing a row goes through the existing list helpers, so each row keeps exactly one badge slot. */
function PriceTable({ api }: { api: Api }) {
  const { draft, locked, change } = api, { pricing } = draft;
  const removing = useRef<number | null>(null);
  const columns = [
    { key: "name", label: "Section name", maxLength: 120 },
    ...pricing.columns.map((column, index) => ({ key: `price-${index}`, label: column.replace(/\*$/, "") || `Price ${index + 1}`, maxLength: 40 })),
  ];
  const rows = pricing.rows.map(row => [row.name, ...row.prices]);
  const set = (patch: Partial<SeasonMembershipContent["pricing"]>) => change(content => ({ ...content, pricing: { ...content.pricing, ...patch } }));
  function onRows(next: string[][]) {
    if (next.length > rows.length) { change(content => addListItem("season-membership", content, "pricing")); return; }
    if (next.length < rows.length) {
      // The table only reports the rows left. The remove press that caused this names the row, so its image slot goes with it.
      let index = removing.current ?? next.findIndex((row, position) => row.join("\u0000") !== rows[position].join("\u0000"));
      if (index < 0) index = rows.length - 1;
      removing.current = null;
      change(content => removeListItem("season-membership", content, "pricing", index));
      return;
    }
    set({ rows: pricing.rows.map((row, position) => ({ ...row, name: next[position][0], prices: next[position].slice(1, 4) })) });
  }
  return <div className={styles.table}>
    <div className={styles.three}>{pricing.columns.map((column, index) => <TextField key={index} label={`Column ${index + 1} heading`} value={column} max={120} disabled={locked}
      hint={index === 0 ? "End a heading with * to show Sam's red star." : undefined} onChange={value => set({ columns: pricing.columns.map((current, position) => position === index ? value : current) })} />)}</div>
    <div onClickCapture={event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('button[aria-label^="Remove seating section "]');
      const number = button?.getAttribute("aria-label")?.match(/(\d+)$/)?.[1];
      if (number) removing.current = Number(number) - 1;
    }}>
      <TableEditor label="Price table" description="One row per seating section. The footnote shows under the table." columns={columns} rows={rows} onChange={onRows}
        maxRows={MAX_SEASON_PRICE_ROWS} rowLabel="seating section" disabled={locked} />
    </div>
    <TextField label="Footnote" value={pricing.footnote} max={4000} multiline disabled={locked} onChange={footnote => set({ footnote })} />
    {pricing.rows.length > 0 && <div className={kit.stack}>
      <p className={styles.note}>Each seating section has its own badge picture.</p>
      <div className={styles.grid}>{pricing.rows.map((row, index) => <fieldset key={row.id} className={styles.tile}>
        <legend>{row.name || `Seating section ${index + 1}`}</legend>
        {badge(api, row.id, row.name || `Seating section ${index + 1}`)}
        <ReorderTools index={index} length={pricing.rows.length} disabled={locked} noun="seating section" onMove={delta => change(content => moveListItem("season-membership", content, "pricing", index, delta))}
          onRemove={() => change(content => removeListItem("season-membership", content, "pricing", index))} />
      </fieldset>)}</div>
    </div>}
  </div>;
}

function badge(api: Api, slot: string, name: string): ReactNode {
  const { draft, view, locked, uploading, change, upload, removeImage } = api;
  if (!draft.images[slot]) return null;
  return <ImageSlot key={slot} bare label={`Badge for ${name}`} description="PNG or WebP. Sam's round “G” badge for General Seating." size={64} previewUrl={view.images[slot]?.url ?? null} alt={draft.images[slot].alt}
    hasImage={!!draft.images[slot].assetId} disabled={locked} uploading={uploading === slot} hint="Leave the description empty."
    onUpload={file => upload(slot, file)} onRemove={() => removeImage(slot)}
    onAlt={alt => change(content => ({ ...content, images: { ...content.images, [slot]: { ...content.images[slot], alt } } }))} />;
}

function fields(api: Api, id: string): ReactNode {
  const { draft, view, locked, uploading, change, setShown, upload, removeImage } = api;
  const section = id as SeasonSectionId, { heading, intro, pricing, button, benefits, closing } = draft;
  const set = <S extends keyof SeasonMembershipContent>(part: S, value: Partial<SeasonMembershipContent[S]>) => change(content => ({ ...content, [part]: { ...content[part], ...value } }));
  const shown = ticketPageSectionShown(SEASON_SPEC, draft, section);
  const title = SEASON_SPEC.sections.find(item => item.id === section)!.title;
  let body: ReactNode = null;
  switch (section) {
    case "heading": body = <div className={styles.two}>
      <TextField label="Title" value={heading.title} max={120} disabled={locked} onChange={value => set("heading", { title: value })} />
      <TextField label="Subtitle (red line)" value={heading.subtitle} max={120} disabled={locked} onChange={subtitle => set("heading", { subtitle })} />
    </div>; break;
    case "intro": body = <>
      <TextField label="Introduction" value={intro.text} max={4000} multiline disabled={locked} onChange={text => set("intro", { text })} />
      <StringListField label="Highlights" itemLabel="highlight" items={intro.highlights} max={MAX_SEASON_HIGHLIGHTS} maxLength={4000} multiline disabled={locked} onChange={highlights => set("intro", { highlights })} />
      <TextField label="List heading" value={intro.includesHeading} max={120} disabled={locked} onChange={includesHeading => set("intro", { includesHeading })} />
      <StringListField label="Included items" itemLabel="included item" items={intro.includes} max={MAX_SEASON_INCLUDES} maxLength={4000} multiline disabled={locked} onChange={includes => set("intro", { includes })} />
    </>; break;
    case "pricing": body = <>
      <TextField label="Section heading" value={pricing.sectionLabel} max={120} disabled={locked} onChange={sectionLabel => set("pricing", { sectionLabel })} />
      <PriceTable api={api} />
    </>; break;
    case "button": body = <div className={styles.two}>
      <TextField label="Button text" value={button.label} max={60} disabled={locked} onChange={label => set("button", { label })} />
      <TextField label="Button link" value={button.href} max={2000} disabled={locked} hint={LINK_HINT} onChange={href => set("button", { href })} />
    </div>; break;
    case "benefits": body = <>
      <TextField label="Heading" value={benefits.heading} max={120} disabled={locked} onChange={value => set("benefits", { heading: value })} />
      <p className={styles.note}>Shown 3 across on desktop and phones. Each benefit has its own icon.</p>
      <div className={styles.grid}>{benefits.items.map((item, index) => <fieldset key={item.id} className={styles.tile}>
        <legend>Benefit {index + 1}</legend>
        <TextField label="Label" value={item.label} max={120} disabled={locked} onChange={label => set("benefits", { items: benefits.items.map((current, position) => position === index ? { ...current, label } : current) })} />
        {draft.images[item.id] && <ImageSlot bare label={`Icon for benefit ${index + 1}`} description="PNG or WebP." size={64} hint={ICON_HINT} previewUrl={view.images[item.id]?.url ?? null} alt={draft.images[item.id].alt}
          hasImage={!!draft.images[item.id].assetId} disabled={locked} uploading={uploading === item.id} onUpload={file => upload(item.id, file)} onRemove={() => removeImage(item.id)}
          onAlt={alt => change(content => ({ ...content, images: { ...content.images, [item.id]: { ...content.images[item.id], alt } } }))} />}
        <ReorderTools index={index} length={benefits.items.length} disabled={locked} noun="benefit" onMove={delta => change(content => moveListItem("season-membership", content, "benefits", index, delta))}
          onRemove={() => change(content => removeListItem("season-membership", content, "benefits", index))} />
      </fieldset>)}</div>
      <div><AddButton disabled={locked || benefits.items.length >= MAX_SEASON_BENEFITS} onClick={() => change(content => addListItem("season-membership", content, "benefits"))}>Add benefit</AddButton></div>
      <p className={styles.note}>{benefits.items.length} of {MAX_SEASON_BENEFITS} benefits.</p>
    </>; break;
    case "closing": body = <>
      <TextField label="Heading" value={closing.heading} max={120} disabled={locked} onChange={value => set("closing", { heading: value })} />
      <p className={styles.note}>The Buy button under the heading is the one from the Buy button card.</p>
      {draft.images.ticket && <ImageSlot label="Ticket graphic" description="PNG or WebP. Shown under the button." previewUrl={view.images.ticket?.url ?? null} alt={draft.images.ticket.alt} hasImage={!!draft.images.ticket.assetId}
        disabled={locked} uploading={uploading === "ticket"} hint="Describe what the ticket shows, for people using screen readers." onUpload={file => upload("ticket", file)} onRemove={() => removeImage("ticket")}
        onAlt={alt => change(content => ({ ...content, images: { ...content.images, ticket: { ...content.images.ticket, alt } } }))} />}
    </>; break;
  }
  return <div className={styles.fields}>
    {shown !== null && <ShowRow label={SEASON_SPEC.sections.find(item => item.id === section)?.switchLabel ?? `Show ${title} on the page`} checked={shown} disabled={locked} onChange={next => setShown(section, next)} copy={SWITCH_COPY[section]} />}
    <div className={kit.stack}>{body}</div>
    {(section === "pricing" || section === "benefits" || section === "closing") && <p className={styles.note}>{IMAGE_NOTE} Dashed boxes in the preview mark images still to add. Visitors never see them.</p>}
  </div>;
}

export default function SeasonMembershipEditor() {
  return <TicketPageEditor spec={SEASON_SPEC} title="Season Ticket Membership" description="Edit the Season Ticket Membership page in the Tickets menu. Save applies all changes together."
    openPageHref="/tickets/season-membership" renderFields={fields}
    renderLive={view => <CinematicSeasonMembership content={view} placeholders />} />;
}
