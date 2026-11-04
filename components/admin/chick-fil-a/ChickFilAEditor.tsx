"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { Button } from "@/components/ui/button";
import NativeImage from "@/components/ResilientNativeImage";
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
  const update = (edit: (content: ChickFilAContent) => void) => { setDraft(current => { if (!current) return current; const copy = structuredClone(current); edit(copy); return copy; }); setMessage(""); setFailed(false); };
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
        setMessage(outcome.snapshot.cleanupPending ? "Chick-fil-A saved. Image cleanup will retry automatically." : "Chick-fil-A saved.");
      } else if (outcome.status === "uncertain") { setPending(outcome.request); setFailed(true); setMessage(outcome.message); }
      else { setPending(null); setFailed(true); setConflict(outcome.status === "conflict"); setMessage(outcome.message); }
    } catch { if (owns(epoch, clubId)) { setFailed(true); setMessage("Save could not be confirmed. Retry the same save. Your draft is locked until then."); } }
    finally { if (owns(epoch, clubId)) setBusy(false); }
  }
  async function reload(keepDraft = false) {
    if (locked || loadedClubId !== club.id) return;
    if (!keepDraft && dirty && !window.confirm("Discard unsaved Chick-fil-A edits and load the saved page?")) return;
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
  const field = (label: string, key: "title" | "subtitle" | "detailsHeading" | "detailsBody") => <label className="block space-y-2" key={key}><span className="text-sm font-medium">{label}</span>{key === "detailsBody" ? <textarea className={ADMIN_INPUT_CLASS + " min-h-36"} disabled={locked} value={draft?.[key] ?? ""} maxLength={4000} onChange={event => update(content => { content[key] = event.target.value; })} /> : <input className={ADMIN_INPUT_CLASS} disabled={locked} value={draft?.[key] ?? ""} maxLength={120} onChange={event => update(content => { content[key] = event.target.value; })} />}</label>;
  const page = draft ? hydrateChickFilAContent(draft, media, false) : null;
  return <AdminPage className="pb-24"><AdminPageHeader title="Chick-fil-A" description="Edit the meal pass, details, three steps and images. Save applies all changes together." actions={<Link className="text-primary underline" href="/stadium/chick-fil-a" target="_blank">Open Chick-fil-A page</Link>} />
    <AdminPanel><p className="text-sm text-muted-foreground">The purchase link and unavailable message are shared with <Link className="text-primary underline" href="/admin/tickets">Tickets</Link>. Match heading, announcement and button text come from <Link className="text-primary underline" href="/admin/homepage">Homepage</Link>. Fixtures come from <Link className="text-primary underline" href="/admin/schedule">Schedule</Link>.</p></AdminPanel>
    {message && <div className={failed ? "rounded-lg border border-destructive p-4 text-sm" : "rounded-lg border border-border p-4 text-sm"} role={failed ? "alert" : "status"}>{message}</div>}
    {!draft || loadedClubId !== club.id ? <AdminPanel><p role="status">Loading Chick-fil-A…</p>{failed && <Button onClick={() => location.reload()}>Try again</Button>}</AdminPanel> : <>
      <AdminPanel><h2 className="mb-5 text-lg font-semibold">Page and details</h2><div className="grid gap-5 md:grid-cols-2">{field("Page heading", "title")}{field("Subtitle", "subtitle")}{field("Details heading", "detailsHeading")}{field("Details copy", "detailsBody")}</div></AdminPanel>
      <AdminPanel><h2 className="mb-5 text-lg font-semibold">Three steps</h2><div className="grid gap-5 md:grid-cols-3">{draft.stepLabels.map((label, index) => <fieldset className="min-w-0 space-y-4 rounded-lg border border-border p-4" key={index}><legend className="px-1 text-sm font-medium">Step {index + 1}</legend><label className="block space-y-2"><span className="text-sm">Label</span><input className={ADMIN_INPUT_CLASS} disabled={locked} maxLength={120} value={label} onChange={event => update(content => { content.stepLabels[index] = event.target.value; })} /></label><label className="block space-y-2"><span className="text-sm">Number</span><input className={ADMIN_INPUT_CLASS} disabled={locked} maxLength={12} value={draft.stepNumbers[index]} onChange={event => update(content => { content.stepNumbers[index] = event.target.value; })} /></label></fieldset>)}</div></AdminPanel>
      <AdminPanel><h2 className="mb-4 text-lg font-semibold">Visible sections</h2><div className="grid gap-3 md:grid-cols-2">{CHICK_FIL_A_SECTIONS.map(section => <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3" key={section}><input type="checkbox" disabled={locked} checked={draft.sections[section]} onChange={event => update(content => { content.sections[section] = event.target.checked; })} /><span className="text-sm">Show {SECTION_LABELS[section].toLowerCase()}</span></label>)}</div></AdminPanel>
      <AdminPanel><h2 className="mb-5 text-lg font-semibold">Images</h2><div className="grid gap-6 md:grid-cols-2">{CHICK_FIL_A_ARTWORK_SLOTS.map(slot => <fieldset className="min-w-0 space-y-3 rounded-lg border border-border p-4" key={slot}><legend className="px-1 text-sm font-medium">{ART_LABELS[slot]}</legend>{page?.artwork[slot].url && <NativeImage src={page.artwork[slot].url!} alt={draft.artwork[slot].alt} style={{ height: 120, width: "100%", objectFit: "contain" }} />}<label className="block space-y-2"><span className="text-sm">Replace {ART_LABELS[slot].toLowerCase()}</span><input className={ADMIN_INPUT_CLASS} type="file" accept={slot === "restaurant" ? "image/jpeg,image/png,image/webp" : "image/png,image/webp"} disabled={locked} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(slot, file); event.target.value = ""; }} /></label><label className="block space-y-2"><span className="text-sm">Image description</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.artwork[slot].alt} maxLength={1000} onChange={event => update(content => { content.artwork[slot].alt = event.target.value; })} /></label><Button variant="outline" disabled={locked || !draft.artwork[slot].assetId} onClick={() => { const id = draft.artwork[slot].assetId; if (id) setRetired(current => [...new Set([...current, id])]); update(content => { content.artwork[slot].assetId = null; }); }}>Remove image</Button><p className="text-xs text-muted-foreground">{slot === "restaurant" ? "JPG, PNG or WebP, up to 15 MB and 6000 pixels per side." : "PNG or WebP, up to 5 MB and 3000 pixels per side."}</p></fieldset>)}</div><p className="mt-4 text-sm text-muted-foreground">Words inside artwork change when you replace its image. Step labels and numbers are editable above.</p></AdminPanel>
      <AdminPanel><details><summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">Preview current edits</summary><div className="my-4 flex gap-3"><Button variant={previewPhone ? "default" : "outline"} onClick={() => setPreviewPhone(true)}>Phone</Button><Button variant={!previewPhone ? "default" : "outline"} onClick={() => setPreviewPhone(false)}>Desktop</Button></div><div className="overflow-auto rounded-lg border border-border" style={{ "--hp-viewport": "100dvh" } as CSSProperties}><div style={{ width: previewPhone ? 390 : 1280 }}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="Chick-fil-A"><CinematicShell contentOnly initialContent={shared}><CinematicChickFilA content={page!} purchase={purchase} /></CinematicShell></HomepagePreviewFrame></div></div></details></AdminPanel>
      <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"><Button disabled={busy || !!uploading || (!dirty && !pending && !retired.length)} onClick={() => void save()}>{busy ? "Saving…" : pending ? "Retry same save" : "Save Chick-fil-A"}</Button><Button variant="outline" disabled={locked} onClick={() => void reload()}>Reload saved page</Button>{conflict && <Button variant="outline" disabled={locked} onClick={() => void reload(true)}>Load latest and keep my edits</Button>}<span className="self-center text-sm text-muted-foreground">{pending ? "Awaiting save confirmation" : dirty ? "Unsaved changes" : "All changes saved"}</span></div>
    </>}
  </AdminPage>;
}
