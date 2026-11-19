"use client";

import Link from "next/link";
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { ShimmerRegion, Shimmer } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { EditorNotice, EditorSecondaryButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import {
  EditorDialog, PageFrame, PageFrameSkeleton, PreviewCards, PreviewCardsSkeleton, ValidationMessage, useEditorDialog,
} from "@/components/admin/ui/editor-kit";
import { ItemPreviewCards, ItemPreviewCardsSkeleton, type ItemCardItem } from "@/components/admin/list-cards/ItemPreviewCards";
import { useMoveFocus } from "@/components/admin/list-cards/useMoveFocus";
import styles from "@/components/admin/list-cards/ListEditor.module.css";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { SettledPreview } from "@/components/admin/stadium/SettledPreview";
import { partnerPageState } from "@/components/admin/stadium/partner-page-state";
import CinematicPartners from "@/components/cinematic/CinematicPartners";
import CinematicShell from "@/components/cinematic/CinematicShell";
import { createClient } from "@/lib/admin-client";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import {
  MAX_PARTNERS, cinematicPartnersContentSchema, cinematicPartnersDraftSchema, cinematicPartnersSaveSchema, starterCinematicPartnersContent,
  type CinematicPartner, type CinematicPartnersContent, type CinematicPartnersSave, type CinematicPartnersSnapshot, type PartnerLogoMedia, type PartnerPage,
} from "@/lib/cinematic-partners-content";
import { addPartner, loadCinematicPartnersEditor, movePartner, removePartner, saveCinematicPartnersEditor, unusedUploads } from "@/lib/cinematic-partners-editor";
import "@/components/admin/homepage/homepage-editor.css";
import { DISCARD_CONFIRM } from "../editor-copy";
import { PartnersDialogFields, type PartnersFieldsApi } from "./PartnerFields";
import {
  PAGE_LABELS, changedPages, changedPartnerIds, logoUrl, mergeLogos, pageDialogId, pageSample, pageWithPartner, parseDialogId,
  partnerDialogId, partnerName, partnersDirty, partnersSaveRequest, savedContent, singlePartnerContent, type PartnersDialogId,
} from "./partners-sections";
import card from "./PartnerCardPreview.module.css";

const logoSchema = z.object({ id: z.uuid(), storage_path: z.string(), width: z.number(), height: z.number(), label: z.string() });
const recoverySchema = z.object({
  content: cinematicPartnersDraftSchema,
  pending: cinematicPartnersSaveSchema.nullable(),
  uploads: z.array(z.uuid()),
  logos: z.array(logoSchema),
});
const PAGE = "Partners";
const CRUMBS = [{ label: "Website", href: "/admin/website-pages" as const }, { label: "Partners" }];
const DESCRIPTION = "Edit the Club Partners and Partnership Opportunities pages. Both pages show the same partner list. Save applies all changes together.";
const PAGES: readonly PartnerPage[] = ["partners", "opportunities"];
const REFUSED = "Review the fields. Each partner needs a name, each page a heading, and the button link must be an HTTPS URL, email or site page.";

async function retireUploads(ids: string[]) {
  await Promise.all(ids.map(assetId => fetch("/api/admin/media/cleanup", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }),
  }).catch(() => undefined)));
}

type PageLiveProps = { page: PartnerPage; content: CinematicPartnersContent; logoUrls: Record<string, string>; shared: CinematicHomepageContent | null; slice: string };
/** The real public page, fed the draft (its first partners only, to stay light). Re-renders only when its own slice changes. */
const PageLive = memo(function PageLive({ page, content, logoUrls, shared }: PageLiveProps) {
  const sample = useMemo(() => pageSample(content), [content]);
  const urls = useMemo(() => sample.partners.flatMap(partner => (partner.logoAssetId && logoUrls[partner.logoAssetId] ? [logoUrls[partner.logoAssetId]] : [])), [sample, logoUrls]);
  return <SettledPreview urls={urls}><CinematicShell contentOnly initialContent={shared}><CinematicPartners page={page} content={sample} logoUrls={logoUrls} /></CinematicShell></SettledPreview>;
}, (a, b) => a.page === b.page && a.slice === b.slice && a.shared === b.shared);

type PartnerLiveProps = { content: CinematicPartnersContent; partner: CinematicPartner; logoUrls: Record<string, string>; shared: CinematicHomepageContent | null; slice: string };
/** One partner drawn by the real public card. */
const PartnerLive = memo(function PartnerLive({ content, partner, logoUrls, shared }: PartnerLiveProps) {
  const single = useMemo(() => singlePartnerContent(content, partner), [content, partner]);
  const url = partner.logoAssetId ? logoUrls[partner.logoAssetId] : undefined;
  return <SettledPreview urls={url ? [url] : []}><CinematicShell contentOnly initialContent={shared}><CinematicPartners page="partners" content={single} logoUrls={logoUrls} /></CinematicShell></SettledPreview>;
}, (a, b) => a.partner.id === b.partner.id && a.slice === b.slice && a.shared === b.shared);

const pageSlice = (content: CinematicPartnersContent, page: PartnerPage, logoUrls: Record<string, string>) => {
  const sample = pageSample(content);
  return JSON.stringify([content.pages[page], sample.partners, sample.partners.map(partner => (partner.logoAssetId ? logoUrls[partner.logoAssetId] : ""))]);
};
const partnerSlice = (partner: CinematicPartner, logoUrls: Record<string, string>) => JSON.stringify([partner, partner.logoAssetId ? logoUrls[partner.logoAssetId] : ""]);

export default function CinematicPartnersEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<CinematicPartnersSnapshot | null>(null), [draft, setDraft] = useState<CinematicPartnersContent | null>(null);
  const [pending, setPending] = useState<CinematicPartnersSave | null>(null), [logos, setLogos] = useState<PartnerLogoMedia[]>([]), [uploads, setUploads] = useState<string[]>([]);
  const [uploading, setUploading] = useState<string | null>(null), [shared, setShared] = useState<CinematicHomepageContent | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false), [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false), [saveFailed, setSaveFailed] = useState(false), [validation, setValidation] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedClubId, setLoadedClubId] = useState<string | null>(null), [confirmReload, setConfirmReload] = useState(false);
  const recoveryKey = useRef<string | null>(null), epoch = useRef(0), keepRef = useRef<HTMLButtonElement>(null), addRef = useRef<HTMLButtonElement>(null);
  const dialog = useEditorDialog<PartnersDialogId>();
  const rememberMove = useMoveFocus(draft);
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const saved = savedContent(snapshot);
  const dirty = !!draft && !!snapshot && partnersDirty(draft, saved);
  const locked = busy || !!pending || !!uploading;
  const unsaved = dirty || !!pending || uploads.length > 0;

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setLogos([]); setUploads([]); setMessage(""); setFailed(false); setStatus("");
    setConflict(false); setSaveFailed(false); setValidation(""); setErrors({}); setBusy(false); setUploading(null); setShared(null);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadCinematicPartnersEditor(), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id)]).then(([loaded, user, homepage]) => {
      if (!active) return;
      if (!user.data.user) throw new Error("Sign in again to edit Partners.");
      const key = `onzio:cinematic-partners:v1:${location.origin}:${user.data.user.id}:${club.id}`;
      recoveryKey.current = key;
      let stored: z.infer<typeof recoverySchema> | null = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = recoverySchema.safeParse(JSON.parse(raw));
          if (parsed.success) stored = parsed.data;
          else localStorage.removeItem(key);
        }
      } catch {}
      setSnapshot(loaded);
      setDraft(stored?.content ?? loaded.content ?? starterCinematicPartnersContent());
      setPending(stored?.pending ?? null);
      setUploads(stored?.uploads ?? []);
      setLogos(mergeLogos(loaded.logos, stored?.logos ?? []));
      setShared(homepage); setLoadedClubId(club.id);
      if (stored) setMessage(stored.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved Partners draft has been restored.");
    }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load Partners."); setFailed(true); } });
    return () => { active = false; epoch.current += 1; };
  }, [club.id, club.presentationTemplateKey]);

  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current) return;
    try {
      if (dirty || pending || uploads.length) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending, uploads, logos }));
      else localStorage.removeItem(recoveryKey.current);
    } catch { /* The in-memory draft remains usable when browser storage is full. */ }
  }, [draft, snapshot, dirty, pending, uploads, logos]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  const settle = () => { setMessage(""); setFailed(false); setValidation(""); setErrors({}); setSaveFailed(false); };
  const update = (change: (value: CinematicPartnersContent) => CinematicPartnersContent | void) => {
    if (locked) return;
    setDraft(current => { if (!current) return current; const next = structuredClone(current); return change(next) ?? next; });
    settle();
  };
  const logoUrls = useMemo(() => Object.fromEntries(logos.map(logo => [logo.id, logoUrl(logo)])), [logos]);

  /** Resolves true only when the server committed the save, so the Save button can show Saved. */
  async function save(): Promise<boolean> {
    if (!draft || !snapshot || busy || uploading) return false;
    const parsed = partnersSaveRequest({ pending, operationId: () => crypto.randomUUID(), snapshot, draft });
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of cinematicPartnersContentSchema.safeParse(draft).error?.issues ?? []) found[issue.path.join(".")] ??= issue.message;
      setErrors(found); setSaveFailed(true); setValidation(REFUSED);
      return false;
    }
    const request = parsed.data, generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setSaveFailed(false); setValidation(""); setErrors({}); setMessage(""); setStatus("Saving Partners…");
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending: request, uploads, logos })); } catch {}
    const result = await saveCinematicPartnersEditor(request);
    if (generation !== epoch.current) return false;
    setBusy(false);
    if (result.status === "committed") {
      const next = savedContent(result.snapshot);
      await retireUploads(unusedUploads(uploads, next));
      setSnapshot(result.snapshot); setDraft(next); setPending(null); setUploads([]); setConflict(false);
      setLogos(mergeLogos(result.snapshot.logos));
      setMessage(""); setStatus("Partners saved."); clearRecovery();
      return true;
    } else if (result.status === "uncertain") { setPending(result.request); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setSaveFailed(result.status !== "conflict"); setConflict(result.status === "conflict"); setMessage(result.message); }
    return false;
  }

  /** Discard asks first when there are unsaved edits. */
  function requestDiscard() {
    if (busy || uploading) return;
    if (pending) { setFailed(true); setMessage("Retry the same save before discarding your edits, so nothing is lost."); return; }
    if (dirty || uploads.length) setConfirmReload(true);
    else void reload();
  }
  async function reload(keepDraft = false) {
    if (locked) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const loaded = await loadCinematicPartnersEditor();
      cinematicPartnersDraftSchema.parse(savedContent(loaded));
      if (generation !== epoch.current) return;
      if (keepDraft && draft) {
        // The latest revision becomes the base and the edits stay. Logos added in this session stay available.
        const inUse = new Set(draft.partners.map(partner => partner.logoAssetId));
        setLogos(mergeLogos(loaded.logos, logos.filter(logo => uploads.includes(logo.id) || inUse.has(logo.id))));
        setSnapshot(loaded);
        setMessage("Latest saved version loaded. Your edits were kept. Choose another logo for any partner whose logo was removed in the newer version.");
      } else {
        await retireUploads(unusedUploads(uploads, savedContent(loaded)));
        if (generation !== epoch.current) return;
        setSnapshot(loaded); setDraft(savedContent(loaded)); setLogos(loaded.logos); setUploads([]); setMessage(""); clearRecovery();
      }
      setConflict(false); setFailed(false); setSaveFailed(false); setValidation(""); setErrors({});
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to reload Partners."); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }

  async function upload(partnerId: string, file: File) {
    if (!draft || locked) return;
    const generation = epoch.current;
    setUploading(partnerId); setFailed(false); setStatus("Adding the logo…");
    try {
      const result = await createClient().storage.from("sponsors").upload(`partners/${crypto.randomUUID()}`, file);
      if (result.error || !result.data?.assetId) throw new Error(result.error?.message ?? "Logo upload failed.");
      const bitmap = await createImageBitmap(file), dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (generation !== epoch.current) return;
      const logo: PartnerLogoMedia = { id: result.data.assetId, storage_path: result.data.path, ...dimensions, label: file.name.replace(/\.[^.]+$/, "") };
      setLogos(current => mergeLogos([logo], current));
      setUploads(current => [...current, logo.id]);
      // Upload locks manual editing. Apply its one confirmed identity directly.
      setDraft(current => {
        if (!current) return current;
        const next = structuredClone(current), row = next.partners.find(partner => partner.id === partnerId);
        if (row) row.logoAssetId = logo.id;
        return next;
      });
      setStatus("Logo added. Save to publish it.");
    } catch (error) {
      if (generation === epoch.current) { setMessage(error instanceof Error ? error.message : "Logo upload failed."); setFailed(true); }
    } finally { if (generation === epoch.current) setUploading(null); }
  }

  const move = (index: number, delta: -1 | 1, inDialog: boolean) => {
    if (!draft || locked) return;
    const partner = draft.partners[index];
    if (!partner || index + delta < 0 || index + delta >= draft.partners.length) return;
    rememberMove(partner.id, delta, inDialog);
    update(content => movePartner(content, index, delta));
    setStatus(`${partnerName(partner, index)} is now number ${index + delta + 1}.`);
  };
  const remove = (index: number) => {
    if (!draft || locked) return;
    const partner = draft.partners[index];
    if (!partner) return;
    update(content => removePartner(content, index));
    dialog.close();
    setStatus(`${partnerName(partner, index)} removed. Save to publish.`);
    setTimeout(() => addRef.current?.focus(), 0);
  };
  const addNew = (event: MouseEvent<HTMLButtonElement>) => {
    if (!draft || locked || draft.partners.length >= MAX_PARTNERS) return;
    const next = addPartner(draft);
    const added = next.partners[next.partners.length - 1];
    setDraft(next); settle();
    dialog.openSection(partnerDialogId(added.id), event);
  };

  const saveAction = useSaveState({
    isDirty: unsaved,
    onSave: async () => { if (!(await save())) throw new Error("Partners was not saved."); },
  });
  const latestSave = useRef(save);
  latestSave.current = save;
  useUnsavedGuard(draft ? {
    dirty: unsaved, edited: PAGE, onSave: () => latestSave.current(),
    onDiscard: () => {
      if (busy || uploading || pending) throw new Error("A save is still being confirmed.");
      if (!snapshot) return;
      void retireUploads(unusedUploads(uploads, saved));
      setDraft(saved); setUploads([]); setMessage(""); setFailed(false); setConflict(false); setSaveFailed(false); setValidation(""); setErrors({}); clearRecovery();
    },
  } : undefined);

  const deferred = useDeferredValue(draft);
  const pageState = partnerPageState({ base: saveAction.state, busy, uploading: !!uploading, pending: !!pending, conflict, saveFailed });
  const changedPageSet = useMemo(() => new Set(draft && snapshot ? changedPages(draft, saved) : []), [draft, snapshot, saved]);
  const changedPartners = useMemo(() => (draft && snapshot ? changedPartnerIds(draft, saved) : new Set<string>()), [draft, snapshot, saved]);
  const loading = !draft || !snapshot || loadedClubId !== club.id;

  if (club.presentationTemplateKey !== "cinematic@2") return <PageFrame title={PAGE} breadcrumb={CRUMBS} description="This page is unavailable for the current website design. Sponsor logos are managed in Sponsors.">{null}</PageFrame>;

  const pageItems = draft ? PAGES.map(page => ({ id: pageDialogId(page), title: `${PAGE_LABELS[page]} page`, changed: changedPageSet.has(page), disabled: locked })) : [];
  const partnerItems: ItemCardItem[] = draft ? draft.partners.map((partner, index) => ({
    id: partnerDialogId(partner.id), label: partnerName(partner, index), changed: changedPartners.has(partner.id),
    flags: !partner.name.trim() ? [{ text: "Name needed", tone: "needed" as const }] : !partner.logoAssetId ? [{ text: "No logo", tone: "note" as const }] : [],
  })) : [];
  const api: PartnersFieldsApi | null = draft ? {
    draft, locked, uploading, logos, logoUrls, errors, update,
    upload: (id, file) => { void upload(id, file); }, move: (index, delta) => move(index, delta, true), remove,
  } : null;
  const pageOf = (id: string) => { const target = parseDialogId(id); return target?.kind === "page" ? target.page : null; };
  const previewOf = (id: string) => {
    const page = pageOf(id);
    return deferred && page ? <PageLive page={page} content={deferred} logoUrls={logoUrls} shared={shared} slice={pageSlice(deferred, page, logoUrls)} /> : null;
  };
  const partnerPreviewOf = (id: string) => {
    const target = parseDialogId(id);
    const partner = deferred && target?.kind === "partner" ? deferred.partners.find(row => row.id === target.id) : undefined;
    return deferred && partner ? <PartnerLive content={deferred} partner={partner} logoUrls={logoUrls} shared={shared} slice={partnerSlice(partner, logoUrls)} /> : null;
  };
  const dialogSections = draft ? [
    ...PAGES.map(page => ({ id: pageDialogId(page), title: `${PAGE_LABELS[page]} page`, summary: draft.pages[page].title.trim() || "Heading needed" })),
    ...draft.partners.map((partner, index) => ({ id: partnerDialogId(partner.id), title: partnerName(partner, index), summary: partner.role.trim() || "No role" })),
  ] : [];

  const notice = (message || validation || conflict) ? <div className={styles.notice} data-partners-notice="">
    {validation && <ValidationMessage live="assertive">{validation}</ValidationMessage>}
    {(message || conflict) && <EditorNotice failed={failed || conflict}>{message}
      {conflict && <span className={styles.noticeActions}>
        <button ref={keepRef} type="button" className={`admin-press ${styles.keep}`} disabled={locked} onClick={() => void reload(true)}>Load latest and keep my edits</button>
        <EditorSecondaryButton disabled={locked} onClick={requestDiscard}>Reload saved page</EditorSecondaryButton>
      </span>}
    </EditorNotice>}
  </div> : null;

  if (!draft && failed) return <PageFrame title={PAGE} breadcrumb={CRUMBS} description={DESCRIPTION}>
    <EditorNotice failed>{message}</EditorNotice>
    <div><EditorSecondaryButton disabled={false} onClick={() => location.reload()}>Try again</EditorSecondaryButton></div>
  </PageFrame>;

  return <>
    <ShimmerRegion loading={loading} loadingLabel="Loading Partners…" minHeight={520}
      skeleton={<div><PageFrameSkeleton cardCount={0} description /><PreviewCardsSkeleton count={2} />
        <div className={card.skeletonHead}><Shimmer className={card.skeletonTitle} /></div><ItemPreviewCardsSkeleton count={6} /></div>}>
      <PageFrame title={PAGE} breadcrumb={CRUMBS} openPageHref="/sponsors" description={DESCRIPTION} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()} onDiscard={requestDiscard} notice={notice}>
        <PreviewCards sections={pageItems} label="Partner pages" renderPreview={previewOf} previewScale={0.46}
          onEdit={(id, event) => dialog.openSection(id as PartnersDialogId, event)} />
        {draft && <section className={styles.listSection} aria-labelledby="partners-list-heading">
          <div className={styles.listHead}>
            <h2 id="partners-list-heading">Partners</h2>
            <span className={styles.count}>{draft.partners.length} of {MAX_PARTNERS}</span>
          </div>
          <p className={styles.note}>Each card is a partner as it appears on both pages, in this order. Open one to edit it beside a live preview. Choose a logo already used in <Link href="/admin/sponsors">Sponsors</Link>, or upload a new one (PNG, JPEG or WebP).</p>
          {draft.partners.length === 0 && <p className={styles.empty}>No partners yet. The pages hide the partner grid until one is added.</p>}
          <ItemPreviewCards items={partnerItems} noun="partner" label="Partners" disabled={locked} previewClassName={card.single}
            renderPreview={id => partnerPreviewOf(id)}
            onEdit={(id, event) => dialog.openSection(id as PartnersDialogId, event)}
            onMove={(id, delta) => { const index = draft.partners.findIndex(partner => partnerDialogId(partner.id) === id); if (index >= 0) move(index, delta, false); }}
            add={{ label: draft.partners.length >= MAX_PARTNERS ? "List is full" : "Add partner", count: `${draft.partners.length} of ${MAX_PARTNERS}`, disabled: draft.partners.length >= MAX_PARTNERS, onAdd: addNew }}
            addRef={addRef} />
        </section>}
      </PageFrame>
    </ShimmerRegion>
    <p className={styles.srOnly} role="status" data-partners-status="">{status}</p>
    {api && <EditorDialog open={dialog.open} onClose={dialog.close} title="Edit Partners" mode="split" returnFocusRef={dialog.returnFocusRef}
      sections={dialogSections} activeId={dialog.activeId} onActiveChange={id => dialog.switchTo(id as PartnersDialogId)}
      renderSection={id => dialog.open ? <PartnersDialogFields api={api} id={id as PartnersDialogId} /> : null}
      previewHint="How this looks on the page"
      renderPreview={id => {
        if (!dialog.open) return null;
        const target = parseDialogId(id);
        if (!target) return null;
        const content = target.kind === "page" ? api.draft : (() => { const partner = api.draft.partners.find(row => row.id === target.id); return partner ? pageWithPartner(api.draft, partner) : api.draft; })();
        const page: PartnerPage = target.kind === "page" ? target.page : "partners";
        return <div className={styles.livePreview}>
          <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={target.kind === "page" ? `${PAGE_LABELS[page]} page` : "Partner on the page"}>
            <CinematicShell contentOnly initialContent={shared}><CinematicPartners page={page} content={content} logoUrls={logoUrls} /></CinematicShell>
          </HomepagePreviewFrame></div>;
      }} />}
    <AdminConfirmDialog open={confirmReload} title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel} destructive
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
      Discard unsaved Partners edits and load the saved pages?
    </AdminConfirmDialog>
  </>;
}
