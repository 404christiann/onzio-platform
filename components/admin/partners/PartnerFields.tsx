"use client";

import Link from "next/link";
import { useId, useRef, type ReactNode } from "react";
import { IconExternalLink, IconUpload } from "@/components/admin/icons";
import { kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ListField, PositionTools } from "@/components/admin/list-cards/ListField";
import styles from "@/components/admin/list-cards/ListEditor.module.css";
import NativeImage from "@/components/ResilientNativeImage";
import { PARTNER_LOGO_TONES, PARTNERSHIP_ROUTE, type CinematicPartnersContent, type PartnerLogoMedia, type PartnerLogoTone, type PartnerPage } from "@/lib/cinematic-partners-content";
import { editTargetProps } from "@/lib/admin-edit-targets";
import { GRAPHIC_UPLOAD_ACCEPT, GRAPHIC_UPLOAD_MAX_SIZE_LABEL, GRAPHIC_UPLOAD_TYPES_LABEL } from "@/lib/media-upload-types";
import { partnerPageTarget, partnerTarget } from "./partners-edit-targets";
import { PAGE_ROUTES, TONES, TONE_SHORT, parseDialogId, partnerName, type PartnersDialogId } from "./partners-sections";
import { LINK_DESTINATION_HINT } from "@/lib/link-destination";

export type PartnersFieldsApi = {
  draft: CinematicPartnersContent;
  locked: boolean;
  uploading: string | null;
  logos: PartnerLogoMedia[];
  logoUrls: Record<string, string>;
  /** Field-level save errors by path ("pages.partners.title", "partners.2.name"), shown after a refused save. */
  errors: Record<string, string>;
  update: (change: (value: CinematicPartnersContent) => void) => void;
  upload: (partnerId: string, file: File) => void;
  move: (index: number, delta: -1 | 1) => void;
  remove: (index: number) => void;
};

function PageFields({ api, page }: { api: PartnersFieldsApi; page: PartnerPage }) {
  const { draft, locked, errors, update } = api;
  const copy = draft.pages[page];
  return <div className={styles.fields}>
    <p className={styles.note}>Shown at {PAGE_ROUTES[page]}.{" "}
      <Link className={styles.openLink} href={PAGE_ROUTES[page]} target="_blank" rel="noopener">
        <IconExternalLink size={14} aria-hidden="true" />Open this page<span className="sr-only"> (opens in a new tab)</span>
      </Link></p>
    <div className={styles.row2}>
      <ListField label="Heading" value={copy.title} max={80} disabled={locked} error={errors[`pages.${page}.title`]} target={partnerPageTarget(page, "title")} onChange={value => update(content => { content.pages[page].title = value; })} />
      <ListField label="Subtitle" value={copy.subtitle} max={120} disabled={locked} target={partnerPageTarget(page, "subtitle")} onChange={value => update(content => { content.pages[page].subtitle = value; })} />
    </div>
    <ListField label="Intro" value={copy.intro} max={1200} multiline disabled={locked} target={partnerPageTarget(page, "intro")} onChange={value => update(content => { content.pages[page].intro = value; })} />
    <div className={styles.row2}>
      <ListField label="Bottom bar text" value={copy.ctaPrompt} max={160} disabled={locked} target={partnerPageTarget(page, "ctaPrompt")} onChange={value => update(content => { content.pages[page].ctaPrompt = value; })} />
      <ListField label="Button text" value={copy.ctaLabel} max={40} disabled={locked} target={partnerPageTarget(page, "ctaLabel")} hint="Leave blank to hide the bottom bar." onChange={value => update(content => { content.pages[page].ctaLabel = value; })} />
    </div>
    {page === "partners"
      ? <p className={styles.note}>The button opens the Partnership Opportunities page ({PARTNERSHIP_ROUTE}).</p>
      : <ListField label="Button link" value={draft.pages.opportunities.ctaHref} max={2000} disabled={locked} error={errors["pages.opportunities.ctaHref"]} target={partnerPageTarget("opportunities", "ctaHref")}
          hint={LINK_DESTINATION_HINT}
          onChange={value => update(content => { content.pages.opportunities.ctaHref = value; })} />}
  </div>;
}

function LogoPicker({ api, partnerId, selected }: { api: PartnersFieldsApi; partnerId: string; selected: string | null }) {
  const name = useId(), file = useRef<HTMLInputElement>(null);
  const { locked, uploading, logos, logoUrls, update, upload } = api;
  const set = (logoAssetId: string | null) => update(content => { const row = content.partners.find(partner => partner.id === partnerId); if (row) row.logoAssetId = logoAssetId; });
  // The stamp sits on the chosen tile, so a click on the logo focuses the radio that is selected (not the first one).
  const known = !!selected && logos.some(logo => logo.id === selected);
  const chosen = (isChosen: boolean) => (isChosen ? editTargetProps(partnerTarget(partnerId, "logo")) : {});
  return <fieldset className={styles.picker}>
    <legend>Logo</legend>
    <div className={styles.tiles}>
      <label className={styles.tile} data-none="" {...chosen(!known)}>
        <input type="radio" name={name} checked={!selected} disabled={locked} onChange={() => set(null)} />
        <span className={styles.tileLabel}>No logo</span>
      </label>
      {logos.map(logo => <label key={logo.id} className={styles.tile} title={logo.label} {...chosen(selected === logo.id)}>
        <input type="radio" name={name} checked={selected === logo.id} disabled={locked} onChange={() => set(logo.id)} />
        {logoUrls[logo.id] ? <><NativeImage src={logoUrls[logo.id]} alt="" /><span className="sr-only">{logo.label}</span></> : <span className={styles.tileLabel}>{logo.label}</span>}
      </label>)}
    </div>
    <div className={styles.tools}>
      <button type="button" className={`admin-press ${styles.tool}`} disabled={locked} onClick={() => file.current?.click()}><IconUpload size={16} aria-hidden="true" />{uploading === partnerId ? "Uploading…" : "Upload new logo"}</button>
    </div>
    <span className={kit.hint}>{GRAPHIC_UPLOAD_TYPES_LABEL}, up to {GRAPHIC_UPLOAD_MAX_SIZE_LABEL}. Choose a logo already used in <Link className={kit.inlineLink} href="/admin/sponsors">Sponsors</Link>, or upload a new one.</span>
    <input ref={file} type="file" accept={GRAPHIC_UPLOAD_ACCEPT} hidden tabIndex={-1} aria-hidden="true" onChange={event => {
      const chosen = event.target.files?.[0];
      event.target.value = "";
      if (chosen) upload(partnerId, chosen);
    }} />
  </fieldset>;
}

function PartnerFields({ api, id }: { api: PartnersFieldsApi; id: string }) {
  const { draft, locked, errors, update, move, remove } = api;
  const index = draft.partners.findIndex(partner => partner.id === id);
  const partner = draft.partners[index];
  const toneName = useId();
  if (!partner) return null;
  const name = partnerName(partner, index);
  const set = (change: (row: typeof partner) => void) => update(content => { const row = content.partners.find(candidate => candidate.id === id); if (row) change(row); });
  const toneHint: ReactNode = partner.tone === "original" ? "Use Grey or Black for a white logo, so it shows on the white page." : `A white logo drawn ${partner.tone} on the white Partners pages.`;
  return <div className={styles.fields}>
    <ListField label="Name" value={partner.name} max={80} disabled={locked} error={errors[`partners.${index}.name`]} target={partnerTarget(id, "name")} onChange={value => set(row => { row.name = value; })} />
    <ListField label="Role" value={partner.role} max={160} multiline disabled={locked} target={partnerTarget(id, "role")} onChange={value => set(row => { row.role = value; })} />
    <LogoPicker api={api} partnerId={id} selected={partner.logoAssetId} />
    <fieldset className={styles.segmented}>
      <legend>Logo colour on the white page</legend>
      <div className={styles.segs}>
        {PARTNER_LOGO_TONES.map((tone: PartnerLogoTone) => <label key={tone} className={styles.seg} title={TONES[tone]} {...(partner.tone === tone ? editTargetProps(partnerTarget(id, "tone")) : {})}>
          <input type="radio" name={toneName} checked={partner.tone === tone} disabled={locked} onChange={() => set(row => { row.tone = tone; })} />
          <span aria-hidden="true">{TONE_SHORT[tone]}</span><span className="sr-only">{TONES[tone]}</span>
        </label>)}
      </div>
      <p className={styles.hint}>{toneHint}</p>
    </fieldset>
    <PositionTools index={index} length={draft.partners.length} name={name} noun="partner" disabled={locked} note="Both pages show partners in this order."
      onMove={delta => move(index, delta)} onRemove={() => remove(index)} />
  </div>;
}

export function PartnersDialogFields({ api, id }: { api: PartnersFieldsApi; id: PartnersDialogId }) {
  const target = parseDialogId(id);
  if (!target) return null;
  return target.kind === "page" ? <PageFields api={api} page={target.page} /> : <PartnerFields api={api} id={target.id} />;
}
