"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { z } from "zod";
import { ChevronDown, ChevronUp, X } from "@/components/admin/icons";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { useClubContext } from "@/components/ClubContextProvider";
import NativeImage from "@/components/ResilientNativeImage";
import CinematicPartners from "@/components/cinematic/CinematicPartners";
import CinematicShell from "@/components/cinematic/CinematicShell";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/admin-client";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import {
  MAX_PARTNERS, PARTNERSHIP_ROUTE, cinematicPartnersDraftSchema, cinematicPartnersSaveSchema, starterCinematicPartnersContent,
  type CinematicPartnersContent, type CinematicPartnersSave, type CinematicPartnersSnapshot, type PartnerLogoMedia, type PartnerLogoTone, type PartnerPage,
} from "@/lib/cinematic-partners-content";
import { addPartner, loadCinematicPartnersEditor, movePartner, removePartner, saveCinematicPartnersEditor, unusedUploads } from "@/lib/cinematic-partners-editor";
import { mediaAssetUrl } from "@/lib/media-assets";
import "@/components/admin/homepage/homepage-editor.css";

const logoSchema = z.object({ id: z.uuid(), storage_path: z.string(), width: z.number(), height: z.number(), label: z.string() });
const recoverySchema = z.object({
  content: cinematicPartnersDraftSchema,
  pending: cinematicPartnersSaveSchema.nullable(),
  uploads: z.array(z.uuid()),
  logos: z.array(logoSchema),
});
const TONES: Record<PartnerLogoTone, string> = { original: "Original colours", grey: "Grey (for a white logo)", black: "Black (for a white logo)" };
const PAGE_LABELS: Record<PartnerPage, string> = { partners: "Club Partners", opportunities: "Partnership Opportunities" };

function logoUrl(logo: PartnerLogoMedia): string {
  try { return mediaAssetUrl({ storage_bucket: "onzio-media", storage_path: logo.storage_path }); } catch { return ""; }
}
function mergeLogos(...lists: PartnerLogoMedia[][]): PartnerLogoMedia[] {
  const byId = new Map<string, PartnerLogoMedia>();
  for (const logo of lists.flat()) if (!byId.has(logo.id)) byId.set(logo.id, logo);
  return [...byId.values()];
}
async function retireUploads(ids: string[]) {
  await Promise.all(ids.map(assetId => fetch("/api/admin/media/cleanup", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }),
  }).catch(() => undefined)));
}

export default function CinematicPartnersEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<CinematicPartnersSnapshot | null>(null);
  const [draft, setDraft] = useState<CinematicPartnersContent | null>(null);
  const [pending, setPending] = useState<CinematicPartnersSave | null>(null);
  const [logos, setLogos] = useState<PartnerLogoMedia[]>([]);
  const [uploads, setUploads] = useState<string[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [previewPage, setPreviewPage] = useState<PartnerPage>("partners");
  const [phone, setPhone] = useState(false);
  const recoveryKey = useRef<string | null>(null);
  const uploadTarget = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = !!snapshot && !!draft && JSON.stringify(snapshot.content ?? starterCinematicPartnersContent()) !== JSON.stringify(draft);

  useEffect(() => {
    let active = true;
    setSnapshot(null); setDraft(null); setPending(null); setLogos([]); setUploads([]); setMessage(""); setFailed(false); recoveryKey.current = null;
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadCinematicPartnersEditor(), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id)]).then(([loaded, user, homepage]) => {
      if (!active) return;
      if (!user.data.user) throw new Error("Sign in again to edit Partners.");
      const key = `onzio:cinematic-partners:v1:${location.origin}:${user.data.user.id}:${club.id}`;
      recoveryKey.current = key;
      let saved: z.infer<typeof recoverySchema> | null = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = recoverySchema.safeParse(JSON.parse(raw));
          if (parsed.success) saved = parsed.data;
          else localStorage.removeItem(key);
        }
      } catch {}
      setSnapshot(loaded);
      setDraft(saved?.content ?? loaded.content ?? starterCinematicPartnersContent());
      setPending(saved?.pending ?? null);
      setUploads(saved?.uploads ?? []);
      setLogos(mergeLogos(loaded.logos, saved?.logos ?? []));
      setShared(homepage);
      if (saved) setMessage(saved.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved Partners draft has been restored.");
    }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load Partners."); setFailed(true); } });
    return () => { active = false; };
  }, [club.id, club.presentationTemplateKey]);

  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current) return;
    try {
      if (dirty || pending || uploads.length) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending, uploads, logos }));
      else localStorage.removeItem(recoveryKey.current);
    } catch {}
  }, [draft, snapshot, dirty, pending, uploads, logos]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader title="Partners" description="The Partners editor is unavailable for this website design. Sponsor logos are managed in Sponsors." /></AdminPage>;
  const locked = busy || !!pending || !!uploading;
  const update = (change: (value: CinematicPartnersContent) => CinematicPartnersContent | void) => {
    setDraft(current => { if (!current) return current; const next = structuredClone(current); return change(next) ?? next; });
    setMessage(""); setFailed(false);
  };
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const logoUrls = Object.fromEntries(logos.map(logo => [logo.id, logoUrl(logo)]));

  async function upload(partnerId: string, file: File) {
    if (!draft || locked) return;
    setUploading(partnerId); setFailed(false); setMessage("Adding the logo…");
    try {
      const requested = `partners/${crypto.randomUUID()}`;
      const result = await createClient().storage.from("sponsors").upload(requested, file);
      if (result.error || !result.data?.assetId) throw new Error(result.error?.message ?? "Logo upload failed.");
      const bitmap = await createImageBitmap(file);
      const logo: PartnerLogoMedia = { id: result.data.assetId, storage_path: result.data.path, width: bitmap.width, height: bitmap.height, label: file.name.replace(/\.[^.]+$/, "") };
      setLogos(current => mergeLogos([logo], current));
      setUploads(current => [...current, logo.id]);
      update(content => { const row = content.partners.find(partner => partner.id === partnerId); if (row) row.logoAssetId = logo.id; });
      setMessage("Logo added. Save to publish it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logo upload failed."); setFailed(true);
    } finally { setUploading(null); }
  }

  async function save() {
    if (!draft || !snapshot || busy || uploading) return;
    const parsed = cinematicPartnersSaveSchema.safeParse(pending ?? {
      operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft,
    });
    if (!parsed.success) { setMessage("Review the fields. Each partner needs a name, each page a heading, and the button link must be an HTTPS URL, email or site page."); setFailed(true); return; }
    const request = parsed.data;
    setPending(request); setBusy(true); setMessage("Saving Partners…"); setFailed(false);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending: request, uploads, logos })); } catch {}
    const result = await saveCinematicPartnersEditor(request);
    setBusy(false);
    if (result.status === "committed") {
      const saved = result.snapshot.content ?? starterCinematicPartnersContent();
      await retireUploads(unusedUploads(uploads, saved));
      setSnapshot(result.snapshot); setDraft(saved); setPending(null); setUploads([]);
      setLogos(mergeLogos(result.snapshot.logos));
      setMessage("Partners saved."); clearRecovery();
    } else if (result.status === "uncertain") {
      setPending(result.request); setMessage(result.message); setFailed(true);
    } else {
      setPending(null); setMessage(result.message); setFailed(true);
    }
  }

  async function reload() {
    if (locked) return;
    if ((dirty || uploads.length) && !window.confirm("Discard unsaved Partners edits and load the saved pages?")) return;
    try {
      const loaded = await loadCinematicPartnersEditor();
      await retireUploads(unusedUploads(uploads, loaded.content ?? starterCinematicPartnersContent()));
      setSnapshot(loaded); setDraft(loaded.content ?? starterCinematicPartnersContent()); setLogos(loaded.logos); setUploads([]);
      setMessage(""); setFailed(false); clearRecovery();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reload Partners."); setFailed(true); }
  }

  const textField = (label: string, value: string, maximum: number, onChange: (value: string) => void, hint?: string) =>
    <label className="block space-y-2"><span className="text-sm font-medium">{label}</span>
      <input className={ADMIN_INPUT_CLASS} disabled={locked} value={value} maxLength={maximum} onChange={event => onChange(event.target.value)} />
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>;
  const pagePanel = (page: PartnerPage) => draft && <AdminPanel key={page}>
    <h2 className="mb-1 text-lg font-semibold">{PAGE_LABELS[page]} page</h2>
    <p className="mb-5 text-sm text-muted-foreground">{page === "partners" ? "Shown at /sponsors." : `Shown at ${PARTNERSHIP_ROUTE}.`}</p>
    <div className="grid gap-5 md:grid-cols-2">
      {textField("Heading", draft.pages[page].title, 80, value => update(content => { content.pages[page].title = value; }))}
      {textField("Subtitle", draft.pages[page].subtitle, 120, value => update(content => { content.pages[page].subtitle = value; }))}
      <label className="block space-y-2 md:col-span-2"><span className="text-sm font-medium">Intro</span>
        <textarea className={`${ADMIN_INPUT_CLASS} min-h-28`} disabled={locked} maxLength={1200} value={draft.pages[page].intro} onChange={event => update(content => { content.pages[page].intro = event.target.value; })} /></label>
      {textField("Bottom bar text", draft.pages[page].ctaPrompt, 160, value => update(content => { content.pages[page].ctaPrompt = value; }))}
      {textField("Button text", draft.pages[page].ctaLabel, 40, value => update(content => { content.pages[page].ctaLabel = value; }), "Leave blank to hide the bottom bar.")}
      {page === "partners"
        ? <p className="text-xs text-muted-foreground md:col-span-2">The button opens the Partnership Opportunities page.</p>
        : <div className="md:col-span-2">{textField("Button link", draft.pages.opportunities.ctaHref, 2000, value => update(content => { content.pages.opportunities.ctaHref = value; }),
            "A full HTTPS link, a mailto: email address, or a site page starting with /. The bottom bar stays hidden until a link is saved.")}</div>}
    </div>
  </AdminPanel>;

  return <AdminPage className="pb-24">
    <AdminPageHeader title="Partners" description="Edit the Club Partners and Partnership Opportunities pages. Both pages show the same partner list. Save applies all changes together."
      actions={<span className="flex gap-4"><Link className="text-primary underline" href="/sponsors" target="_blank">Open Club Partners</Link><Link className="text-primary underline" href={PARTNERSHIP_ROUTE} target="_blank">Open Partnership Opportunities</Link></span>} />
    {message && <div className={failed ? "rounded-lg border border-destructive p-4 text-sm" : "rounded-lg border border-border p-4 text-sm"} role={failed ? "alert" : "status"}>{message}</div>}
    {!draft || !snapshot ? <AdminPanel><p role="status">Loading Partners…</p>{failed && <Button onClick={() => location.reload()}>Try again</Button>}</AdminPanel> : <>
      {pagePanel("partners")}
      {pagePanel("opportunities")}
      <AdminPanel>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Partners</h2>
            <p className="text-sm text-muted-foreground">Shown on both pages in this order. Choose a logo already used in <Link className="text-primary underline" href="/admin/sponsors">Sponsors</Link>, or upload a new one (PNG, JPEG or WebP).</p></div>
          <span className="text-sm text-muted-foreground">{draft.partners.length}/{MAX_PARTNERS}</span>
        </div>
        {draft.partners.length === 0 && <p className="mb-4 text-sm text-muted-foreground">No partners yet. The pages hide the partner grid until one is added.</p>}
        <ol className="space-y-4">{draft.partners.map((partner, index) => {
          const url = partner.logoAssetId ? logoUrls[partner.logoAssetId] : "";
          return <li key={partner.id} className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <div className="flex h-24 items-center justify-center rounded-md border border-border bg-white p-3">
              {url ? <NativeImage src={url} alt={partner.name || `Partner ${index + 1} logo`} className="max-h-full max-w-full object-contain" style={{ filter: partner.tone === "grey" ? "brightness(.62)" : partner.tone === "black" ? "brightness(0)" : undefined }} />
                : <span className="text-center text-xs text-muted-foreground">No logo yet. The page shows the name with “Original logo pending”.</span>}
            </div>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {textField("Name", partner.name, 80, value => update(content => { content.partners[index].name = value; }))}
              {textField("Role", partner.role, 160, value => update(content => { content.partners[index].role = value; }))}
              <label className="block space-y-2"><span className="text-sm font-medium">Logo</span>
                <select className={ADMIN_INPUT_CLASS} disabled={locked} value={partner.logoAssetId ?? ""} onChange={event => update(content => { content.partners[index].logoAssetId = event.target.value || null; })}>
                  <option value="">No logo</option>
                  {logos.map(logo => <option key={logo.id} value={logo.id}>{logo.label}</option>)}
                </select></label>
              <label className="block space-y-2"><span className="text-sm font-medium">Logo colour on the white page</span>
                <select className={ADMIN_INPUT_CLASS} disabled={locked} value={partner.tone} onChange={event => update(content => { content.partners[index].tone = event.target.value as PartnerLogoTone; })}>
                  {Object.entries(TONES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button variant="outline" disabled={locked} onClick={() => { uploadTarget.current = partner.id; fileInput.current?.click(); }}>{uploading === partner.id ? "Uploading…" : "Upload new logo"}</Button>
                <Button variant="outline" disabled={locked || index === 0} aria-label={`Move ${partner.name || `partner ${index + 1}`} up`} onClick={() => update(content => movePartner(content, index, -1))}><ChevronUp width="16" height="16" /></Button>
                <Button variant="outline" disabled={locked || index === draft.partners.length - 1} aria-label={`Move ${partner.name || `partner ${index + 1}`} down`} onClick={() => update(content => movePartner(content, index, 1))}><ChevronDown width="16" height="16" /></Button>
                <Button variant="outline" disabled={locked} aria-label={`Remove ${partner.name || `partner ${index + 1}`}`} onClick={() => update(content => removePartner(content, index))}><X width="14" height="14" /> Remove</Button>
              </div>
            </div>
          </li>;
        })}</ol>
        <Button className="mt-4" variant="outline" disabled={locked || draft.partners.length >= MAX_PARTNERS} onClick={() => update(content => addPartner(content))}>Add partner</Button>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => {
          const file = event.target.files?.[0]; const target = uploadTarget.current;
          event.target.value = "";
          if (file && target) void upload(target, file);
        }} />
      </AdminPanel>
      <AdminPanel><details><summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">Preview current edits</summary>
        <div className="my-4 flex flex-wrap gap-3">
          <Button variant={previewPage === "partners" ? "default" : "outline"} onClick={() => setPreviewPage("partners")}>Club Partners</Button>
          <Button variant={previewPage === "opportunities" ? "default" : "outline"} onClick={() => setPreviewPage("opportunities")}>Partnership Opportunities</Button>
          <span className="w-px bg-border" aria-hidden="true" />
          <Button variant={!phone ? "default" : "outline"} onClick={() => setPhone(false)}>Desktop</Button>
          <Button variant={phone ? "default" : "outline"} onClick={() => setPhone(true)}>Phone</Button>
        </div>
        <div className="overflow-auto rounded-lg border border-border" style={{ "--hp-viewport": "100dvh" } as CSSProperties}><div style={{ width: phone ? 390 : 1280 }}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={PAGE_LABELS[previewPage]}><CinematicShell contentOnly initialContent={shared}><CinematicPartners page={previewPage} content={draft} logoUrls={logoUrls} /></CinematicShell></HomepagePreviewFrame></div></div>
      </details></AdminPanel>
      <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4 shadow-lg">
        <Button disabled={busy || !!uploading || (!dirty && !pending)} onClick={() => void save()}>{busy ? "Saving…" : pending ? "Retry same save" : "Save Partners"}</Button>
        <Button variant="outline" disabled={locked} onClick={() => void reload()}>Reload saved pages</Button>
        <span className="self-center text-sm text-muted-foreground">{pending ? "Awaiting save confirmation" : uploading ? "Uploading logo…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
      </div>
    </>}
  </AdminPage>;
}
