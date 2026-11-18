"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import {
  EditorActionButton, EditorField, EditorGroup, EditorImage, EditorLoading, EditorNotice, EditorPageLink, EditorPreview, EditorReorderButtons,
  EditorSaveBar, EditorSecondaryButton, EditorSection, EditorSwitch, heldSaveState, kit,
} from "@/components/admin/cinematic-editor/CinematicEditorKit";
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
  return <EditorField label={label} value={value} max={max} disabled={disabled} multiline={multiline} hint={hint} onChange={onChange} />;
}

function TextList({ label, items, max, disabled, onChange }: { label: string; items: string[]; max: number; disabled: boolean; onChange: (items: string[]) => void }) {
  return <div className={kit.stack}>{items.map((item, index) => <div key={index} className="grid min-w-0 gap-2">
    <TextField label={`${label} ${index + 1}`} value={item} max={4000} multiline disabled={disabled} onChange={value => onChange(items.map((current, position) => position === index ? value : current))} />
    <EditorReorderButtons index={index} length={items.length} disabled={disabled} noun={label.toLowerCase()} onMove={delta => onChange(moveItem(items, index, delta))} onRemove={() => onChange(removeItem(items, index))} />
  </div>)}
    <div><EditorActionButton disabled={disabled || items.length >= max} onClick={() => onChange(appendItem(items, "", max))}>Add {label.toLowerCase()}</EditorActionButton></div>
  </div>;
}

function YesNoField({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const id = useId();
  return <div className={kit.field}><label htmlFor={id}>{label}</label>
    <select id={id} disabled={disabled} value={value ? "yes" : "no"} onChange={event => onChange(event.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></select>
  </div>;
}

export default function RobinsonStadiumEditor() {
  const club = useClubContext();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<RobinsonSnapshot | null>(null), [draft, setDraft] = useState<RobinsonContent | null>(null);
  const [media, setMedia] = useState<RobinsonSnapshot["media"]>([]), [uploads, setUploads] = useState<string[]>([]), [pending, setPending] = useState<RobinsonSaveRequest | null>(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<RobinsonImageSlot | null>(null), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [ticketing, setTicketing] = useState<StadiumTicketing>(emptyTicketsContent());
  const [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const [confirmReload, setConfirmReload] = useState(false), [leaveTo, setLeaveTo] = useState<string | null>(null), [previewPhone, setPreviewPhone] = useState(false);
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
  /** Leaving for another admin page asks first when there is an unsaved draft (the same decision the native confirm made). */
  function guardLink(event: MouseEvent<HTMLAnchorElement>) {
    if (locked) { event.preventDefault(); return; }
    if (!dirty) return;
    event.preventDefault();
    setLeaveTo(event.currentTarget.getAttribute("href"));
  }
  /** Resolves true only when the server committed the save, so the Save button can show Saved. */
  async function save(): Promise<boolean> {
    if (!draft || !snapshot || busy || uploading) return false;
    const parsed = robinsonSaveSchema.safeParse(pending ?? { operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: unusedUploads(uploads, draft) });
    if (!parsed.success) { setFailed(true); setMessage("Review the fields before saving. Each Directions section needs its own anchor."); return false; }
    const request = parsed.data, generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setMessage(`Saving ${PAGE}…`);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, uploads })); } catch {}
    const result = await saveVisitorPageEditor<RobinsonContent>("robinson", request);
    if (generation !== epoch.current) return false;
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? emptyRobinsonContent()); setMedia(result.snapshot.media);
      setUploads([]); setPending(null); setMessage(result.snapshot.cleanupPending ? `${PAGE} saved. Image cleanup will retry automatically.` : `${PAGE} saved.`); clearRecovery();
      return true;
    } else if (result.status === "uncertain") { setPending(result.request); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setMessage(result.message); }
    return false;
  }
  /** Reload asks first when there are unsaved edits (the same decision the native confirm made). */
  function requestReload() {
    if (locked) return;
    if (dirty) setConfirmReload(true);
    else void reload();
  }
  async function reload() {
    if (locked) return;
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
  const saveAction = useSaveState({
    isDirty: dirty || !!pending || uploads.length > 0,
    onSave: async () => { if (!(await save())) throw new Error(`${PAGE} was not saved.`); },
  });

  const page = draft ? hydrateRobinsonContent(draft, media) : null;
  const imageSlot = (slot: RobinsonImageSlot, label: string, hint?: string) => draft && page && <EditorGroup key={slot} legend={label}>
    <EditorImage label={label} url={page.images[slot].url} alt={draft.images[slot].alt} accept="image/png,image/webp" empty="No image. Nothing shows here on the page."
      uploading={uploading === slot} disabled={locked} hasImage={!!page.images[slot].url} onFile={file => void upload(slot, file)}
      onRemove={() => change(content => setImage(content, slot, null))} removeDisabled={locked || !draft.images[slot].assetId} />
    <EditorField label="Image description" value={draft.images[slot].alt} max={1000} disabled={locked} hint={hint}
      onChange={alt => change(content => ({ ...content, images: { ...content.images, [slot]: { ...content.images[slot], alt } } }))} />
  </EditorGroup>;
  const panel = (section: Section, title: string, children: ReactNode, description?: ReactNode) => draft && <EditorSection key={section} title={title} description={description}
    aside={<EditorSwitch checked={draft[section].visible} disabled={locked} label={`Show ${title} on the page`} onChange={visible => patch(section, { visible } as Partial<RobinsonContent[typeof section]>)} />}>
    <div className={kit.stack}>{children}</div>
  </EditorSection>;
  const saveState = heldSaveState(saveAction.state, busy || !!uploading);

  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader eyebrow="Public website" title={PAGE} description="This page is unavailable for the current website design." /></AdminPage>;
  return <AdminPage className={kit.page}>
    <AdminPageHeader eyebrow="Public website" title={PAGE} description="Edit the Robinson Stadium page. Save applies all changes together." actions={<EditorPageLink href="/stadium">Open Stadium page</EditorPageLink>} />
    {message && <EditorNotice failed={failed}>{message}</EditorNotice>}
    {!draft || !page || loadedClubId !== club.id ? <EditorLoading label={`Loading ${PAGE}…`} failed={failed} onRetry={() => location.reload()} /> : <>
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
        {draft.info.rows.map((row, index) => <EditorGroup key={index} legend={`Row ${index + 1}`}><div className="grid min-w-0 gap-4 md:grid-cols-[1fr_10rem]">
          <TextField label="Label" value={row.label} max={120} disabled={locked} onChange={label => patch("info", { rows: draft.info.rows.map((current, position) => position === index ? { ...current, label } : current) })} />
          <YesNoField label="Value" value={row.available} disabled={locked} onChange={available => patch("info", { rows: draft.info.rows.map((current, position) => position === index ? { ...current, available } : current) })} />
          <div className="md:col-span-2"><EditorReorderButtons index={index} length={draft.info.rows.length} disabled={locked} noun="row" onMove={delta => patch("info", { rows: moveItem(draft.info.rows, index, delta) })} onRemove={() => patch("info", { rows: removeItem(draft.info.rows, index) })} /></div>
        </div></EditorGroup>)}
        <div><EditorActionButton disabled={locked || draft.info.rows.length >= MAX_ROBINSON_INFO_ROWS} onClick={() => change(addInfoRow)}>Add row</EditorActionButton></div>
      </>)}
      {panel("match", "Next home match", imageSlot("partner", "Partner logo under the match"), <>Match wording comes from <Link className={kit.inlineLink} href="/admin/homepage" onClick={guardLink}>Homepage</Link>, fixtures from <Link className={kit.inlineLink} href="/admin/schedule" onClick={guardLink}>Schedule</Link>, and the purchase link from <Link className={kit.inlineLink} href="/admin/tickets" onClick={guardLink}>Tickets</Link>.</>)}
      {panel("lockers", "Lockers image", imageSlot("lockers", "Lockers image", "Decorative. Leave the description empty unless the image carries information."))}
      {panel("food", "Food & Beverage", <>
        <TextField label="Heading" value={draft.food.heading} max={120} disabled={locked} onChange={heading => patch("food", { heading })} />
        {imageSlot("mealPass", "Meal pass")}
        <TextField label="Text" value={draft.food.body} max={4000} multiline disabled={locked} hint="Line breaks show on desktop." onChange={body => patch("food", { body })} />
        <div className="grid gap-5 md:grid-cols-3">{draft.food.steps.map((step, index) => <div key={index} className="grid min-w-0 gap-2">
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
        {draft.directions.blocks.map((block, index) => <EditorGroup key={block.id} legend={`Section ${index + 1}`}>
          <TextField label="Heading" value={block.heading} max={120} disabled={locked} hint={`Page link: /stadium#${block.id}`} onChange={heading => change(content => updateBlock(content, index, { heading }))} />
          <TextList label="Paragraph" items={block.paragraphs} max={MAX_ROBINSON_PARAGRAPHS} disabled={locked} onChange={paragraphs => change(content => updateBlock(content, index, { paragraphs }))} />
          <TextField label="Italic note" value={block.note} max={4000} multiline disabled={locked} onChange={note => change(content => updateBlock(content, index, { note }))} />
          <TextList label="Bullet" items={block.bullets} max={MAX_ROBINSON_BULLETS} disabled={locked} onChange={bullets => change(content => updateBlock(content, index, { bullets }))} />
          <TextField label="Closing line" value={block.closing} max={4000} multiline disabled={locked} hint="Shown on its own line after the bullets." onChange={closing => change(content => updateBlock(content, index, { closing }))} />
          <EditorReorderButtons index={index} length={draft.directions.blocks.length} disabled={locked} noun="section" onMove={delta => patch("directions", { blocks: moveItem(draft.directions.blocks, index, delta) })} onRemove={() => patch("directions", { blocks: removeItem(draft.directions.blocks, index) })} />
        </EditorGroup>)}
        <div><EditorActionButton disabled={locked || draft.directions.blocks.length >= MAX_ROBINSON_BLOCKS} onClick={() => change(addBlock)}>Add section</EditorActionButton></div>
      </>, "The Stadium parking menu link opens the section whose page link ends in #parking-lot-no-5.")}
      <p className={kit.note}>Images: PNG or WebP, up to 5 MB and 3000 pixels per side.</p>
      <EditorPreview phone={previewPhone} onPhoneChange={setPreviewPhone}>
        <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={PAGE}><CinematicShell contentOnly initialContent={shared}><CinematicRobinson content={page} ticketing={ticketing} /></CinematicShell></HomepagePreviewFrame>
      </EditorPreview>
      <EditorSaveBar state={saveState} retry={!!pending} onSave={() => { void saveAction.save().catch(() => undefined); }}
        status={pending ? "Awaiting save confirmation" : saveState === "dirty" ? "Unsaved changes" : ""}>
        <EditorSecondaryButton disabled={locked} onClick={requestReload}>Reload saved page</EditorSecondaryButton>
      </EditorSaveBar>
    </>}
    <AdminConfirmDialog open={confirmReload} title="Discard your edits?" confirmLabel="Discard and reload" destructive
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
      Discard unsaved {PAGE} edits and load the saved page?
    </AdminConfirmDialog>
    <AdminConfirmDialog open={leaveTo !== null} title="Leave this page?" confirmLabel="Leave page"
      onCancel={() => setLeaveTo(null)} onConfirm={() => { const href = leaveTo; setLeaveTo(null); if (href) router.push(href); }}>
      Your unsaved {PAGE} draft will be kept on this browser.
    </AdminConfirmDialog>
  </AdminPage>;
}
