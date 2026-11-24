"use client";

import { useEffect, useRef, useState } from "react";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { AdminDialog, AdminDialogFooter } from "@/components/admin/ui/AdminDialog";
import { CINEMATIC_ARTWORK_SLOTS, cinematicArtwork, CINEMATIC_NAV_ITEMS, isHomepageSectionShown, type CinematicArtworkSlot } from "@/lib/cinematic-homepage-content";
import type { HomepageDraft } from "@/lib/homepage-editor/model";
import type { HomepageRecoveryResult } from "@/lib/homepage-editor/recovery";

const ARTWORK_LABELS: Record<CinematicArtworkSlot, string> = {
  raffle: "Raffle artwork", ticket: "Ticket and map artwork", trophy: "Trophy image", footerLogo: "Footer logo", headerPartner: "Header sponsor logo",
};
const shownRow = (shown: boolean | undefined): string => shown === undefined ? "" : shown ? "Yes" : "No";

function rows(draft: HomepageDraft, includeRevamp = false): [string, string][] {
  const revampRows: [string, string][] = [
    ["Raffle photo shown", shownRow(draft.revamp && isHomepageSectionShown(draft.revamp.raffle))],
    ["Next home match shown", shownRow(draft.revamp && isHomepageSectionShown(draft.revamp.match))],
    ["Next home match heading", draft.revamp?.match.heading ?? ""],
    ["Ticket button", draft.revamp?.match.buttonLabel ?? ""],
    ["Ticket prices shown", shownRow(draft.revamp && isHomepageSectionShown(draft.revamp.prices))],
    ["Ticket and map shown", shownRow(draft.revamp?.ticket.visible)],
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

export default function HomepageRecoveryReview({ current, recovered, reason, allowedAction, close, restore, classic = false, finalFocus }: {
  current: HomepageDraft; recovered: HomepageDraft;
  reason: Extract<HomepageRecoveryResult, { kind: "conflict" }>["reason"];
  allowedAction: "apply" | "review-only"; close: () => void; restore: () => Promise<boolean>; classic?: boolean; finalFocus?: () => HTMLElement | false;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [applying, setApplying] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);
  const alertEl = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (applyFailed) alertEl.current?.scrollIntoView({ block: "nearest" }); }, [applyFailed]);
  useEffect(() => {
    if (classic) return;
    const modal = dialog.current;
    const trigger = document.activeElement;
    modal?.showModal();
    return () => { modal?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, [classic]);
  const includeRevamp = !!(current.revamp || recovered.revamp);
  const latest = rows(current, includeRevamp);
  const apply = async () => {
    setApplying(true); setApplyFailed(false);
    try { if (await restore()) close(); else setApplyFailed(true); }
    catch { setApplyFailed(true); }
    finally { setApplying(false); }
  };
  const later = <button className="hp-button" disabled={applying} onClick={close}>Keep reviewing later</button>;
  const useChanges = <button className={classic ? "hp-button hp-save" : "hp-button"} disabled={applying} onClick={() => void apply()}>{applying ? "Using recovered changes…" : "Use recovered changes"}</button>;
  const contents = <>
    {reason === "DESIGN_CHANGED" && allowedAction === "apply" && <p>The website design changed. Your edits can be reviewed for this design.</p>}
    <p>{allowedAction === "apply" ? "Compare your recovered work with the latest homepage. Use recovered changes to bring only your edits into the current draft. If you changed photos, the recovered photo list replaces the current list, including its order. Nothing goes live until you save." : reason === "DESIGN_CHANGED" ? "The website design changed. Copy the wording you want to keep before discarding this draft." : reason === "EXTRA_LOCAL_CHANGES" ? "Your last save was confirmed. This draft also has other changes. Copy the wording you want to keep before discarding it." : "This draft uses editing options that are not available in the current design. Copy the wording you want to keep before discarding it."}</p>
    <div className="hp-recovery-comparison">{rows(recovered, includeRevamp).map(([label, value], index) => <section key={label}><h3>{label}</h3><dl><div><dt>Latest homepage</dt><dd>{latest[index][1] || "Blank (uses website defaults)"}</dd></div><div><dt>Recovered draft</dt><dd>{value || "Blank (uses website defaults)"}</dd></div></dl></section>)}</div>
    {recovered.revamp && <div className="hp-recovery-comparison">{CINEMATIC_ARTWORK_SLOTS.map(slot => {
      const before = current.revamp ? cinematicArtwork(current.revamp, slot) : null;
      const after = cinematicArtwork(recovered.revamp!, slot);
      return <section key={slot}><h3>{ARTWORK_LABELS[slot]}</h3><p>{before?.assetId === after.assetId ? "Image is unchanged." : "Recovered draft uses a different image."}</p><dl>{[["Latest homepage", before], ["Recovered draft", after]].map(([label, image]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{image && typeof image !== "string" && image.url ? <ResilientNativeImage src={image.url} alt={image.alt} style={{ maxHeight: 180, maxWidth: "100%", objectFit: "contain" }} /> : "No image"}</dd></div>)}</dl></section>;
    })}</div>}
    {applyFailed && <p ref={alertEl} role="alert">We could not use the recovered changes. The draft is still stored. Close this review and reload your homepage before trying again.</p>}
  </>;
  if (classic) return <AdminDialog open title="Recovered homepage draft" size="lg" busy={applying} onClose={close} finalFocus={finalFocus}
    footer={<AdminDialogFooter primary={allowedAction === "apply" ? useChanges : later}>{allowedAction === "apply" && later}</AdminDialogFooter>}>
    <div className="hc-recovery-review">{contents}</div>
  </AdminDialog>;
  return <dialog ref={dialog} className="hp-recovery-review" aria-labelledby="hp-recovery-title" onCancel={event => { event.preventDefault(); if (!applying) close(); }}>
    <h2 id="hp-recovery-title">Recovered homepage draft</h2>
    {contents}
    <div className="hp-recovery-actions">{later}{allowedAction === "apply" && useChanges}</div>
  </dialog>;
}
