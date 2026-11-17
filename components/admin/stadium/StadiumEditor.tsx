"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { EditorActionButton, EditorGroup, EditorIconButton, EditorImage, EditorLoading, EditorNotice, EditorPageLink, EditorPreview, EditorRemoveButton, EditorSaveBar, EditorSecondaryButton, EditorSection, EditorSwitch, editorSaveState, kit, useSavedFlash } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { ChevronDown, ChevronUp } from "@/components/admin/icons";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { createClient } from "@/lib/admin-client";
import { loadVisitorPageEditor, saveVisitorPageEditor } from "@/lib/visitor-page-editor";
import { loadTicketsEditor } from "@/lib/tickets-editor";
import { emptyTicketsContent } from "@/lib/tickets-content";
import {
  STADIUM_ARTWORK_SLOTS, emptyStadiumContent, hydrateStadiumContent, resetStadiumMapFraming,
  stadiumDraftSchema, stadiumDraftFingerprint, stadiumSaveSchema, stadiumCropSchema,
  type StadiumArtworkSlot, type StadiumContent, type StadiumSnapshot, type StadiumSaveRequest, type StadiumCrop,
} from "@/lib/stadium-content";
import CinematicShell from "@/components/cinematic/CinematicShell";
import CinematicStadium, { type StadiumTicketing } from "@/components/cinematic/CinematicStadium";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import "@/components/admin/homepage/homepage-editor.css";

const recoverySchema = z.object({
  content: stadiumDraftSchema, revision: z.string().regex(/^[0-9]+$/), designRevision: z.string(),
  pending: stadiumSaveSchema.nullable(), retired: z.array(z.uuid()),
  media: z.array(z.object({ id: z.uuid(), storage_bucket: z.string(), storage_path: z.string(), width: z.number(), height: z.number() }).strict()),
}).strict();
const ART_LABELS: Record<StadiumArtworkSlot, string> = { bus: "Bus", map: "Route card and walking map", partner: "Ticket partner" };
const VISIBILITY: [keyof Pick<StadiumContent, "showHeading" | "showMap" | "showSections" | "showMatch" | "showBenefits">, string][] = [
  ["showHeading", "Page heading and bus"], ["showMap", "Route map"], ["showSections", "Stadium information"], ["showMatch", "Next home match"], ["showBenefits", "Ticket benefits"],
];

export default function StadiumEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<StadiumSnapshot | null>(null), [draft, setDraft] = useState<StadiumContent | null>(null);
  const [media, setMedia] = useState<StadiumSnapshot["media"]>([]), [retired, setRetired] = useState<string[]>([]), [pending, setPending] = useState<StadiumSaveRequest | null>(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<StadiumArtworkSlot | null>(null), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [ticketing, setTicketing] = useState<StadiumTicketing>(emptyTicketsContent());
  const [previewPhone, setPreviewPhone] = useState(true), [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const [confirmReload, setConfirmReload] = useState(false), [leaveTo, setLeaveTo] = useState<string | null>(null), [saved, setSaved] = useSavedFlash();
  const router = useRouter();
  const recoveryKey = useRef<string | null>(null), epoch = useRef(0);
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const dirty = !!draft && !!snapshot && stadiumDraftFingerprint(draft) !== stadiumDraftFingerprint(snapshot.content ?? emptyStadiumContent());
  const locked = busy || !!pending || !!uploading;

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setMedia([]); setRetired([]);
    setMessage(""); setFailed(false); setBusy(false); setUploading(null); setShared(null); setTicketing(emptyTicketsContent());
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadVisitorPageEditor<StadiumContent>("stadium"), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id), loadTicketsEditor()])
      .then(([loaded, user, homepage, tickets]) => {
        if (!active) return;
        if (!user.data.user) throw new Error("Sign in again to edit Foothill Transit.");
        const key = `onzio:stadium:v1:${location.origin}:${user.data.user.id}:${club.id}`;
        recoveryKey.current = key;
        setShared(homepage); setTicketing(tickets.content ?? emptyTicketsContent()); setLoadedClubId(club.id);
        let stored: z.infer<typeof recoverySchema> | null = null;
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = recoverySchema.safeParse(JSON.parse(raw));
            if (parsed.success) stored = parsed.data;
            else localStorage.removeItem(key);
          }
        } catch {}
        setSnapshot(stored ? { ...loaded, revision: stored.revision, designRevision: stored.designRevision } : loaded);
        setDraft(stored?.content ?? loaded.content ?? emptyStadiumContent()); setMedia(stored?.media ?? loaded.media);
        setRetired(stored?.retired ?? []); setPending(stored?.pending ?? null);
        if (stored) setMessage(stored.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved Foothill Transit draft has been restored.");
      }).catch(error => { if (active) { setMessage(error.message); setFailed(true); } });
    return () => { active = false; epoch.current += 1; };
  }, [club.id, club.presentationTemplateKey]);
  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current) return;
    try {
      if (dirty || pending || retired.length) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending, media, retired }));
      else localStorage.removeItem(recoveryKey.current);
    } catch { /* The in-memory draft remains usable when browser storage is full. */ }
  }, [draft, snapshot, dirty, pending, media, retired]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  const update = (edit: (value: StadiumContent) => void) => {
    if (locked) return;
    setDraft(current => { if (!current) return current; const copy = structuredClone(current); edit(copy); return copy; });
    setMessage(""); setFailed(false); setSaved(false);
  };
  function guardLink(event: MouseEvent<HTMLAnchorElement>) {
    if (locked) { event.preventDefault(); return; }
    if (dirty) { event.preventDefault(); setLeaveTo(event.currentTarget.getAttribute("href")); }
  }
  async function save() {
    if (!draft || !snapshot || busy || uploading) return;
    const parsed = stadiumSaveSchema.safeParse(pending ?? { operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: [...new Set(retired)] });
    if (!parsed.success) { setFailed(true); setMessage("Review the fields and map crop before saving."); return; }
    const request = parsed.data, generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setMessage("Saving Foothill Transit…");
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, retired })); } catch {}
    const result = await saveVisitorPageEditor<StadiumContent>("stadium", request);
    if (generation !== epoch.current) return;
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? emptyStadiumContent()); setMedia(result.snapshot.media);
      setRetired([]); setPending(null); setMessage(result.snapshot.cleanupPending ? "Foothill Transit saved. Image cleanup will retry automatically." : "Foothill Transit saved."); clearRecovery(); setSaved(true);
    } else if (result.status === "uncertain") { setPending(result.request); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setMessage(result.message); }
  }
  async function reload(confirmed = false) {
    if (locked) return;
    if (dirty && !confirmed) { setConfirmReload(true); return; }
    const generation = epoch.current;
    setBusy(true);
    try {
      const loaded = await loadVisitorPageEditor<StadiumContent>("stadium");
      if (generation !== epoch.current) return;
      setSnapshot(loaded); setDraft(loaded.content ?? emptyStadiumContent()); setMedia(loaded.media); setRetired([]); setMessage(""); setFailed(false); clearRecovery();
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to reload Foothill Transit."); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  async function upload(slot: StadiumArtworkSlot, file: File) {
    if (!draft || locked) return;
    const generation = epoch.current;
    setUploading(slot); setFailed(false); setMessage("Adding your image…");
    try {
      const client = createClient(), bucket = client.storage.from("homepage-artwork");
      const result = await bucket.upload("stadium/" + crypto.randomUUID(), file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Image upload failed.");
      const bitmap = await createImageBitmap(file), dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (generation !== epoch.current) return;
      const oldId = draft.artwork[slot].assetId;
      if (oldId && media.some(asset => asset.id === oldId) && !snapshot?.media.some(asset => asset.id === oldId)) setRetired(current => [...new Set([...current, oldId])]);
      setMedia(current => [...current, { id: result.data.assetId, storage_bucket: "onzio-media", storage_path: result.data.path, ...dimensions }]);
      // Upload locks manual editing. Apply its one confirmed identity directly.
      setDraft(current => {
        if (!current) return current;
        const copy = slot === "map" ? resetStadiumMapFraming(structuredClone(current)) : structuredClone(current);
        copy.artwork[slot].assetId = result.data.assetId;
        return copy;
      });
      setMessage("Image ready. Save Foothill Transit to use it.");
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to add this image. Choose it again to retry."); } }
    finally { if (generation === epoch.current) setUploading(null); }
  }
  function setCrop(cropKey: "phoneCardCrop" | "phoneMapCrop", key: keyof StadiumCrop, value: number) {
    if (!draft || !Number.isFinite(value)) return;
    const candidate = { ...draft[cropKey], [key]: value / 100 };
    if (!stadiumCropSchema.safeParse(candidate).success) { setFailed(true); setMessage("The crop must fit inside the image. Reduce width or height before moving it toward an edge."); return; }
    update(content => { content[cropKey] = candidate; });
  }
  function moveSection(index: number, direction: number) {
    update(content => { const next = index + direction; if (next >= 0 && next < content.sections.length) [content.sections[index], content.sections[next]] = [content.sections[next], content.sections[index]]; });
  }
  const field = (label: string, key: "title" | "subtitle" | "includesHeading" | "benefitsNote", multiline = false) => <label className="block min-w-0" key={key}><span className={ADMIN_LABEL_CLASS}>{label}</span>{multiline
    ? <textarea className={ADMIN_INPUT_CLASS + " min-h-28"} disabled={locked} value={draft?.[key] ?? ""} maxLength={4000} onChange={event => update(content => { content[key] = event.target.value; })} />
    : <input className={ADMIN_INPUT_CLASS} disabled={locked} value={draft?.[key] ?? ""} maxLength={120} onChange={event => update(content => { content[key] = event.target.value; })} />}</label>;
  const page = draft ? hydrateStadiumContent(draft, media) : null;
  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader title="Foothill Transit" description="This page is unavailable for the current website design." /></AdminPage>;
  const canSave = !busy && !uploading && (dirty || !!pending || retired.length > 0);
  return <AdminPage className={kit.page}>
    <AdminPageHeader eyebrow="Public website" title="Foothill Transit" description="Edit the Foothill Transit bus route page, travel information and artwork. Save applies all changes together." actions={<EditorPageLink href="/stadium/foothill-transit">Open Foothill Transit page</EditorPageLink>} />
    <p className={kit.notice}>Next-match wording comes from <Link className={kit.inlineLink} href="/admin/homepage" onClick={guardLink}>Homepage</Link>; fixtures come from <Link className={kit.inlineLink} href="/admin/schedule" onClick={guardLink}>Schedule</Link>. The purchase link and its unavailable message are managed in <Link className={kit.inlineLink} href="/admin/tickets" onClick={guardLink}>Tickets</Link>.</p>
    {message && <EditorNotice failed={failed}>{message}</EditorNotice>}
    {!draft || loadedClubId !== club.id ? <EditorLoading label="Loading Foothill Transit…" failed={failed} onRetry={() => location.reload()} /> : <>
      <EditorSection title="Page and sections"><div className="grid gap-5 md:grid-cols-2">{field("Page heading", "title")}{field("Subtitle", "subtitle")}</div>
        <fieldset className="mt-6 min-w-0"><legend className={ADMIN_LABEL_CLASS}>Visible on the page</legend><div className={kit.switchGrid} data-columns="2">{VISIBILITY.map(([key, label]) => <EditorSwitch key={key} label={label} disabled={locked} checked={draft[key]} onChange={checked => update(content => { content[key] = checked; })} />)}</div></fieldset></EditorSection>
      <EditorSection title="Stadium information"><div className="grid gap-4">{draft.sections.map((section, index) => <EditorGroup key={section.id} legend={`Section ${index + 1}`}>
        <label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Heading</span><input className={ADMIN_INPUT_CLASS} disabled={locked} maxLength={120} value={section.heading} onChange={event => update(content => { content.sections[index].heading = event.target.value; })} /></label>
        <label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Information</span><textarea className={ADMIN_INPUT_CLASS + " min-h-28"} disabled={locked} maxLength={4000} value={section.body} onChange={event => update(content => { content.sections[index].body = event.target.value; })} /></label>
        <label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Footnote</span><textarea className={ADMIN_INPUT_CLASS} disabled={locked} maxLength={4000} value={section.note} onChange={event => update(content => { content.sections[index].note = event.target.value; })} /></label>
        <EditorSwitch label={`Show section ${index + 1}`} disabled={locked} checked={section.visible} onChange={checked => update(content => { content.sections[index].visible = checked; })} />
        {section.bullets.map((bullet, bulletIndex) => <div className={kit.subgroup} key={bulletIndex}><label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Bullet {bulletIndex + 1}</span><textarea className={ADMIN_INPUT_CLASS} disabled={locked} maxLength={4000} value={bullet} onChange={event => update(content => { content.sections[index].bullets[bulletIndex] = event.target.value; })} /></label><div><EditorRemoveButton disabled={locked} onClick={() => update(content => { content.sections[index].bullets.splice(bulletIndex, 1); })}>Remove bullet {bulletIndex + 1}</EditorRemoveButton></div></div>)}
        <div className={kit.toolbar}><EditorActionButton disabled={locked || section.bullets.length >= 20} onClick={() => update(content => { content.sections[index].bullets.push(""); })}>Add bullet</EditorActionButton><span className={kit.spacer} /><EditorIconButton label={`Move section ${index + 1} up`} disabled={locked || index === 0} onClick={() => moveSection(index, -1)}><ChevronUp width="16" height="16" /></EditorIconButton><EditorIconButton label={`Move section ${index + 1} down`} disabled={locked || index === draft.sections.length - 1} onClick={() => moveSection(index, 1)}><ChevronDown width="16" height="16" /></EditorIconButton><EditorRemoveButton label={`Remove section ${index + 1}`} disabled={locked} onClick={() => update(content => { content.sections.splice(index, 1); })}>Remove section</EditorRemoveButton></div>
      </EditorGroup>)}<div><EditorActionButton disabled={locked || draft.sections.length >= 12} onClick={() => update(content => { content.sections.push({ id: crypto.randomUUID(), heading: "", body: "", note: "", bullets: [], visible: true }); })}>Add section</EditorActionButton></div></div></EditorSection>
      <EditorSection title="Ticket benefits"><div className="grid gap-4">{field("Benefits heading", "includesHeading")}{draft.benefits.map((benefit, index) => <EditorGroup key={index} legend={`Benefit ${index + 1}`}><div className="grid gap-4 md:grid-cols-2"><label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Title</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={benefit.title} maxLength={120} onChange={event => update(content => { content.benefits[index].title = event.target.value; })} /></label><label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Details</span><textarea className={ADMIN_INPUT_CLASS} disabled={locked} value={benefit.detail} maxLength={4000} onChange={event => update(content => { content.benefits[index].detail = event.target.value; })} /></label></div><div className={kit.toolbar}><span className={kit.spacer} /><EditorIconButton label={`Move benefit ${index + 1} up`} disabled={locked || index === 0} onClick={() => update(content => { [content.benefits[index - 1], content.benefits[index]] = [content.benefits[index], content.benefits[index - 1]]; })}><ChevronUp width="16" height="16" /></EditorIconButton><EditorIconButton label={`Move benefit ${index + 1} down`} disabled={locked || index === draft.benefits.length - 1} onClick={() => update(content => { [content.benefits[index], content.benefits[index + 1]] = [content.benefits[index + 1], content.benefits[index]]; })}><ChevronDown width="16" height="16" /></EditorIconButton><EditorRemoveButton label={`Remove benefit ${index + 1}`} disabled={locked} onClick={() => update(content => { content.benefits.splice(index, 1); })}>Remove benefit</EditorRemoveButton></div></EditorGroup>)}<div><EditorActionButton disabled={locked || draft.benefits.length >= 10} onClick={() => update(content => { content.benefits.push({ title: "", detail: "" }); })}>Add benefit</EditorActionButton></div>{field("Benefits footnote", "benefitsNote", true)}</div></EditorSection>
      <EditorSection title="Images" description="PNG or WebP, up to 5 MB and 3000 pixels per side. Words inside artwork change when you replace its image."><div className="grid gap-4 md:grid-cols-2">{STADIUM_ARTWORK_SLOTS.map(slot => <EditorGroup key={slot} legend={ART_LABELS[slot]}>
        <EditorImage label={ART_LABELS[slot]} url={page?.artwork[slot].url} alt={draft.artwork[slot].alt} accept="image/png,image/webp" empty="No image yet." uploading={uploading === slot} disabled={locked} hasImage={!!page?.artwork[slot].url} onFile={file => void upload(slot, file)}
          onRemove={draft.artwork[slot].assetId ? () => { const id = draft.artwork[slot].assetId; if (id) setRetired(current => [...new Set([...current, id])]); update(content => { content.artwork[slot].assetId = null; }); } : undefined} />
        <label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Image description</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.artwork[slot].alt} maxLength={1000} onChange={event => update(content => { content.artwork[slot].alt = event.target.value; })} /></label>
      </EditorGroup>)}</div></EditorSection>
      <EditorSection title="Phone map layout" description="Replacement maps start as a full image. Choose two parts only when your artwork contains a separate route card and walking map."><label className="block min-w-0"><span className={ADMIN_LABEL_CLASS}>Display the map</span><select className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.phoneMapLayout} onChange={event => update(content => { content.phoneMapLayout = event.target.value as "full" | "split"; })}><option value="full">Show the full image</option><option value="split">Show a route card, then a walking map</option></select></label>
        {draft.phoneMapLayout === "split" && <div className="mt-5 grid gap-4 md:grid-cols-2">{(["phoneCardCrop", "phoneMapCrop"] as const).map((cropKey, index) => <EditorGroup key={cropKey} legend={`${index === 0 ? "Route card" : "Walking map"} crop`}><div className="grid grid-cols-2 gap-4">{(["x", "y", "width", "height"] as const).map(key => <label className="block min-w-0" key={key}><span className={ADMIN_LABEL_CLASS}>{({ x: "Left", y: "Top", width: "Width", height: "Height" })[key]} (%)</span><input className={ADMIN_INPUT_CLASS} type="number" min={key === "x" || key === "y" ? 0 : 0.001} max={100} step={0.1} disabled={locked} value={Number((draft[cropKey][key] * 100).toFixed(4))} onChange={event => { if (event.target.value) setCrop(cropKey, key, Number(event.target.value)); }} /></label>)}</div></EditorGroup>)}</div>}
      </EditorSection>
      <EditorPreview phone={previewPhone} onPhoneChange={setPreviewPhone}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="Foothill Transit"><CinematicShell contentOnly initialContent={shared}><CinematicStadium content={page!} ticketing={ticketing} /></CinematicShell></HomepagePreviewFrame></EditorPreview>
      <EditorSaveBar state={editorSaveState({ busy, canSave, saved })} retry={!!pending} onSave={() => void save()} status={pending ? "Awaiting save confirmation" : dirty ? "Unsaved changes" : ""}>
        <EditorSecondaryButton disabled={locked} onClick={() => void reload()}>Reload saved page</EditorSecondaryButton>
      </EditorSaveBar>
    </>}
    <AdminConfirmDialog open={confirmReload} title="Discard your Foothill Transit edits?" confirmLabel="Discard and reload" destructive onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(true); }}>Your unsaved Foothill Transit edits will be discarded and the saved page loaded.</AdminConfirmDialog>
    <AdminConfirmDialog open={leaveTo !== null} title="Leave this page?" confirmLabel="Leave page" cancelLabel="Stay on this page" onCancel={() => setLeaveTo(null)} onConfirm={() => { const href = leaveTo; setLeaveTo(null); if (href) router.push(href); }}>Your unsaved Foothill Transit draft will be kept on this browser.</AdminConfirmDialog>
  </AdminPage>;
}
