"use client";

import { Button } from "@/components/ui/button";
import CinematicSeasonMembership from "@/components/cinematic/CinematicSeasonMembership";
import { MAX_SEASON_BENEFITS, MAX_SEASON_HIGHLIGHTS, MAX_SEASON_INCLUDES, MAX_SEASON_PRICE_ROWS, type SeasonMembershipContent } from "@/lib/cinematic-ticket-pages-content";
import { addListItem, moveListItem, removeListItem } from "@/lib/cinematic-ticket-pages-editor";
import TicketPageEditor, { MoveButtons, SectionPanel, TextField, TextList } from "./TicketPageEditor";

const ICON_HINT = "Leave the description empty: the label says what it is. Upload icons on the 752 × 350 canvas (PNG or WebP) so every icon keeps its size and lines up.";
const LINK_HINT = "Starts with https://, mailto: or / for a page on this site. Leave empty until the link is ready: the button then shows but does nothing.";

export default function SeasonMembershipEditor() {
  return <TicketPageEditor pageKey="season-membership" title="Season Ticket Membership" description="Edit the Season Ticket Membership page in the Tickets menu. Save applies all changes together."
    preview={view => <CinematicSeasonMembership content={view} placeholders />}
    fields={({ draft, locked, change, imageSlot, visibleToggle }) => {
      const set = <S extends keyof SeasonMembershipContent>(section: S, value: Partial<SeasonMembershipContent[S]>) => change(content => ({ ...content, [section]: { ...content[section], ...value } }));
      const { heading, intro, pricing, button, benefits, closing } = draft;
      return <>
        <SectionPanel title="Page heading"><div className="grid gap-5 md:grid-cols-2">
          <TextField label="Title" value={heading.title} max={120} disabled={locked} onChange={title => set("heading", { title })} />
          <TextField label="Subtitle (red line)" value={heading.subtitle} max={120} disabled={locked} onChange={subtitle => set("heading", { subtitle })} />
        </div></SectionPanel>
        <SectionPanel title="Introduction and what's included">
          <TextField label="Introduction" value={intro.text} max={4000} multiline disabled={locked} onChange={text => set("intro", { text })} />
          <TextList label="Highlight" items={intro.highlights} max={MAX_SEASON_HIGHLIGHTS} maxLength={4000} disabled={locked} onChange={highlights => set("intro", { highlights })} />
          <TextField label="List heading" value={intro.includesHeading} max={120} disabled={locked} onChange={includesHeading => set("intro", { includesHeading })} />
          <TextList label="Included item" items={intro.includes} max={MAX_SEASON_INCLUDES} maxLength={4000} disabled={locked} onChange={includes => set("intro", { includes })} />
        </SectionPanel>
        <SectionPanel title="Price table" description="End a column heading with * to show Sam's red star. The footnote shows under the table." toggle={visibleToggle(pricing.visible, visible => set("pricing", { visible }))}>
          <TextField label="Section heading" value={pricing.sectionLabel} max={120} disabled={locked} onChange={sectionLabel => set("pricing", { sectionLabel })} />
          <div className="grid gap-5 md:grid-cols-3">{pricing.columns.map((column, index) => <TextField key={index} label={`Column ${index + 1} (${["green", "blue", "teal"][index]})`} value={column} max={120} disabled={locked}
            onChange={value => set("pricing", { columns: pricing.columns.map((current, position) => position === index ? value : current) })} />)}</div>
          {pricing.rows.map((row, index) => <fieldset key={row.id} className="space-y-4 rounded-lg border border-border p-4"><legend className="px-1 text-sm font-medium">Seating section {index + 1}</legend>
            <TextField label="Section name" value={row.name} max={120} disabled={locked} onChange={name => set("pricing", { rows: pricing.rows.map((current, position) => position === index ? { ...current, name } : current) })} />
            <div className="grid gap-5 md:grid-cols-3">{row.prices.map((price, column) => <TextField key={column} label={pricing.columns[column].replace(/\*$/, "") || `Price ${column + 1}`} value={price} max={40} disabled={locked}
              onChange={value => set("pricing", { rows: pricing.rows.map((current, position) => position === index ? { ...current, prices: current.prices.map((p, c) => c === column ? value : p) } : current) })} />)}</div>
            {imageSlot(row.id, "Section badge", "Sam's round “G” badge for General Seating. Leave the description empty.")}
            <MoveButtons index={index} length={pricing.rows.length} disabled={locked} noun="section" onMove={delta => change(content => moveListItem("season-membership", content, "pricing", index, delta))} onRemove={() => change(content => removeListItem("season-membership", content, "pricing", index))} />
          </fieldset>)}
          <Button className="min-h-11" variant="outline" disabled={locked || pricing.rows.length >= MAX_SEASON_PRICE_ROWS} onClick={() => change(content => addListItem("season-membership", content, "pricing"))}>Add seating section</Button>
          <TextField label="Footnote" value={pricing.footnote} max={4000} multiline disabled={locked} onChange={footnote => set("pricing", { footnote })} />
        </SectionPanel>
        <SectionPanel title="Buy button" description="Used by both Buy buttons on the page.">
          <div className="grid gap-5 md:grid-cols-2">
            <TextField label="Button text" value={button.label} max={60} disabled={locked} onChange={label => set("button", { label })} />
            <TextField label="Button link" value={button.href} max={2000} disabled={locked} hint={LINK_HINT} onChange={href => set("button", { href })} />
          </div>
        </SectionPanel>
        <SectionPanel title="Member Benefits" description="Shown 3 across on desktop and phones. Each benefit has its own icon." toggle={visibleToggle(benefits.visible, visible => set("benefits", { visible }))}>
          <TextField label="Heading" value={benefits.heading} max={120} disabled={locked} onChange={value => set("benefits", { heading: value })} />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{benefits.items.map((item, index) => <fieldset key={item.id} className="min-w-0 space-y-4 rounded-lg border border-border p-4"><legend className="px-1 text-sm font-medium">Benefit {index + 1}</legend>
            <TextField label="Label" value={item.label} max={120} disabled={locked} onChange={label => set("benefits", { items: benefits.items.map((current, position) => position === index ? { ...current, label } : current) })} />
            {imageSlot(item.id, "Icon", ICON_HINT)}
            <MoveButtons index={index} length={benefits.items.length} disabled={locked} noun="benefit" onMove={delta => change(content => moveListItem("season-membership", content, "benefits", index, delta))} onRemove={() => change(content => removeListItem("season-membership", content, "benefits", index))} />
          </fieldset>)}</div>
          <Button className="min-h-11" variant="outline" disabled={locked || benefits.items.length >= MAX_SEASON_BENEFITS} onClick={() => change(content => addListItem("season-membership", content, "benefits"))}>Add benefit</Button>
        </SectionPanel>
        <SectionPanel title="Closing call to action" description="Heading, the second Buy button and the ticket graphic." toggle={visibleToggle(closing.visible, visible => set("closing", { visible }))}>
          <TextField label="Heading" value={closing.heading} max={120} disabled={locked} onChange={value => set("closing", { heading: value })} />
          {imageSlot("ticket", "Ticket graphic", "Describe what the ticket shows, for people using screen readers.")}
        </SectionPanel>
      </>;
    }} />;
}
