"use client";

import { useEffect, useRef } from "react";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { CINEMATIC_ARTWORK_SLOTS, cinematicArtwork, CINEMATIC_NAV_ITEMS } from "@/lib/cinematic-homepage-content";
import type { HomepageDraft } from "@/lib/homepage-editor/model";

function rows(draft: HomepageDraft, includeRevamp = false): [string, string][] {
  const revampRows: [string, string][] = [
    ["Next home match heading", draft.revamp?.match.heading ?? ""],
    ["Ticket button", draft.revamp?.match.buttonLabel ?? ""],
    ["Ticket and map shown", draft.revamp ? draft.revamp.ticket.visible ? "Yes" : "No" : ""],
    ["Ticket prices", draft.revamp ? [draft.revamp.prices.heading, ...draft.revamp.prices.rows.map(row => [row.label, row.price, row.description, row.note].filter(Boolean).join(" · ")), draft.revamp.prices.footnote].filter(Boolean).join("\n") : ""],
    ["Championship", draft.revamp ? [draft.revamp.championship.league, draft.revamp.championship.year, draft.revamp.championship.title, draft.revamp.championship.body].filter(Boolean).join("\n") : ""],
    ["Partner heading", draft.revamp?.sponsors.heading ?? ""],
    ["Navigation names", draft.revamp ? CINEMATIC_NAV_ITEMS.flatMap(item => [item, ...("children" in item ? item.children ?? [] : [])]).map(item => `${item.label}: ${draft.revamp!.navigation.labels[item.id] ?? item.label}`).join("\n") : ""],
  ];
  return [
    ...(includeRevamp ? revampRows : []),
    ["Small heading", draft.hero.eyebrow], ["Main heading · Line one", draft.hero.headline_line_one],
    ["Main heading · Line two", draft.hero.headline_line_two], ["Short paragraph", draft.hero.intro],
    ["First button text", draft.hero.primary_cta_label], ["First button destination", draft.hero.primary_cta_href],
    ["Second button text", draft.hero.secondary_cta_label], ["Second button destination", draft.hero.secondary_cta_href],
    ["Story shown", draft.story.visible ? "Yes" : "No"], ["Story heading", draft.story.heading],
    ["Story first paragraph", draft.story.bodyPrimary], ["Story second paragraph", draft.story.bodySecondary],
    ["Story button", draft.story.ctaLabel], ["Slideshow label", draft.photos.seasonLabel],
    ["Photos in order", draft.photos.items.map((photo, index) => `${index + 1}. ${photo.alt || "No description"}`).join("\n")],
    ["Video shown", draft.video.visible ? "Yes" : "No"], ["Video small heading", draft.video.eyebrow],
    ["Video heading", draft.video.title], ["Video paragraph", draft.video.description],
    ["Video title", draft.video.video_title], ["Video caption", draft.video.caption],
  ];
}

export default function HomepageRecoveryReview({ current, recovered, designChanged, close, restore }: {
  current: HomepageDraft; recovered: HomepageDraft; designChanged: boolean; close: () => void; restore: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const includeRevamp = !!(current.revamp || recovered.revamp);
  const latest = rows(current, includeRevamp);
  return <dialog ref={dialog} className="hp-recovery-review" aria-labelledby="hp-recovery-title" onCancel={event => { event.preventDefault(); close(); }}>
    <h2 id="hp-recovery-title">Recovered homepage draft</h2>
    <p>{designChanged ? "The website design changed. Copy the wording you want to keep before discarding this draft." : "Compare your recovered work with the latest homepage. Use recovered changes to bring only your edits into the current draft. If you changed photos, the recovered photo list replaces the current list, including its order. Nothing goes live until Save homepage."}</p>
    <div className="hp-recovery-comparison">{rows(recovered, includeRevamp).map(([label, value], index) => <section key={label}><h3>{label}</h3><dl><div><dt>Latest homepage</dt><dd>{latest[index][1] || "Blank (uses website defaults)"}</dd></div><div><dt>Recovered draft</dt><dd>{value || "Blank (uses website defaults)"}</dd></div></dl></section>)}</div>
    {recovered.revamp && <div className="hp-recovery-comparison">{CINEMATIC_ARTWORK_SLOTS.map(slot => {
      const before = current.revamp ? cinematicArtwork(current.revamp, slot) : null;
      const after = cinematicArtwork(recovered.revamp!, slot);
      return <section key={slot}><h3>{slot === "raffle" ? "Raffle artwork" : slot === "ticket" ? "Ticket and map artwork" : "Trophy image"}</h3><p>{before?.assetId === after.assetId ? "Image is unchanged." : "Recovered draft uses a different image."}</p><dl>{[["Latest homepage", before], ["Recovered draft", after]].map(([label, image]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{image && typeof image !== "string" && image.url ? <ResilientNativeImage src={image.url} alt={image.alt} style={{ maxHeight: 180, maxWidth: "100%", objectFit: "contain" }} /> : "No image"}</dd></div>)}</dl></section>;
    })}</div>}
    <div className="hp-recovery-actions"><button className="hp-button" onClick={close}>Keep reviewing later</button>{!designChanged && <button className="hp-button" onClick={() => { restore(); close(); }}>Use recovered changes</button>}</div>
  </dialog>;
}
