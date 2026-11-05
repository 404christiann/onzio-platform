"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
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
  MAX_ROBINSON_BLOCKS, MAX_ROBINSON_BULLETS, MAX_ROBINSON_INFO_ROWS, MAX_ROBINSON_PARAGRAPHS,
  emptyRobinsonContent, hydrateRobinsonContent, robinsonContentSchema, robinsonDraftFingerprint, robinsonSaveSchema,
  type RobinsonContent, type RobinsonImageSlot, type RobinsonSaveRequest, type RobinsonSnapshot,
} from "@/lib/cinematic-robinson-content";
import { addBlock, addInfoRow, appendItem, moveItem, removeItem, setImage, unusedUploads, updateBlock } from "@/lib/cinematic-robinson-editor";
import CinematicShell from "@/components/cinematic/CinematicShell";
import CinematicRobinson from "@/components/cinematic/CinematicRobinson";
import type { StadiumTicketing } from "@/components/cinematic/CinematicStadium";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import "@/components/admin/homepage/homepage-editor.css";

const recoverySchema = z.object({
  content: robinsonContentSchema, revision: z.string().regex(/^[0-9]+$/), designRevision: z.string(),
  pending: robinsonSaveSchema.nullable(), uploads: z.array(z.uuid()),
  media: z.array(z.object({ id: z.uuid(), storage_bucket: z.string(), storage_path: z.string(), width: z.number(), height: z.number() }).strict()),
}).strict();
type Section = Exclude<keyof RobinsonContent, "images">;
const PAGE = "Robinson Stadium";

function TextField({ label, value, max, disabled, multiline, hint, onChange }: { label: string; value: string; max: number; disabled: boolean; multiline?: boolean; hint?: string; onChange: (value: string) => void }) {
  return <label className="block space-y-2"><span className="text-sm font-medium">{label}</span>
    {multiline ? <textarea className={ADMIN_INPUT_CLASS + " min-h-28"} disabled={disabled} value={value} maxLength={max} onChange={event => onChange(event.target.value)} />
      : <input className={ADMIN_INPUT_CLASS} disabled={disabled} value={value} maxLength={max} onChange={event => onChange(event.target.value)} />}
    {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>;
}

function TextList({ label, items, max, disabled, onChange }: { label: string; items: string[]; max: number; disabled: boolean; onChange: (items: string[]) => void }) {
  return <div className="space-y-4">{items.map((item, index) => <div key={index} className="space-y-2">
    <TextField label={`${label} ${index + 1}`} value={item} max={4000} multiline disabled={disabled} onChange={value => onChange(items.map((current, position) => position === index ? value : current))} />
    <div className="flex flex-wrap gap-2">
      <Button className="min-h-11" variant="outline" disabled={disabled || index === 0} onClick={() => onChange(moveItem(items, index, -1))}>Move up</Button>
      <Button className="min-h-11" variant="outline" disabled={disabled || index === items.length - 1} onClick={() => onChange(moveItem(items, index, 1))}>Move down</Button>
      <Button className="min-h-11" variant="outline" disabled={disabled} onClick={() => onChange(removeItem(items, index))}>Remove {label.toLowerCase()} {index + 1}</Button>
    </div></div>)}
    <Button className="min-h-11" variant="outline" disabled={disabled || items.length >= max} onClick={() => onChange(appendItem(items, "", max))}>Add {label.toLowerCase()}</Button>
  </div>;
}

export default function RobinsonStadiumEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<RobinsonSnapshot | null>(null), [draft, setDraft] = useState<RobinsonContent | null>(null);
  const [media, setMedia] = useState<RobinsonSnapshot["media"]>([]), [uploads, setUploads] = useState<string[]>([]), [pending, setPending] = useState<RobinsonSaveRequest | null>(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<RobinsonImageSlot | null>(null), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [ticketing, setTicketing] = useState<StadiumTicketing>(emptyTicketsContent());
  const [previewPhone, setPreviewPhone] = useState(false), [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const recoveryKey = useRef<string | null>(null), epoch = useRef(0);
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const dirty = !!draft && !!snapshot && robinsonDraftFingerprint(draft) !== robinsonDraftFingerprint(snapshot.content ?? emptyRobinsonContent());
  const locked = busy || !!pending || !!uploading;

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setMedia([]); setUploads([]);
    setMessage(""); setFailed(false); setBusy(false); setUploading(null); setShared(null); setTicketing(emptyTicketsContent());
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadVisitorPageEditor<RobinsonContent>("robinson"), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id), loadTicketsEditor()])
      .then(([loaded, user, homepage, tickets]) => {
        if (!active) return;
        if (!user.data.user) throw new Error(`Sign in again to edit ${PAGE}.`);
        const key = `onzio:robinson:v1:${location.origin}:${user.data.user.id}:${club.id}`;
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
        setDraft(stored?.content ?? loaded.content ?? emptyRobinsonContent()); setMedia(stored?.media ?? loaded.media);
        setUploads(stored?.uploads ?? []); setPending(stored?.pending ?? null);
        if (stored) setMessage(stored.pending ? "An earlier save needs confirmation. Retry the same save." : `Your unsaved ${PAGE} draft has been restored.`);
      }).catch(error => { if (active) { setMessage(error.message); setFailed(true); } });
    return () => { active = false; epoch.current += 1; };
  }, [club.id, club.presentationTemplateKey]);
  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current) return;
    try {
      if (dirty || pending || uploads.length) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending, media, uploads }));
      else localStorage.removeItem(recoveryKey.current);
    } catch { /* The in-memory draft remains usable when browser storage is full. */ }
  }, [draft, snapshot, dirty, pending, media, uploads]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  const change = (edit: (value: RobinsonContent) => RobinsonContent) => {
    if (locked) return;
    setDraft(current => current && edit(current));
    setMessage(""); setFailed(false);
  };
  const patch = <K extends Section>(section: K, value: Partial<RobinsonContent[K]>) => change(content => ({ ...content, [section]: { ...content[section], ...value } }));
  function guardLink(event: MouseEvent<HTMLAnchorElement>) {
    if (locked || (dirty && !window.confirm(`Leave this page? Your unsaved ${PAGE} draft will be kept on this browser.`))) event.preventDefault();
  }
  async function save() {
    if (!draft || !snapshot || busy || uploading) return;
    const parsed = robinsonSaveSchema.safeParse(pending ?? { operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: unusedUploads(uploads, draft) });
    if (!parsed.success) { setFailed(true); setMessage("Review the fields before saving. Each Directions section needs its own anchor."); return; }
    const request = parsed.data, generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setMessage(`Saving ${PAGE}…`);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, uploads })); } catch {}
    const result = await saveVisitorPageEditor<RobinsonContent>("robinson", request);
    if (generation !== epoch.current) return;
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? emptyRobinsonContent()); setMedia(result.snapshot.media);
      setUploads([]); setPending(null); setMessage(result.snapshot.cleanupPending ? `${PAGE} saved. Image cleanup will retry automatically.` : `${PAGE} saved.`); clearRecovery();
    } else if (result.status === "uncertain") { setPending(result.request); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setMessage(result.message); }
  }
  async function reload() {
    if (locked || (dirty && !window.confirm(`Discard unsaved ${PAGE} edits and load the saved page?`))) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const loaded = await loadVisitorPageEditor<RobinsonContent>("robinson");
      if (generation !== epoch.current) return;
      setSnapshot(loaded); setDraft(loaded.content ?? emptyRobinsonContent()); setMedia(loaded.media); setUploads([]); setMessage(""); setFailed(false); clearRecovery();
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : `Unable to reload ${PAGE}.`); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  async function upload(slot: RobinsonImageSlot, file: File) {
    if (!draft || locked) return;
    const generation = epoch.current;
    setUploading(slot); setFailed(false); setMessage("Adding your image…");
    try {
      const result = await createClient().storage.from("homepage-artwork").upload("robinson/" + crypto.randomUUID(), file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Image upload failed.");
      const bitmap = await createImageBitmap(file), dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (generation !== epoch.current) return;
      const id = result.data.assetId;
      setMedia(current => [...current, { id, storage_bucket: "onzio-media", storage_path: result.data.path, ...dimensions }]);
      setUploads(current => [...current, id]);
      // Upload locks manual editing. Apply its one confirmed identity directly.
      setDraft(current => current && setImage(current, slot, id));
      setMessage(`Image ready. Save ${PAGE} to use it.`);
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to add this image. Choose it again to retry."); } }
    finally { if (generation === epoch.current) setUploading(null); }
  }

  const page = draft ? hydrateRobinsonContent(draft, media) : null;
  const imageSlot = (slot: RobinsonImageSlot, label: string, hint?: string) => draft && page && <fieldset className="min-w-0 space-y-3 rounded-lg border border-border p-4" key={slot}>
    <legend className="px-1 text-sm font-medium">{label}</legend>
    {page.images[slot].url ? <NativeImage src={page.images[slot].url!} alt={draft.images[slot].alt} style={{ height: 120, width: "100%", objectFit: "contain" }} /> : <p className="text-sm text-muted-foreground">No image. Nothing shows here on the page.</p>}
    <label className="block space-y-2"><span className="text-sm">{uploading === slot ? "Adding image…" : `Replace ${label.toLowerCase()}`}</span><input className={ADMIN_INPUT_CLASS} type="file" accept="image/png,image/webp" disabled={locked} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(slot, file); event.target.value = ""; }} /></label>
    <TextField label="Image description" value={draft.images[slot].alt} max={1000} disabled={locked} hint={hint} onChange={alt => change(content => ({ ...content, images: { ...content.images, [slot]: { ...content.images[slot], alt } } }))} />
    <Button className="min-h-11" variant="outline" disabled={locked || !draft.images[slot].assetId} onClick={() => change(content => setImage(content, slot, null))}>Remove image</Button>
  </fieldset>;
  const panel = (section: Section, title: string, children: ReactNode, description?: ReactNode) => draft && <AdminPanel key={section}>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={locked} checked={draft[section].visible} onChange={event => patch(section, { visible: event.target.checked } as Partial<RobinsonContent[typeof section]>)} />Show on page</label></div>
    <div className="space-y-5">{children}</div>
  </AdminPanel>;

  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader title={PAGE} description="This page is unavailable for the current website design." /></AdminPage>;
  return <AdminPage className="pb-24"><AdminPageHeader title={PAGE} description="Edit the Robinson Stadium page. Save applies all changes together." actions={<Link className="text-primary underline" href="/stadium" target="_blank">Open Stadium page</Link>} />
    {message && <div className={failed ? "rounded-lg border border-destructive p-4 text-sm" : "rounded-lg border border-border p-4 text-sm"} role={failed ? "alert" : "status"}>{message}</div>}
    {!draft || !page || loadedClubId !== club.id ? <AdminPanel><p role="status">Loading {PAGE}…</p>{failed && <Button onClick={() => location.reload()}>Try again</Button>}</AdminPanel> : <>
      {panel("heading", "Page heading", <div className="grid gap-5 md:grid-cols-2">
        <TextField label="Title" value={draft.heading.title} max={120} disabled={locked} onChange={title => patch("heading", { title })} />
        <TextField label="Subtitle" value={draft.heading.subtitle} max={120} disabled={locked} onChange={subtitle => patch("heading", { subtitle })} />
      </div>)}
      {panel("seating", "Seating map", <>
        {imageSlot("seating", "Seating map", "On phones, a link opens this image full size.")}
        <div className="grid gap-5 md:grid-cols-2">
          <TextField label="Caption" value={draft.seating.caption} max={120} disabled={locked} onChange={caption => patch("seating", { caption })} />
          <TextField label="Full-size link (phones)" value={draft.seating.expandLabel} max={120} disabled={locked} onChange={expandLabel => patch("seating", { expandLabel })} />
        </div></>)}
      {panel("story", "Story", <>
        <TextList label="Paragraph" items={draft.story.paragraphs} max={MAX_ROBINSON_PARAGRAPHS} disabled={locked} onChange={paragraphs => patch("story", { paragraphs })} />
        <TextField label="Quote" value={draft.story.quote} max={4000} multiline disabled={locked} hint="Quotation marks are added on the page." onChange={quote => patch("story", { quote })} />
        <TextField label="Quote attribution" value={draft.story.attribution} max={120} disabled={locked} onChange={attribution => patch("story", { attribution })} />
      </>)}
      {panel("info", "Stadium Info", <>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField label="Heading" value={draft.info.heading} max={120} disabled={locked} onChange={heading => patch("info", { heading })} />
          <TextField label="Note" value={draft.info.note} max={120} disabled={locked} onChange={note => patch("info", { note })} />
        </div>
        {draft.info.rows.map((row, index) => <fieldset key={index} className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-[1fr_10rem]"><legend className="px-1 text-sm">Row {index + 1}</legend>
          <TextField label="Label" value={row.label} max={120} disabled={locked} onChange={label => patch("info", { rows: draft.info.rows.map((current, position) => position === index ? { ...current, label } : current) })} />
          <label className="block space-y-2"><span className="text-sm font-medium">Value</span><select className={ADMIN_INPUT_CLASS} disabled={locked} value={row.available ? "yes" : "no"} onChange={event => patch("info", { rows: draft.info.rows.map((current, position) => position === index ? { ...current, available: event.target.value === "yes" } : current) })}><option value="yes">Yes</option><option value="no">No</option></select></label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button className="min-h-11" variant="outline" disabled={locked || index === 0} onClick={() => patch("info", { rows: moveItem(draft.info.rows, index, -1) })}>Move up</Button>
            <Button className="min-h-11" variant="outline" disabled={locked || index === draft.info.rows.length - 1} onClick={() => patch("info", { rows: moveItem(draft.info.rows, index, 1) })}>Move down</Button>
            <Button className="min-h-11" variant="outline" disabled={locked} onClick={() => patch("info", { rows: removeItem(draft.info.rows, index) })}>Remove row {index + 1}</Button>
          </div></fieldset>)}
        <Button className="min-h-11" variant="outline" disabled={locked || draft.info.rows.length >= MAX_ROBINSON_INFO_ROWS} onClick={() => change(addInfoRow)}>Add row</Button>
      </>)}
      {panel("match", "Next home match", imageSlot("partner", "Partner logo under the match"), <>Match wording comes from <Link className="text-primary underline" href="/admin/homepage" onClick={guardLink}>Homepage</Link>, fixtures from <Link className="text-primary underline" href="/admin/schedule" onClick={guardLink}>Schedule</Link>, and the purchase link from <Link className="text-primary underline" href="/admin/tickets" onClick={guardLink}>Tickets</Link>.</>)}
      {panel("lockers", "Lockers image", imageSlot("lockers", "Lockers image", "Decorative. Leave the description empty unless the image carries information."))}
      {panel("food", "Food & Beverage", <>
        <TextField label="Heading" value={draft.food.heading} max={120} disabled={locked} onChange={heading => patch("food", { heading })} />
        {imageSlot("mealPass", "Meal pass")}
        <TextField label="Text" value={draft.food.body} max={4000} multiline disabled={locked} hint="Line breaks show on desktop." onChange={body => patch("food", { body })} />
        <div className="grid gap-5 md:grid-cols-3">{draft.food.steps.map((step, index) => <div key={index} className="space-y-3">
          <TextField label={`Step ${index + 1}`} value={step.label} max={120} disabled={locked} onChange={label => patch("food", { steps: draft.food.steps.map((current, position) => position === index ? { label } : current) })} />
          {imageSlot((["step1", "step2", "step3"] as const)[index], `Step ${index + 1} icon`)}
        </div>)}</div>
      </>)}
      {panel("route", "Road to the Match", <>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField label="Heading" value={draft.route.heading} max={120} disabled={locked} onChange={heading => patch("route", { heading })} />
          <TextField label="Subheading" value={draft.route.subheading} max={120} disabled={locked} onChange={subheading => patch("route", { subheading })} />
        </div>
        <div className="grid gap-6 md:grid-cols-2">{imageSlot("bus", "Bus")}{imageSlot("routeMap", "Route map")}</div>
      </>)}
      {panel("directions", "Directions", <>
        {draft.directions.blocks.map((block, index) => <fieldset key={block.id} className="space-y-4 rounded-lg border border-border p-4"><legend className="px-1 text-sm font-medium">Section {index + 1}</legend>
          <TextField label="Heading" value={block.heading} max={120} disabled={locked} hint={`Page link: /stadium#${block.id}`} onChange={heading => change(content => updateBlock(content, index, { heading }))} />
          <TextList label="Paragraph" items={block.paragraphs} max={MAX_ROBINSON_PARAGRAPHS} disabled={locked} onChange={paragraphs => change(content => updateBlock(content, index, { paragraphs }))} />
          <TextField label="Italic note" value={block.note} max={4000} multiline disabled={locked} onChange={note => change(content => updateBlock(content, index, { note }))} />
          <TextList label="Bullet" items={block.bullets} max={MAX_ROBINSON_BULLETS} disabled={locked} onChange={bullets => change(content => updateBlock(content, index, { bullets }))} />
          <TextField label="Closing line" value={block.closing} max={4000} multiline disabled={locked} hint="Shown on its own line after the bullets." onChange={closing => change(content => updateBlock(content, index, { closing }))} />
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" variant="outline" disabled={locked || index === 0} onClick={() => patch("directions", { blocks: moveItem(draft.directions.blocks, index, -1) })}>Move section up</Button>
            <Button className="min-h-11" variant="outline" disabled={locked || index === draft.directions.blocks.length - 1} onClick={() => patch("directions", { blocks: moveItem(draft.directions.blocks, index, 1) })}>Move section down</Button>
            <Button className="min-h-11" variant="outline" disabled={locked} onClick={() => patch("directions", { blocks: removeItem(draft.directions.blocks, index) })}>Remove section {index + 1}</Button>
          </div></fieldset>)}
        <Button className="min-h-11" variant="outline" disabled={locked || draft.directions.blocks.length >= MAX_ROBINSON_BLOCKS} onClick={() => change(addBlock)}>Add section</Button>
      </>, "The Stadium parking menu link opens the section whose page link ends in #parking-lot-no-5.")}
      <p className="text-sm text-muted-foreground">Images: PNG or WebP, up to 5 MB and 3000 pixels per side.</p>
      <AdminPanel><details><summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">Preview current edits</summary><div className="my-4 flex gap-3"><Button className="min-h-11" variant={!previewPhone ? "default" : "outline"} onClick={() => setPreviewPhone(false)}>Desktop</Button><Button className="min-h-11" variant={previewPhone ? "default" : "outline"} onClick={() => setPreviewPhone(true)}>Phone</Button></div><div className="overflow-auto rounded-lg border border-border" style={{ "--hp-viewport": "100dvh" } as CSSProperties}><div style={{ width: previewPhone ? 390 : 1280 }}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={PAGE}><CinematicShell contentOnly initialContent={shared}><CinematicRobinson content={page} ticketing={ticketing} /></CinematicShell></HomepagePreviewFrame></div></div></details></AdminPanel>
      <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"><Button className="min-h-11" disabled={busy || !!uploading || (!dirty && !pending && !uploads.length)} onClick={() => void save()}>{busy ? "Saving…" : pending ? "Retry same save" : `Save ${PAGE}`}</Button><Button className="min-h-11" variant="outline" disabled={locked} onClick={() => void reload()}>Reload saved page</Button><span className="self-center text-sm text-muted-foreground">{pending ? "Awaiting save confirmation" : dirty ? "Unsaved changes" : "All changes saved"}</span></div>
    </>}
  </AdminPage>;
}
