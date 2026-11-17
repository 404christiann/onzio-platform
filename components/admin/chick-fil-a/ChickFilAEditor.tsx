"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { EditorGroup, EditorImage, EditorLoading, EditorNotice, EditorPageLink, EditorPreview, EditorSaveBar, EditorSecondaryButton, EditorSection, EditorSwitch, editorSaveState, kit, useSavedFlash } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { createClient } from "@/lib/admin-client";
import { loadVisitorPageEditor, saveVisitorPageEditor, type VisitorPageSaveRequest } from "@/lib/visitor-page-editor";
import { CHICK_FIL_A_ARTWORK_SLOTS, CHICK_FIL_A_SECTIONS, chickFilAContentSchema, chickFilARecoverySchema, chickFilADraftFingerprint, chickFilASaveSchema, emptyChickFilAContent, hydrateChickFilAContent, type ChickFilAArtworkSlot, type ChickFilAContent, type ChickFilASection, type ChickFilASnapshot } from "@/lib/chick-fil-a-content";
import { loadTicketsEditor } from "@/lib/tickets-editor";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import type { TicketsContent } from "@/lib/tickets-content";
import CinematicShell from "@/components/cinematic/CinematicShell";
import CinematicChickFilA from "@/components/cinematic/CinematicChickFilA";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import "@/components/admin/homepage/homepage-editor.css";

const ART_LABELS: Record<ChickFilAArtworkSlot, string> = { mealPass: "Meal pass", driveThru: "Drive-thru illustration", freeTicket: "Free ticket illustration", enjoyGame: "Meal illustration", map: "Route map", restaurant: "Restaurant photo", partner: "Match card partner", background: "Seat background" };
const SECTION_LABELS: Record<ChickFilASection, string> = { heading: "Page heading", details: "Meal pass and details", steps: "Three steps", map: "Route map", match: "Next home match", restaurant: "Restaurant photo" };
const blankPurchase = { purchaseUrl: "", missingPurchaseLabel: "Ticket link coming soon" };

export default function ChickFilAEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<ChickFilASnapshot | null>(null), [draft, setDraft] = useState<ChickFilAContent | null>(null);
  const [media, setMedia] = useState<ChickFilASnapshot["media"]>([]), [retired, setRetired] = useState<string[]>([]);
  const [pending, setPending] = useState<VisitorPageSaveRequest<ChickFilAContent> | null>(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<ChickFilAArtworkSlot | null>(null), [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState(""), [failed, setFailed] = useState(false), [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [purchase, setPurchase] = useState<Pick<TicketsContent, "purchaseUrl" | "missingPurchaseLabel">>(blankPurchase);
  const [previewPhone, setPreviewPhone] = useState(true);
  const [confirmReload, setConfirmReload] = useState(false), [saved, setSaved] = useSavedFlash();
  const recoveryKey = useRef<string | null>(null), generation = useRef(0), currentClubId = useRef(club.id);
  currentClubId.current = club.id;
  const dirty = !!draft && !!snapshot && chickFilADraftFingerprint(draft) !== chickFilADraftFingerprint(snapshot.content ?? emptyChickFilAContent());
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch { /* Current in-memory draft remains available. */ } };
  useEffect(() => {
    const epoch = ++generation.current;
    let active = true;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setMedia([]); setRetired([]); setMessage(""); setFailed(false); setConflict(false); setBusy(false); setUploading(null); setShared(null); setPurchase(blankPurchase);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadVisitorPageEditor<ChickFilAContent>("chick-fil-a"), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id), loadTicketsEditor()])
      .then(([loaded, user, homepage, tickets]) => {
        if (!active || generation.current !== epoch) return;
        if (!user.data.user) throw new Error("Sign in again to edit Chick-fil-A.");
        const savedContent = chickFilAContentSchema.parse(loaded.content ?? emptyChickFilAContent());
        const key = `onzio:chick-fil-a:v1:${location.origin}:${user.data.user.id}:${club.id}`;
        recoveryKey.current = key;
        setShared(homepage); setPurchase(tickets.content ? { purchaseUrl: tickets.content.purchaseUrl, missingPurchaseLabel: tickets.content.missingPurchaseLabel } : blankPurchase);
        let restored: ReturnType<typeof chickFilARecoverySchema.parse> | null = null;
        try {
          const raw = localStorage.getItem(key);
          if (raw) { const parsed = chickFilARecoverySchema.safeParse(JSON.parse(raw)); if (parsed.success) restored = parsed.data; else localStorage.removeItem(key); }
        } catch { /* Broken or unavailable browser storage cannot block saved content. */ }
        setSnapshot(restored ? { ...loaded, revision: restored.revision, designRevision: restored.designRevision } : loaded);
        setDraft(restored?.content ?? savedContent); setMedia(restored?.media ?? loaded.media); setRetired(restored?.retired ?? []); setPending(restored?.pending ?? null); setLoadedClubId(club.id);
        if (restored) setMessage(restored.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved Chick-fil-A draft has been restored.");
      }).catch(error => { if (active && generation.current === epoch) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to load Chick-fil-A."); } });
    return () => { active = false; };
  }, [club.id, club.presentationTemplateKey]);
  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current || loadedClubId !== club.id) return;
    try { if (dirty || pending || retired.length) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending, media, retired })); else localStorage.removeItem(recoveryKey.current); }
    catch { /* Keep the draft in memory if browser storage is unavailable. */ }
  }, [draft, snapshot, dirty, pending, media, retired, loadedClubId, club.id]);
  useEffect(() => { if (!dirty && !pending) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, pending]);
  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader title="Chick-fil-A" description="This page is unavailable for the current website design." /></AdminPage>;
  const locked = busy || !!pending || !!uploading;
  const owns = (epoch: number, clubId: string) => generation.current === epoch && currentClubId.current === clubId;
  const update = (edit: (content: ChickFilAContent) => void) => { setDraft(current => { if (!current) return current; const copy = structuredClone(current); edit(copy); return copy; }); setMessage(""); setFailed(false); setSaved(false); };
  async function save() {
    if (!draft || !snapshot || uploading || busy || loadedClubId !== club.id) return;
    const epoch = generation.current, clubId = club.id;
    const parsed = chickFilASaveSchema.safeParse(pending ?? { operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: [...new Set(retired)] });
    if (!parsed.success) { setFailed(true); setMessage("Review the page fields before saving."); return; }
    const request = parsed.data;
    setPending(request); setBusy(true); setFailed(false); setMessage("Saving Chick-fil-A…");
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, retired })); } catch { }
    try {
      const outcome = await saveVisitorPageEditor("chick-fil-a", request);
      if (!owns(epoch, clubId)) return;
      if (outcome.status === "committed") {
        setSnapshot(outcome.snapshot); setDraft(outcome.snapshot.content ?? emptyChickFilAContent()); setMedia(outcome.snapshot.media); setRetired([]); setPending(null); setConflict(false); clearRecovery();
        setMessage(outcome.snapshot.cleanupPending ? "Chick-fil-A saved. Image cleanup will retry automatically." : "Chick-fil-A saved."); setSaved(true);
      } else if (outcome.status === "uncertain") { setPending(outcome.request); setFailed(true); setMessage(outcome.message); }
      else { setPending(null); setFailed(true); setConflict(outcome.status === "conflict"); setMessage(outcome.message); }
    } catch { if (owns(epoch, clubId)) { setFailed(true); setMessage("Save could not be confirmed. Retry the same save. Your draft is locked until then."); } }
    finally { if (owns(epoch, clubId)) setBusy(false); }
  }
  async function reload(keepDraft = false, confirmed = false) {
    if (locked || loadedClubId !== club.id) return;
    if (!keepDraft && dirty && !confirmed) { setConfirmReload(true); return; }
    const epoch = generation.current, clubId = club.id;
    setBusy(true);
    try {
      const loaded = await loadVisitorPageEditor<ChickFilAContent>("chick-fil-a");
      chickFilAContentSchema.parse(loaded.content ?? emptyChickFilAContent());
      if (!owns(epoch, clubId)) return;
      if (keepDraft) {
        const previous = new Set(snapshot?.media.map(image => image.id));
        setMedia([...loaded.media, ...media.filter(image => !previous.has(image.id) && !loaded.media.some(saved => saved.id === image.id))]);
        setMessage("Latest saved version loaded. Your edits were kept. Replace any images removed in the newer version before saving.");
      } else { setDraft(loaded.content ?? emptyChickFilAContent()); setMedia(loaded.media); setRetired([]); setMessage(""); clearRecovery(); }
      setSnapshot(loaded); setConflict(false); setFailed(false);
    } catch (error) { if (owns(epoch, clubId)) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to reload Chick-fil-A."); } }
    finally { if (owns(epoch, clubId)) setBusy(false); }
  }
  async function upload(slot: ChickFilAArtworkSlot, file: File) {
    if (!draft || locked || loadedClubId !== club.id) return;
    const epoch = generation.current, clubId = club.id;
    setUploading(slot); setFailed(false); setMessage("Adding your image…");
    try {
      const bitmap = await createImageBitmap(file), dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close();
      const result = await createClient().storage.from(slot === "restaurant" ? "homepage" : "homepage-artwork").upload("chick-fil-a/" + crypto.randomUUID(), file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Image upload failed.");
      if (!owns(epoch, clubId)) return;
      const oldId = draft.artwork[slot].assetId;
      if (oldId && media.some(image => image.id === oldId) && !snapshot?.media.some(image => image.id === oldId)) setRetired(current => [...new Set([...current, oldId])]);
      setMedia(current => [...current, { id: result.data.assetId, storage_bucket: "onzio-media", storage_path: result.data.path, ...dimensions }]);
      update(content => { content.artwork[slot].assetId = result.data.assetId; }); setMessage("Image ready. Save Chick-fil-A to use it.");
    } catch (error) { if (owns(epoch, clubId)) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to add this image. Choose it again to retry."); } }
    finally { if (owns(epoch, clubId)) setUploading(null); }
  }
  const field = (label: string, key: "title" | "subtitle" | "detailsHeading" | "detailsBody") => <label className="block min-w-0" key={key}><span className={ADMIN_LABEL_CLASS}>{label}</span>{key === "detailsBody" ? <textarea className={ADMIN_INPUT_CLASS + " min-h-36"} disabled={locked} value={draft?.[key] ?? ""} maxLength={4000} onChange={event => update(content => { content[key] = event.target.value; })} /> : <input className={ADMIN_INPUT_CLASS} disabled={locked} value={draft?.[key] ?? ""} maxLength={120} onChange={event => update(content => { content[key] = event.target.value; })} />}</label>;
  const page = draft ? hydrateChickFilAContent(draft, media, false) : null;
  const canSave = !busy && !uploading && (dirty || !!pending || retired.length > 0);
  return <AdminPage className={kit.page}>
    <AdminPageHeader eyebrow="Public website" title="Chick-fil-A" description="Edit the meal pass, details, three steps and images. Save applies all changes together." actions={<EditorPageLink href="/stadium/chick-fil-a">Open Chick-fil-A page</EditorPageLink>} />
    <p className={kit.notice}>The purchase link and unavailable message are shared with <Link className={kit.inlineLink} href="/admin/tickets">Tickets</Link>. Match heading, announcement and button text come from <Link className={kit.inlineLink} href="/admin/homepage">Homepage</Link>. Fixtures come from <Link className={kit.inlineLink} href="/admin/schedule">Schedule</Link>.</p>
    {message && <EditorNotice failed={failed}>{message}</EditorNotice>}
    {!draft || loadedClubId !== club.id ? <EditorLoading label="Loading Chick-fil-A…" failed={failed} onRetry={() => location.reload()} /> : <>
      <EditorSection title="Page and details"><div className="grid gap-5 md:grid-cols-2">{field("Page heading", "title")}{field("Subtitle", "subtitle")}{field("Details heading", "detailsHeading")}{field("Details copy", "detailsBody")}</div></EditorSection>
      <EditorSection title="Three steps"><div className="grid gap-4 md:grid-cols-3">{draft.stepLabels.map((label, index) => <EditorGroup legend={`Step ${index + 1}`} key={index}><label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Label</span><input className={ADMIN_INPUT_CLASS} disabled={locked} maxLength={120} value={label} onChange={event => update(content => { content.stepLabels[index] = event.target.value; })} /></label><label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Number</span><input className={ADMIN_INPUT_CLASS} disabled={locked} maxLength={12} value={draft.stepNumbers[index]} onChange={event => update(content => { content.stepNumbers[index] = event.target.value; })} /></label></EditorGroup>)}</div></EditorSection>
      <EditorSection title="Visible sections"><div className={kit.switchGrid} data-columns="2">{CHICK_FIL_A_SECTIONS.map(section => <EditorSwitch key={section} label={`Show ${SECTION_LABELS[section].toLowerCase()}`} disabled={locked} checked={draft.sections[section]} onChange={checked => update(content => { content.sections[section] = checked; })} />)}</div></EditorSection>
      <EditorSection title="Images" description="Words inside artwork change when you replace its image. Step labels and numbers are editable above."><div className="grid gap-4 md:grid-cols-2">{CHICK_FIL_A_ARTWORK_SLOTS.map(slot => <EditorGroup legend={ART_LABELS[slot]} key={slot}>
        <EditorImage label={ART_LABELS[slot]} url={page?.artwork[slot].url} alt={draft.artwork[slot].alt} accept={slot === "restaurant" ? "image/jpeg,image/png,image/webp" : "image/png,image/webp"} empty="No image yet." hint={slot === "restaurant" ? "JPG, PNG or WebP, up to 15 MB and 6000 pixels per side." : "PNG or WebP, up to 5 MB and 3000 pixels per side."} uploading={uploading === slot} disabled={locked} hasImage={!!page?.artwork[slot].url} onFile={file => void upload(slot, file)}
          onRemove={draft.artwork[slot].assetId ? () => { const id = draft.artwork[slot].assetId; if (id) setRetired(current => [...new Set([...current, id])]); update(content => { content.artwork[slot].assetId = null; }); } : undefined} />
        <label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Image description</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.artwork[slot].alt} maxLength={1000} onChange={event => update(content => { content.artwork[slot].alt = event.target.value; })} /></label>
      </EditorGroup>)}</div></EditorSection>
      <EditorPreview phone={previewPhone} onPhoneChange={setPreviewPhone}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="Chick-fil-A"><CinematicShell contentOnly initialContent={shared}><CinematicChickFilA content={page!} purchase={purchase} /></CinematicShell></HomepagePreviewFrame></EditorPreview>
      <EditorSaveBar state={editorSaveState({ busy, canSave, saved })} retry={!!pending} onSave={() => void save()} status={pending ? "Awaiting save confirmation" : dirty ? "Unsaved changes" : ""}>
        <EditorSecondaryButton disabled={locked} onClick={() => void reload()}>Reload saved page</EditorSecondaryButton>
        {conflict && <EditorSecondaryButton disabled={locked} onClick={() => void reload(true)}>Load latest and keep my edits</EditorSecondaryButton>}
      </EditorSaveBar>
    </>}
    <AdminConfirmDialog open={confirmReload} title="Discard your Chick-fil-A edits?" confirmLabel="Discard and reload" destructive onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(false, true); }}>Your unsaved Chick-fil-A edits will be discarded and the saved page loaded.</AdminConfirmDialog>
  </AdminPage>;
}
