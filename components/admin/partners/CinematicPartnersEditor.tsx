"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ChevronDown, ChevronUp, IconUpload } from "@/components/admin/icons";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { EditorActionButton, EditorIconButton, EditorLoading, EditorNotice, EditorPageLink, EditorPreview, EditorRemoveButton, EditorSaveBar, EditorSecondaryButton, EditorSection, EditorSegmented, editorSaveState, kit, useSavedFlash } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { useClubContext } from "@/components/ClubContextProvider";
import NativeImage from "@/components/ResilientNativeImage";
import CinematicPartners from "@/components/cinematic/CinematicPartners";
import CinematicShell from "@/components/cinematic/CinematicShell";
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
  const [confirmReload, setConfirmReload] = useState(false);
  const [saved, setSaved] = useSavedFlash();
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
    setMessage(""); setFailed(false); setSaved(false);
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
      setMessage("Partners saved."); clearRecovery(); setSaved(true);
    } else if (result.status === "uncertain") {
      setPending(result.request); setMessage(result.message); setFailed(true);
    } else {
      setPending(null); setMessage(result.message); setFailed(true);
    }
  }

  async function reload(confirmed = false) {
    if (locked) return;
    if ((dirty || uploads.length) && !confirmed) { setConfirmReload(true); return; }
    try {
      const loaded = await loadCinematicPartnersEditor();
      await retireUploads(unusedUploads(uploads, loaded.content ?? starterCinematicPartnersContent()));
      setSnapshot(loaded); setDraft(loaded.content ?? starterCinematicPartnersContent()); setLogos(loaded.logos); setUploads([]);
      setMessage(""); setFailed(false); clearRecovery();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reload Partners."); setFailed(true); }
  }

  const textField = (label: string, value: string, maximum: number, onChange: (value: string) => void, hint?: string) =>
    <label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>{label}</span>
      <input className={ADMIN_INPUT_CLASS} disabled={locked} value={value} maxLength={maximum} onChange={event => onChange(event.target.value)} />
      {hint && <span className={kit.hint}>{hint}</span>}</label>;
  const pagePanel = (page: PartnerPage) => draft && <EditorSection key={page} title={`${PAGE_LABELS[page]} page`} description={page === "partners" ? "Shown at /sponsors." : `Shown at ${PARTNERSHIP_ROUTE}.`}>
    <div className="grid gap-5 md:grid-cols-2">
      {textField("Heading", draft.pages[page].title, 80, value => update(content => { content.pages[page].title = value; }))}
      {textField("Subtitle", draft.pages[page].subtitle, 120, value => update(content => { content.pages[page].subtitle = value; }))}
      <label className="block min-w-0 md:col-span-2"><span className={ADMIN_LABEL_CLASS}>Intro</span>
        <textarea className={`${ADMIN_INPUT_CLASS} min-h-28`} disabled={locked} maxLength={1200} value={draft.pages[page].intro} onChange={event => update(content => { content.pages[page].intro = event.target.value; })} /></label>
      {textField("Bottom bar text", draft.pages[page].ctaPrompt, 160, value => update(content => { content.pages[page].ctaPrompt = value; }))}
      {textField("Button text", draft.pages[page].ctaLabel, 40, value => update(content => { content.pages[page].ctaLabel = value; }), "Leave blank to hide the bottom bar.")}
      {page === "partners"
        ? <p className={`${kit.hint} md:col-span-2`}>The button opens the Partnership Opportunities page.</p>
        : <div className="md:col-span-2">{textField("Button link", draft.pages.opportunities.ctaHref, 2000, value => update(content => { content.pages.opportunities.ctaHref = value; }),
            "A full HTTPS link, a mailto: email address, or a site page starting with /. The bottom bar stays hidden until a link is saved.")}</div>}
    </div>
  </EditorSection>;

  return <AdminPage className={kit.page}>
    <AdminPageHeader eyebrow="Public website" title="Partners" description="Edit the Club Partners and Partnership Opportunities pages. Both pages show the same partner list. Save applies all changes together."
      actions={<span className={kit.headerActions}><EditorPageLink href="/sponsors">Open Club Partners</EditorPageLink><EditorPageLink href={PARTNERSHIP_ROUTE}>Open Partnership Opportunities</EditorPageLink></span>} />
    {message && <EditorNotice failed={failed}>{message}</EditorNotice>}
    {!draft || !snapshot ? <EditorLoading label="Loading Partners…" failed={failed} onRetry={() => location.reload()} /> : <>
      {pagePanel("partners")}
      {pagePanel("opportunities")}
      <EditorSection title="Partners" aside={`${draft.partners.length}/${MAX_PARTNERS}`}
        description={<>Shown on both pages in this order. Choose a logo already used in <Link className={kit.inlineLink} href="/admin/sponsors">Sponsors</Link>, or upload a new one (PNG, JPEG or WebP).</>}>
        {draft.partners.length === 0 && <p className={`${kit.note} mb-4`}>No partners yet. The pages hide the partner grid until one is added.</p>}
        <ol className="grid gap-4">{draft.partners.map((partner, index) => {
          const url = partner.logoAssetId ? logoUrls[partner.logoAssetId] : "";
          const name = partner.name || `partner ${index + 1}`;
          return <li key={partner.id} className={`${kit.group} grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]`}>
            <div className={kit.imagePreview} data-tone="light">
              {url ? <NativeImage src={url} alt={partner.name || `Partner ${index + 1} logo`} style={{ filter: partner.tone === "grey" ? "brightness(.62)" : partner.tone === "black" ? "brightness(0)" : undefined }} />
                : <span className={kit.imageEmpty}>No logo yet. The page shows the name with “Original logo pending”.</span>}
            </div>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {textField("Name", partner.name, 80, value => update(content => { content.partners[index].name = value; }))}
              {textField("Role", partner.role, 160, value => update(content => { content.partners[index].role = value; }))}
              <label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Logo</span>
                <select className={ADMIN_INPUT_CLASS} disabled={locked} value={partner.logoAssetId ?? ""} onChange={event => update(content => { content.partners[index].logoAssetId = event.target.value || null; })}>
                  <option value="">No logo</option>
                  {logos.map(logo => <option key={logo.id} value={logo.id}>{logo.label}</option>)}
                </select></label>
              <label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Logo colour on the white page</span>
                <select className={ADMIN_INPUT_CLASS} disabled={locked} value={partner.tone} onChange={event => update(content => { content.partners[index].tone = event.target.value as PartnerLogoTone; })}>
                  {Object.entries(TONES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
              <div className={`${kit.toolbar} md:col-span-2`}>
                <EditorActionButton disabled={locked} onClick={() => { uploadTarget.current = partner.id; fileInput.current?.click(); }}><IconUpload size={16} aria-hidden="true" />{uploading === partner.id ? "Uploading…" : "Upload new logo"}</EditorActionButton>
                <span className={kit.spacer} />
                <EditorIconButton label={`Move ${name} up`} disabled={locked || index === 0} onClick={() => update(content => movePartner(content, index, -1))}><ChevronUp width="16" height="16" /></EditorIconButton>
                <EditorIconButton label={`Move ${name} down`} disabled={locked || index === draft.partners.length - 1} onClick={() => update(content => movePartner(content, index, 1))}><ChevronDown width="16" height="16" /></EditorIconButton>
                <EditorRemoveButton label={`Remove ${name}`} disabled={locked} onClick={() => update(content => removePartner(content, index))} />
              </div>
            </div>
          </li>;
        })}</ol>
        <div className="mt-4"><EditorActionButton disabled={locked || draft.partners.length >= MAX_PARTNERS} onClick={() => update(content => addPartner(content))}>Add partner</EditorActionButton></div>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => {
          const file = event.target.files?.[0]; const target = uploadTarget.current;
          event.target.value = "";
          if (file && target) void upload(target, file);
        }} />
      </EditorSection>
      <EditorPreview phone={phone} onPhoneChange={setPhone}
        controls={<EditorSegmented label="Page to preview" value={previewPage} onChange={setPreviewPage} options={[{ value: "partners", label: PAGE_LABELS.partners }, { value: "opportunities", label: PAGE_LABELS.opportunities }]} />}>
        <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={PAGE_LABELS[previewPage]}><CinematicShell contentOnly initialContent={shared}><CinematicPartners page={previewPage} content={draft} logoUrls={logoUrls} /></CinematicShell></HomepagePreviewFrame>
      </EditorPreview>
      <EditorSaveBar state={editorSaveState({ busy, canSave: !busy && !uploading && (dirty || !!pending), saved })} retry={!!pending} onSave={() => void save()}
        status={pending ? "Awaiting save confirmation" : uploading ? "Uploading logo…" : dirty ? "Unsaved changes" : ""}>
        <EditorSecondaryButton disabled={locked} onClick={() => void reload()}>Reload saved pages</EditorSecondaryButton>
      </EditorSaveBar>
    </>}
    <AdminConfirmDialog open={confirmReload} title="Discard your Partners edits?" confirmLabel="Discard and reload" destructive onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(true); }}>Your unsaved Partners edits will be discarded and the saved pages loaded.</AdminConfirmDialog>
  </AdminPage>;
}
