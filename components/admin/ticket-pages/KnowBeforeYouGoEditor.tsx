"use client";

import Link from "next/link";
import CinematicKnowBeforeYouGo from "@/components/cinematic/CinematicKnowBeforeYouGo";
import { EditorActionButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { MAX_KBYG_TILES, type KnowBeforeYouGoContent } from "@/lib/cinematic-ticket-pages-content";
import { addListItem, moveListItem, removeListItem } from "@/lib/cinematic-ticket-pages-editor";
import TicketPageEditor, { ItemCard, MoveButtons, SectionPanel, TextField } from "./TicketPageEditor";

const ICON_HINT = "Leave the description empty: the label says what it is. Upload icons on the 752 × 350 canvas (PNG or WebP) so every icon keeps its size and lines up.";
const LINK_HINT = "Starts with https://, mailto: or / for a page on this site.";

export default function KnowBeforeYouGoEditor() {
  return <TicketPageEditor pageKey="know-before-you-go" title="Know Before You Go" description="Edit the Know Before You Go page in the Tickets menu. Update the raffle prize and donor each match. Save applies all changes together."
    preview={view => <CinematicKnowBeforeYouGo content={view} placeholders />}
    fields={({ draft, locked, change, imageSlot, visibleToggle }) => {
      const set = <S extends keyof KnowBeforeYouGoContent>(section: S, value: Partial<KnowBeforeYouGoContent[S]>) => change(content => ({ ...content, [section]: { ...content[section], ...value } }));
      const { heading, match, facts, raffle, donor } = draft;
      return <>
        <SectionPanel title="Page heading"><div className="grid gap-5 md:grid-cols-2">
          <TextField label="Title" value={heading.title} max={120} disabled={locked} onChange={title => set("heading", { title })} />
          <TextField label="Subtitle (red line)" value={heading.subtitle} max={120} disabled={locked} onChange={subtitle => set("heading", { subtitle })} />
        </div></SectionPanel>
        <SectionPanel title="Next home match" toggle={visibleToggle(match.visible, visible => set("match", { visible }), "Show the next home match on the page")}
          description={<>The date, venue, opponent and both crests come from the next home match in <Link href="/admin/schedule">Schedule</Link>.</>}>
          <TextField label="Competition line" value={match.competition} max={120} disabled={locked} hint="Used when the Schedule match has no competition." onChange={competition => set("match", { competition })} />
          <div className="grid gap-5 md:grid-cols-2">
            <TextField label="Watch line" value={match.watchLabel} max={120} disabled={locked} onChange={watchLabel => set("match", { watchLabel })} />
            <TextField label="Game-day live stream link" value={match.watchHref} max={2000} disabled={locked} hint="Paste this game's YouTube live stream link (starts with https://). Opens in a new tab. Leave empty to send fans to the club's YouTube channel from Branding." onChange={watchHref => set("match", { watchHref })} />
          </div>
          {imageSlot("youtube", "YouTube logo", "Until the logo is added, this description shows as text after the watch line.")}
        </SectionPanel>
        <SectionPanel title="Match-day tiles" description="An icon and a short label each, 3 across on desktop." toggle={visibleToggle(facts.visible, visible => set("facts", { visible }), "Show the match-day tiles on the page")}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{facts.tiles.map((tile, index) => <ItemCard key={tile.id} legend={`Tile ${index + 1}`}>
            <TextField label="Label" value={tile.label} max={120} disabled={locked} onChange={label => set("facts", { tiles: facts.tiles.map((current, position) => position === index ? { ...current, label } : current) })} />
            {imageSlot(tile.id, "Icon or logo", ICON_HINT)}
            <MoveButtons index={index} length={facts.tiles.length} disabled={locked} noun="tile" onMove={delta => change(content => moveListItem("know-before-you-go", content, "tiles", index, delta))} onRemove={() => change(content => removeListItem("know-before-you-go", content, "tiles", index))} />
          </ItemCard>)}</div>
          <div><EditorActionButton disabled={locked || facts.tiles.length >= MAX_KBYG_TILES} onClick={() => change(content => addListItem("know-before-you-go", content, "tiles"))}>Add tile</EditorActionButton></div>
        </SectionPanel>
        <SectionPanel title="Halftime raffle" toggle={visibleToggle(raffle.visible, visible => set("raffle", { visible }), "Show the halftime raffle on the page")}>
          <div className="grid gap-5 md:grid-cols-2">
            <TextField label="Heading" value={raffle.heading} max={120} disabled={locked} onChange={value => set("raffle", { heading: value })} />
            <TextField label="Prize (red line)" value={raffle.subheading} max={120} disabled={locked} onChange={subheading => set("raffle", { subheading })} />
          </div>
          {imageSlot("raffle", "Prize photo")}
          <TextField label="Text" value={raffle.body} max={2000} multiline disabled={locked} hint="Put **two stars** on each side of words to make them bold, for example **PlayStation 5**." onChange={body => set("raffle", { body })} />
        </SectionPanel>
        <SectionPanel title="Raffle donor" toggle={visibleToggle(donor.visible, visible => set("donor", { visible }), "Show the raffle donor on the page")}>
          <div className="grid gap-5 md:grid-cols-2">
            <TextField label="Heading" value={donor.heading} max={120} disabled={locked} onChange={value => set("donor", { heading: value })} />
            <TextField label="Donor name" value={donor.name} max={120} disabled={locked} hint="Shows in place of the logo until the logo is added." onChange={name => set("donor", { name })} />
          </div>
          {imageSlot("donor", "Donor logo")}
          <TextField label="About the donor" value={donor.body} max={4000} multiline disabled={locked} onChange={body => set("donor", { body })} />
          <div className="grid gap-5 md:grid-cols-2">
            <TextField label="Button text" value={donor.buttonLabel} max={60} disabled={locked} onChange={buttonLabel => set("donor", { buttonLabel })} />
            <TextField label="Button link" value={donor.buttonHref} max={2000} disabled={locked} hint={`${LINK_HINT} Leave empty until it is ready: the button then shows but does nothing.`} onChange={buttonHref => set("donor", { buttonHref })} />
          </div>
        </SectionPanel>
      </>;
    }} />;
}
