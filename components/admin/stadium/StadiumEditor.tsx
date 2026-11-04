"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { Button } from "@/components/ui/button";
import NativeImage from "@/components/ResilientNativeImage";
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
        if (!user.data.user) throw new Error("Sign in again to edit Stadium.");
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
        if (stored) setMessage(stored.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved Stadium draft has been restored.");
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
    setMessage(""); setFailed(false);
  };
  function guardLink(event: MouseEvent<HTMLAnchorElement>) {
    if (locked || (dirty && !window.confirm("Leave this page? Your unsaved Stadium draft will be kept on this browser."))) event.preventDefault();
  }
  async function save() {
    if (!draft || !snapshot || busy || uploading) return;
    const parsed = stadiumSaveSchema.safeParse(pending ?? { operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: [...new Set(retired)] });
    if (!parsed.success) { setFailed(true); setMessage("Review the fields and map crop before saving."); return; }
    const request = parsed.data, generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setMessage("Saving Stadium…");
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, retired })); } catch {}
    const result = await saveVisitorPageEditor<StadiumContent>("stadium", request);
    if (generation !== epoch.current) return;
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? emptyStadiumContent()); setMedia(result.snapshot.media);
      setRetired([]); setPending(null); setMessage(result.snapshot.cleanupPending ? "Stadium saved. Image cleanup will retry automatically." : "Stadium saved."); clearRecovery();
    } else if (result.status === "uncertain") { setPending(result.request); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setMessage(result.message); }
  }
  async function reload() {
    if (locked || (dirty && !window.confirm("Discard unsaved Stadium edits and load the saved page?"))) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const loaded = await loadVisitorPageEditor<StadiumContent>("stadium");
      if (generation !== epoch.current) return;
      setSnapshot(loaded); setDraft(loaded.content ?? emptyStadiumContent()); setMedia(loaded.media); setRetired([]); setMessage(""); setFailed(false); clearRecovery();
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to reload Stadium."); } }
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
      setMessage("Image ready. Save Stadium to use it.");
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
  const field = (label: string, key: "title" | "subtitle" | "includesHeading" | "benefitsNote", multiline = false) => <label className="block space-y-2" key={key}><span className="text-sm font-medium">{label}</span>{multiline
    ? <textarea className={ADMIN_INPUT_CLASS + " min-h-28"} disabled={locked} value={draft?.[key] ?? ""} maxLength={4000} onChange={event => update(content => { content[key] = event.target.value; })} />
    : <input className={ADMIN_INPUT_CLASS} disabled={locked} value={draft?.[key] ?? ""} maxLength={120} onChange={event => update(content => { content[key] = event.target.value; })} />}</label>;
  const page = draft ? hydrateStadiumContent(draft, media) : null;
  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader title="Stadium" description="This page is unavailable for the current website design." /></AdminPage>;
  return <AdminPage className="pb-24"><AdminPageHeader title="Stadium" description="Edit the page, travel information and artwork. Save applies all changes together." actions={<Link className="text-primary underline" href="/stadium" target="_blank">Open Stadium page</Link>} />
    <AdminPanel><p className="text-sm text-muted-foreground">Next-match wording comes from <Link className="text-primary underline" href="/admin/homepage" onClick={guardLink}>Homepage</Link>; fixtures come from <Link className="text-primary underline" href="/admin/schedule" onClick={guardLink}>Schedule</Link>. The purchase link and its unavailable message are managed in <Link className="text-primary underline" href="/admin/tickets" onClick={guardLink}>Tickets</Link>.</p></AdminPanel>
    {message && <div className={failed ? "rounded-lg border border-destructive p-4 text-sm" : "rounded-lg border border-border p-4 text-sm"} role={failed ? "alert" : "status"}>{message}</div>}
    {!draft || loadedClubId !== club.id ? <AdminPanel><p role="status">Loading Stadium…</p>{failed && <Button onClick={() => location.reload()}>Try again</Button>}</AdminPanel> : <>
      <AdminPanel><h2 className="mb-5 text-lg font-semibold">Page and sections</h2><div className="grid gap-5 md:grid-cols-2">{field("Page heading", "title")}{field("Subtitle", "subtitle")}</div><fieldset className="mt-5 space-y-3"><legend className="mb-3 text-sm font-medium">Visible on the page</legend>{VISIBILITY.map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={locked} checked={draft[key]} onChange={event => update(content => { content[key] = event.target.checked; })} />{label}</label>)}</fieldset></AdminPanel>
      <AdminPanel><h2 className="mb-5 text-lg font-semibold">Stadium information</h2><div className="space-y-6">{draft.sections.map((section, index) => <fieldset key={section.id} className="space-y-4 rounded-lg border border-border p-4"><legend className="px-1 text-sm font-medium">Section {index + 1}</legend>
        <label className="block space-y-2"><span className="text-sm">Heading</span><input className={ADMIN_INPUT_CLASS} disabled={locked} maxLength={120} value={section.heading} onChange={event => update(content => { content.sections[index].heading = event.target.value; })} /></label>
        <label className="block space-y-2"><span className="text-sm">Information</span><textarea className={ADMIN_INPUT_CLASS + " min-h-28"} disabled={locked} maxLength={4000} value={section.body} onChange={event => update(content => { content.sections[index].body = event.target.value; })} /></label>
        <label className="block space-y-2"><span className="text-sm">Footnote</span><textarea className={ADMIN_INPUT_CLASS} disabled={locked} maxLength={4000} value={section.note} onChange={event => update(content => { content.sections[index].note = event.target.value; })} /></label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={locked} checked={section.visible} onChange={event => update(content => { content.sections[index].visible = event.target.checked; })} />Show this section</label>
        {section.bullets.map((bullet, bulletIndex) => <div className="space-y-2" key={bulletIndex}><label className="block space-y-2"><span className="text-sm">Bullet {bulletIndex + 1}</span><textarea className={ADMIN_INPUT_CLASS} disabled={locked} maxLength={4000} value={bullet} onChange={event => update(content => { content.sections[index].bullets[bulletIndex] = event.target.value; })} /></label><Button className="min-h-11" variant="outline" disabled={locked} onClick={() => update(content => { content.sections[index].bullets.splice(bulletIndex, 1); })}>Remove bullet {bulletIndex + 1}</Button></div>)}
        <div className="flex flex-wrap gap-3"><Button className="min-h-11" variant="outline" disabled={locked || section.bullets.length >= 20} onClick={() => update(content => { content.sections[index].bullets.push(""); })}>Add bullet</Button><Button className="min-h-11" variant="outline" disabled={locked || index === 0} onClick={() => moveSection(index, -1)}>Move section up</Button><Button className="min-h-11" variant="outline" disabled={locked || index === draft.sections.length - 1} onClick={() => moveSection(index, 1)}>Move section down</Button><Button className="min-h-11" variant="outline" disabled={locked} onClick={() => update(content => { content.sections.splice(index, 1); })}>Remove section</Button></div>
      </fieldset>)}<Button className="min-h-11" variant="outline" disabled={locked || draft.sections.length >= 12} onClick={() => update(content => { content.sections.push({ id: crypto.randomUUID(), heading: "", body: "", note: "", bullets: [], visible: true }); })}>Add section</Button></div></AdminPanel>
      <AdminPanel><h2 className="mb-5 text-lg font-semibold">Ticket benefits</h2><div className="space-y-5">{field("Benefits heading", "includesHeading")}{draft.benefits.map((benefit, index) => <fieldset className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2" key={index}><legend className="px-1 text-sm">Benefit {index + 1}</legend><label className="block space-y-2"><span className="text-sm">Title</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={benefit.title} maxLength={120} onChange={event => update(content => { content.benefits[index].title = event.target.value; })} /></label><label className="block space-y-2"><span className="text-sm">Details</span><textarea className={ADMIN_INPUT_CLASS} disabled={locked} value={benefit.detail} maxLength={4000} onChange={event => update(content => { content.benefits[index].detail = event.target.value; })} /></label><div className="flex flex-wrap gap-3 md:col-span-2"><Button className="min-h-11" variant="outline" disabled={locked || index === 0} onClick={() => update(content => { [content.benefits[index - 1], content.benefits[index]] = [content.benefits[index], content.benefits[index - 1]]; })}>Move benefit up</Button><Button className="min-h-11" variant="outline" disabled={locked || index === draft.benefits.length - 1} onClick={() => update(content => { [content.benefits[index], content.benefits[index + 1]] = [content.benefits[index + 1], content.benefits[index]]; })}>Move benefit down</Button><Button className="min-h-11" variant="outline" disabled={locked} onClick={() => update(content => { content.benefits.splice(index, 1); })}>Remove benefit</Button></div></fieldset>)}<Button className="min-h-11" variant="outline" disabled={locked || draft.benefits.length >= 10} onClick={() => update(content => { content.benefits.push({ title: "", detail: "" }); })}>Add benefit</Button>{field("Benefits footnote", "benefitsNote", true)}</div></AdminPanel>
      <AdminPanel><h2 className="mb-5 text-lg font-semibold">Images</h2><div className="grid gap-6 md:grid-cols-2">{STADIUM_ARTWORK_SLOTS.map(slot => <fieldset className="min-w-0 space-y-3 rounded-lg border border-border p-4" key={slot}><legend className="px-1 text-sm font-medium">{ART_LABELS[slot]}</legend>
        {page?.artwork[slot].url && <NativeImage src={page.artwork[slot].url!} alt={draft.artwork[slot].alt} style={{ height: 120, width: "100%", objectFit: "contain" }} />}
        <label className="block space-y-2"><span className="text-sm">Replace {ART_LABELS[slot].toLowerCase()}</span><input className={ADMIN_INPUT_CLASS} type="file" accept="image/png,image/webp" disabled={locked} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(slot, file); event.target.value = ""; }} /></label>
        <label className="block space-y-2"><span className="text-sm">Image description</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.artwork[slot].alt} maxLength={1000} onChange={event => update(content => { content.artwork[slot].alt = event.target.value; })} /></label>
        <Button className="min-h-11" variant="outline" disabled={locked || !draft.artwork[slot].assetId} onClick={() => { const id = draft.artwork[slot].assetId; if (id) setRetired(current => [...new Set([...current, id])]); update(content => { content.artwork[slot].assetId = null; }); }}>Remove image</Button>
      </fieldset>)}</div><p className="mt-4 text-sm text-muted-foreground">PNG or WebP, up to 5 MB and 3000 pixels per side. Words inside artwork change when you replace its image.</p></AdminPanel>
      <AdminPanel><h2 className="mb-5 text-lg font-semibold">Phone map layout</h2><label className="block space-y-2"><span className="text-sm">Display the map</span><select className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.phoneMapLayout} onChange={event => update(content => { content.phoneMapLayout = event.target.value as "full" | "split"; })}><option value="full">Show the full image</option><option value="split">Show a route card, then a walking map</option></select></label><p className="mt-3 text-sm text-muted-foreground">Replacement maps start as a full image. Choose two parts only when your artwork contains a separate route card and walking map.</p>
        {draft.phoneMapLayout === "split" && <div className="mt-5 grid gap-6 md:grid-cols-2">{(["phoneCardCrop", "phoneMapCrop"] as const).map((cropKey, index) => <fieldset key={cropKey} className="space-y-4 rounded-lg border border-border p-4"><legend className="px-1 text-sm font-medium">{index === 0 ? "Route card" : "Walking map"} crop</legend><div className="grid grid-cols-2 gap-4">{(["x", "y", "width", "height"] as const).map(key => <label className="block space-y-2" key={key}><span className="text-sm">{({ x: "Left", y: "Top", width: "Width", height: "Height" })[key]} (%)</span><input className={ADMIN_INPUT_CLASS} type="number" min={key === "x" || key === "y" ? 0 : 0.001} max={100} step={0.1} disabled={locked} value={Number((draft[cropKey][key] * 100).toFixed(4))} onChange={event => { if (event.target.value) setCrop(cropKey, key, Number(event.target.value)); }} /></label>)}</div></fieldset>)}</div>}
      </AdminPanel>
      <AdminPanel><details><summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">Preview current edits</summary><div className="my-4 flex gap-3"><Button className="min-h-11" variant={previewPhone ? "default" : "outline"} onClick={() => setPreviewPhone(true)}>Phone</Button><Button className="min-h-11" variant={!previewPhone ? "default" : "outline"} onClick={() => setPreviewPhone(false)}>Desktop</Button></div><div className="overflow-auto rounded-lg border border-border" style={{ "--hp-viewport": "100dvh" } as CSSProperties}><div style={{ width: previewPhone ? 390 : 1280 }}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="Stadium"><CinematicShell contentOnly initialContent={shared}><CinematicStadium content={page!} ticketing={ticketing} /></CinematicShell></HomepagePreviewFrame></div></div></details></AdminPanel>
      <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"><Button className="min-h-11" disabled={busy || !!uploading || (!dirty && !pending && !retired.length)} onClick={() => void save()}>{busy ? "Saving…" : pending ? "Retry same save" : "Save Stadium"}</Button><Button className="min-h-11" variant="outline" disabled={locked} onClick={() => void reload()}>Reload saved page</Button><span className="self-center text-sm text-muted-foreground">{pending ? "Awaiting save confirmation" : dirty ? "Unsaved changes" : "All changes saved"}</span></div>
    </>}
  </AdminPage>;
}
