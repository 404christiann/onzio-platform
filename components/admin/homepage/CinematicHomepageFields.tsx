"use client";

import ResilientNativeImage from "@/components/ResilientNativeImage";
import { CINEMATIC_NAV_ITEMS, cinematicArtwork, type CinematicArtworkSlot, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import type { PieceId } from "@/lib/homepage-editor/model";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export default function CinematicHomepageFields({ piece, content, disabled, change, replaceArtwork, retryArtwork }: {
  piece: PieceId; content: CinematicHomepageContent; disabled: boolean;
  change: (content: CinematicHomepageContent) => void;
  replaceArtwork: (slot: CinematicArtworkSlot, file: File) => void;
  retryArtwork: (slot: CinematicArtworkSlot) => void;
}) {
  const update = (edit: (draft: CinematicHomepageContent) => void) => { const draft = structuredClone(content); edit(draft); change(draft); };
  const text = (label: string, value: string, maximum: number, edit: (draft: CinematicHomepageContent, value: string) => void, multiline = false) => <label className="block space-y-1.5"><span>{label}</span>{multiline
    ? <textarea className="hp-field textarea" value={value} maxLength={maximum} disabled={disabled} onChange={event => update(draft => edit(draft, event.target.value))} />
    : <input className="hp-field input" value={value} maxLength={maximum} disabled={disabled} onChange={event => update(draft => edit(draft, event.target.value))} />}</label>;
  const art = (slot: CinematicArtworkSlot) => {
    const item = cinematicArtwork(content, slot);
    return <fieldset className="space-y-3"><legend>Image</legend>
      {item.url && <ResilientNativeImage src={item.url} alt={item.alt} style={{ maxHeight: 180, maxWidth: "100%", objectFit: "contain" }} />}
      <label className="block space-y-1.5"><span>Replace image</span><input type="file" className="hp-field" accept="image/png,image/webp" disabled={disabled || item.upload === "uploading"} onChange={event => { const file = event.target.files?.[0]; if (file) replaceArtwork(slot, file); event.target.value = ""; }} /></label>
      {item.upload === "uploading" && <p role="status">Adding your image…</p>}
      {item.upload === "failed" && <div role="alert"><p>{item.error ?? "This image could not be added."}</p><button type="button" className="hp-button" disabled={disabled} onClick={() => retryArtwork(slot)}>Try adding it again</button></div>}
      {text("Describe this image", item.alt, 1000, (draft, value) => { cinematicArtwork(draft, slot).alt = value; }, true)}
      <p className="hp-help">PNG or WebP, up to 5 MB and 3000 pixels per side.</p>
      <p className="hp-help">Words inside the supplied image are changed by replacing the image.</p>
    </fieldset>;
  };
  if (piece === "revamp.sponsors") return <div className="space-y-4">{text("Heading", content.sponsors.heading, 120, (draft, value) => { draft.sponsors.heading = value; })}<p className="hp-help">Partner logos are managed in Branding.</p></div>;
  if (piece === "revamp.raffle") return art("raffle");
  if (piece === "revamp.ticket") return <div className="space-y-4"><label className="hp-visibility"><input type="checkbox" disabled={disabled} checked={content.ticket.visible} onChange={event => update(draft => { draft.ticket.visible = event.target.checked; })} />Show ticket and map on homepage</label>{art("ticket")}</div>;
  if (piece === "revamp.match") return <div className="space-y-4">
    <p className="hp-help">The next home match, opponent, date, time and venue come from Schedule.</p>
    {text("Heading", content.match.heading, 120, (draft, value) => { draft.match.heading = value; })}
    {text("Button text", content.match.buttonLabel, 60, (draft, value) => { draft.match.buttonLabel = value; })}
    <label className="block space-y-1.5"><span>Where the button goes</span><NativeSelect className="hp-field select" disabled={disabled} value={content.match.buttonHref} onChange={event => update(draft => { draft.match.buttonHref = event.target.value; })}>{[{ href: "/tickets", label: "Tickets" }, { href: "/schedule", label: "Schedule" }, ...(!["/tickets", "/schedule"].includes(content.match.buttonHref) ? [{ href: content.match.buttonHref, label: "Current destination" }] : [])].map(item => <NativeSelectOption key={item.href} value={item.href}>{item.label}</NativeSelectOption>)}</NativeSelect></label>
    {text("When no home match is scheduled", content.match.emptyMessage, 1200, (draft, value) => { draft.match.emptyMessage = value; }, true)}
  </div>;
  if (piece === "revamp.prices") return <div className="space-y-4">
    {text("Heading", content.prices.heading, 120, (draft, value) => { draft.prices.heading = value; })}
    {content.prices.rows.map((row, index) => <fieldset key={row.id} className="space-y-3 hp-photo"><legend>Ticket option {index + 1}</legend>
      {text("Name", row.label, 120, (draft, value) => { draft.prices.rows[index].label = value; })}
      {text("Price or offer", row.price, 60, (draft, value) => { draft.prices.rows[index].price = value; })}
      {text("Description", row.description, 1200, (draft, value) => { draft.prices.rows[index].description = value; }, true)}
      {text("Small print", row.note, 1200, (draft, value) => { draft.prices.rows[index].note = value; }, true)}
      <label className="block space-y-1.5"><span>Price color</span><NativeSelect className="hp-field select" value={row.accent} disabled={disabled} onChange={event => update(draft => { draft.prices.rows[index].accent = event.target.value as typeof row.accent; })}><NativeSelectOption value="none">Standard</NativeSelectOption><NativeSelectOption value="aqua">Aqua</NativeSelectOption><NativeSelectOption value="lime">Green</NativeSelectOption></NativeSelect></label>
      <div className="hp-photo-actions">{([-1, 1] as const).map(delta => <button type="button" className="hp-button" key={delta} disabled={disabled || index + delta < 0 || index + delta >= content.prices.rows.length} onClick={() => update(draft => { [draft.prices.rows[index], draft.prices.rows[index + delta]] = [draft.prices.rows[index + delta], draft.prices.rows[index]]; })}>{delta === -1 ? "Move up" : "Move down"}</button>)}<button type="button" className="hp-button" disabled={disabled} onClick={() => update(draft => { draft.prices.rows.splice(index, 1); })}>Remove option</button></div>
    </fieldset>)}
    <button type="button" className="hp-button" disabled={disabled || content.prices.rows.length >= 10} onClick={() => update(draft => { draft.prices.rows.push({ id: crypto.randomUUID(), label: "", price: "", description: "", note: "", accent: "none" }); })}>Add ticket option</button>
    {text("Footnote", content.prices.footnote, 1200, (draft, value) => { draft.prices.footnote = value; }, true)}
  </div>;
  if (piece === "revamp.championship") return <div className="space-y-4">
    {text("League or conference", content.championship.league, 120, (draft, value) => { draft.championship.league = value; })}
    {text("Year", content.championship.year, 20, (draft, value) => { draft.championship.year = value; })}
    {text("Heading", content.championship.title, 120, (draft, value) => { draft.championship.title = value; })}
    {text("Paragraph", content.championship.body, 1200, (draft, value) => { draft.championship.body = value; }, true)}
    {art("trophy")}
  </div>;
  if (piece === "revamp.navigation") return <div className="space-y-4"><p className="hp-help">Rename the tabs and menu links. The footer uses the same names.</p>{CINEMATIC_NAV_ITEMS.flatMap(item => [item, ...("children" in item ? item.children ?? [] : [])]).map(item => <div key={item.id}>{text(item.label, content.navigation.labels[item.id] ?? item.label, 60, (draft, value) => { if (value.trim()) draft.navigation.labels[item.id] = value.trim(); else delete draft.navigation.labels[item.id]; })}</div>)}<fieldset className="space-y-3"><legend>External forms</legend><p className="hp-help">Tryouts, Media credentials, and National anthem request open these forms. Leave a destination blank to show the page placeholder.</p>{text("Tryouts form URL", content.navigation.destinations.tryouts, 2000, (draft, value) => { draft.navigation.destinations.tryouts = value; })}{text("Media credentials form URL", content.navigation.destinations.mediaCredentials, 2000, (draft, value) => { draft.navigation.destinations.mediaCredentials = value; })}{text("National anthem request form URL", content.navigation.destinations.nationalAnthem, 2000, (draft, value) => { draft.navigation.destinations.nationalAnthem = value; })}</fieldset></div>;
  return null;
}
