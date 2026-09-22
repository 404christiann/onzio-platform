"use client";

import { useEffect, useRef } from "react";
import type { HomepageDraft } from "@/lib/homepage-editor/model";

function rows(draft: HomepageDraft): [string, string][] {
  return [
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
  const latest = rows(current);
  return <dialog ref={dialog} className="hp-recovery-review" aria-labelledby="hp-recovery-title" onCancel={event => { event.preventDefault(); close(); }}>
    <h2 id="hp-recovery-title">Recovered homepage draft</h2>
    <p>{designChanged ? "The website design changed. Copy the wording you want to keep before discarding this draft." : "Compare your recovered work with the latest homepage. Use recovered changes to bring only your edits into the current draft. If you changed photos, the recovered photo list replaces the current list, including its order. Nothing goes live until Save homepage."}</p>
    <div className="hp-recovery-comparison">{rows(recovered).map(([label, value], index) => <section key={label}><h3>{label}</h3><dl><div><dt>Latest homepage</dt><dd>{latest[index][1] || "Blank (uses website defaults)"}</dd></div><div><dt>Recovered draft</dt><dd>{value || "Blank (uses website defaults)"}</dd></div></dl></section>)}</div>
    <div className="hp-recovery-actions"><button className="hp-button" onClick={close}>Keep reviewing later</button>{!designChanged && <button className="hp-button" onClick={() => { restore(); close(); }}>Use recovered changes</button>}</div>
  </dialog>;
}
