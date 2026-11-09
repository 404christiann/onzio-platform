"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { Button } from "@/components/ui/button";
import NativeImage from "@/components/ResilientNativeImage";
import CinematicShell from "@/components/cinematic/CinematicShell";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { createClient } from "@/lib/admin-client";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { loadVisitorPageEditor, saveVisitorPageEditor } from "@/lib/visitor-page-editor";
import {
  TICKET_PAGE_PATHS, emptyTicketPageContent, ticketPageView, ticketPageDraftFingerprint, ticketPageSaveSchema, ticketPageSchemas,
  type TicketPageContent, type TicketPageKey, type TicketPageSaveRequest, type TicketPageSnapshot, type TicketPageView,
} from "@/lib/cinematic-ticket-pages-content";
import { moveItem, removeItem, appendItem } from "@/lib/cinematic-robinson-editor";
import { setTicketPageImage, unusedTicketPageUploads } from "@/lib/cinematic-ticket-pages-editor";
import "@/components/admin/homepage/homepage-editor.css";

export function TextField({ label, value, max, disabled, multiline, hint, onChange }: { label: string; value: string; max: number; disabled: boolean; multiline?: boolean; hint?: string; onChange: (value: string) => void }) {
  return <label className="block space-y-2"><span className="text-sm font-medium">{label}</span>
    {multiline ? <textarea className={ADMIN_INPUT_CLASS + " min-h-28"} disabled={disabled} value={value} maxLength={max} onChange={event => onChange(event.target.value)} />
      : <input className={ADMIN_INPUT_CLASS} disabled={disabled} value={value} maxLength={max} onChange={event => onChange(event.target.value)} />}
    {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>;
}

export function MoveButtons({ index, length, disabled, noun, onMove, onRemove }: { index: number; length: number; disabled: boolean; noun: string; onMove: (delta: -1 | 1) => void; onRemove: () => void }) {
  return <div className="flex flex-wrap gap-2">
    <Button className="min-h-11" variant="outline" disabled={disabled || index === 0} onClick={() => onMove(-1)}>Move up</Button>
    <Button className="min-h-11" variant="outline" disabled={disabled || index === length - 1} onClick={() => onMove(1)}>Move down</Button>
    <Button className="min-h-11" variant="outline" disabled={disabled} onClick={onRemove}>Remove {noun} {index + 1}</Button>
  </div>;
}

/** A list of plain text lines (bullet points) with add, reorder and remove. */
export function TextList({ label, items, max, maxLength, disabled, onChange }: { label: string; items: string[]; max: number; maxLength: number; disabled: boolean; onChange: (items: string[]) => void }) {
  return <div className="space-y-4">{items.map((item, index) => <div key={index} className="space-y-2">
    <TextField label={`${label} ${index + 1}`} value={item} max={maxLength} disabled={disabled} onChange={value => onChange(items.map((current, position) => position === index ? value : current))} />
    <MoveButtons index={index} length={items.length} disabled={disabled} noun={label.toLowerCase()} onMove={delta => onChange(moveItem(items, index, delta))} onRemove={() => onChange(removeItem(items, index))} />
  </div>)}
    <Button className="min-h-11" variant="outline" disabled={disabled || items.length >= max} onClick={() => onChange(appendItem(items, "", max))}>Add {label.toLowerCase()}</Button>
  </div>;
}

export type TicketFieldsApi<K extends TicketPageKey> = {
  draft: TicketPageContent<K>;
  view: TicketPageView<K>;
  locked: boolean;
  change: (edit: (content: TicketPageContent<K>) => TicketPageContent<K>) => void;
  /** Upload, describe or remove the image in one slot. Empty slots say they are waiting for a file. */
  imageSlot: (slot: string, label: string, hint?: string) => ReactNode;
  visibleToggle: (checked: boolean, onChange: (visible: boolean) => void) => ReactNode;
};

export function SectionPanel({ title, description, toggle, children }: { title: string; description?: ReactNode; toggle?: ReactNode; children: ReactNode }) {
  return <AdminPanel>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{toggle}</div>
    <div className="space-y-5">{children}</div>
  </AdminPanel>;
}

const mediaSchema = z.array(z.object({ id: z.uuid(), storage_bucket: z.string(), storage_path: z.string(), width: z.number(), height: z.number() }).strict());

/** Shared load / draft recovery / upload / atomic save shell for the two Tickets-menu pages (RC2027-TICKET-PAGES). */
export default function TicketPageEditor<K extends TicketPageKey>({ pageKey, title, description, fields, preview }: {
  pageKey: K; title: string; description: string;
  fields: (api: TicketFieldsApi<K>) => ReactNode;
  preview: (view: TicketPageView<K>) => ReactNode;
}) {
  const club = useClubContext();
  const saveSchema = ticketPageSaveSchema(pageKey);
  const recoverySchema = z.object({
    content: ticketPageSchemas[pageKey], revision: z.string().regex(/^[0-9]+$/), designRevision: z.string(),
    pending: saveSchema.nullable(), uploads: z.array(z.uuid()), media: mediaSchema,
  }).strict();
  const [snapshot, setSnapshot] = useState<TicketPageSnapshot<K> | null>(null), [draft, setDraft] = useState<TicketPageContent<K> | null>(null);
  const [media, setMedia] = useState<TicketPageSnapshot<K>["media"]>([]), [uploads, setUploads] = useState<string[]>([]), [pending, setPending] = useState<TicketPageSaveRequest<K> | null>(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<string | null>(null), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [previewPhone, setPreviewPhone] = useState(false), [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const recoveryKey = useRef<string | null>(null), epoch = useRef(0);
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const fingerprint = (content: TicketPageContent<K>) => { try { return ticketPageDraftFingerprint(pageKey, content); } catch { return JSON.stringify(content); } };
  const dirty = !!draft && !!snapshot && fingerprint(draft) !== fingerprint(snapshot.content ?? emptyTicketPageContent(pageKey));
  const locked = busy || !!pending || !!uploading;

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setMedia([]); setUploads([]);
    setMessage(""); setFailed(false); setBusy(false); setUploading(null); setShared(null);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadVisitorPageEditor<TicketPageContent<K>>(pageKey), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id)])
      .then(([loaded, user, homepage]) => {
        if (!active) return;
        if (!user.data.user) throw new Error(`Sign in again to edit ${title}.`);
        const key = `onzio:${pageKey}:v1:${location.origin}:${user.data.user.id}:${club.id}`;
        recoveryKey.current = key;
        setShared(homepage); setLoadedClubId(club.id);
        type Stored = { content: TicketPageContent<K>; revision: string; designRevision: string; pending: TicketPageSaveRequest<K> | null; uploads: string[]; media: TicketPageSnapshot<K>["media"] };
        let stored = null as Stored | null;
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = recoverySchema.safeParse(JSON.parse(raw));
            if (parsed.success) stored = parsed.data as unknown as Stored;
            else localStorage.removeItem(key);
          }
        } catch {}
        setSnapshot(stored ? { ...loaded, revision: stored.revision, designRevision: stored.designRevision } : loaded);
        setDraft(stored?.content ?? loaded.content ?? emptyTicketPageContent(pageKey)); setMedia(stored?.media ?? loaded.media);
        setUploads(stored?.uploads ?? []); setPending(stored?.pending ?? null);
        if (stored) setMessage(stored.pending ? "An earlier save needs confirmation. Retry the same save." : `Your unsaved ${title} draft has been restored.`);
      }).catch(error => { if (active) { setMessage(error.message); setFailed(true); } });
    return () => { active = false; epoch.current += 1; };
    // recoverySchema is rebuilt every render from pageKey, which never changes for one editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club.id, club.presentationTemplateKey, pageKey, title]);
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

  const change = (edit: (value: TicketPageContent<K>) => TicketPageContent<K>) => {
    if (locked) return;
    setDraft(current => current && edit(current));
    setMessage(""); setFailed(false);
  };
  async function save() {
    if (!draft || !snapshot || busy || uploading) return;
    const parsed = saveSchema.safeParse(pending ?? { operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: unusedTicketPageUploads(uploads, draft) });
    if (!parsed.success) { setFailed(true); setMessage("Review the fields before saving. Links must start with https://, mailto: or / (a page on this site)."); return; }
    const request = parsed.data as TicketPageSaveRequest<K>, generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setMessage(`Saving ${title}…`);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, uploads })); } catch {}
    const result = await saveVisitorPageEditor<TicketPageContent<K>>(pageKey, request);
    if (generation !== epoch.current) return;
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(result.snapshot.content ?? emptyTicketPageContent(pageKey)); setMedia(result.snapshot.media);
      setUploads([]); setPending(null); setMessage(result.snapshot.cleanupPending ? `${title} saved. Image cleanup will retry automatically.` : `${title} saved.`); clearRecovery();
    } else if (result.status === "uncertain") { setPending(result.request as TicketPageSaveRequest<K>); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setMessage(result.message); }
  }
  async function reload() {
    if (locked || (dirty && !window.confirm(`Discard unsaved ${title} edits and load the saved page?`))) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const loaded = await loadVisitorPageEditor<TicketPageContent<K>>(pageKey);
      if (generation !== epoch.current) return;
      setSnapshot(loaded); setDraft(loaded.content ?? emptyTicketPageContent(pageKey)); setMedia(loaded.media); setUploads([]); setMessage(""); setFailed(false); clearRecovery();
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : `Unable to reload ${title}.`); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }
  async function upload(slot: string, file: File) {
    if (!draft || locked) return;
    const generation = epoch.current;
    setUploading(slot); setFailed(false); setMessage("Adding your image…");
    try {
      const result = await createClient().storage.from("homepage-artwork").upload(`${pageKey}/` + crypto.randomUUID(), file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Image upload failed.");
      const bitmap = await createImageBitmap(file), dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (generation !== epoch.current) return;
      const id = result.data.assetId;
      setMedia(current => [...current, { id, storage_bucket: "onzio-media", storage_path: result.data.path, ...dimensions }]);
      setUploads(current => [...current, id]);
      // Upload locks manual editing. Apply its one confirmed identity directly.
      setDraft(current => current && setTicketPageImage(current, slot, id));
      setMessage(`Image ready. Save ${title} to use it.`);
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to add this image. Choose it again to retry."); } }
    finally { if (generation === epoch.current) setUploading(null); }
  }

  const view: TicketPageView<K> | null = draft ? ticketPageView(draft, media) : null;
  const imageSlot = (slot: string, label: string, hint?: string) => draft && view && draft.images[slot] && <fieldset className="min-w-0 space-y-3 rounded-lg border border-border p-4" key={slot}>
    <legend className="px-1 text-sm font-medium">{label}</legend>
    {view.images[slot]?.url ? <NativeImage src={view.images[slot].url!} alt={draft.images[slot].alt} style={{ height: 96, width: "100%", objectFit: "contain" }} />
      : <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">Waiting for an image. Nothing shows here on the public page until you add one.</p>}
    <label className="block space-y-2"><span className="text-sm">{uploading === slot ? "Adding image…" : view.images[slot]?.url ? `Replace ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}</span><input className={ADMIN_INPUT_CLASS} type="file" accept="image/png,image/webp" disabled={locked} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(slot, file); event.target.value = ""; }} /></label>
    <TextField label="Image description" value={draft.images[slot].alt} max={1000} disabled={locked} hint={hint ?? "Leave empty when the text next to the image already says the same thing."} onChange={alt => change(content => ({ ...content, images: { ...content.images, [slot]: { ...content.images[slot], alt } } }))} />
    <Button className="min-h-11" variant="outline" disabled={locked || !draft.images[slot].assetId} onClick={() => change(content => setTicketPageImage(content, slot, null))}>Remove image</Button>
  </fieldset>;
  const visibleToggle = (checked: boolean, onChange: (visible: boolean) => void) => <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={locked} checked={checked} onChange={event => onChange(event.target.checked)} />Show on page</label>;

  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader title={title} description="This page is unavailable for the current website design." /></AdminPage>;
  return <AdminPage className="pb-24"><AdminPageHeader title={title} description={description} actions={<Link className="text-primary underline" href={TICKET_PAGE_PATHS[pageKey]} target="_blank">Open {title} page</Link>} />
    {message && <div className={failed ? "rounded-lg border border-destructive p-4 text-sm" : "rounded-lg border border-border p-4 text-sm"} role={failed ? "alert" : "status"}>{message}</div>}
    {!draft || !view || loadedClubId !== club.id ? <AdminPanel><p role="status">Loading {title}…</p>{failed && <Button onClick={() => location.reload()}>Try again</Button>}</AdminPanel> : <>
      {fields({ draft, view, locked, change, imageSlot, visibleToggle })}
      <p className="text-sm text-muted-foreground">Images: PNG or WebP, up to 5 MB and 3000 pixels per side.</p>
      <AdminPanel><details><summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">Preview current edits</summary><p className="mt-2 text-sm text-muted-foreground">Dashed boxes mark images still to add. Visitors never see them.</p><div className="my-4 flex gap-3"><Button className="min-h-11" variant={!previewPhone ? "default" : "outline"} onClick={() => setPreviewPhone(false)}>Desktop</Button><Button className="min-h-11" variant={previewPhone ? "default" : "outline"} onClick={() => setPreviewPhone(true)}>Phone</Button></div><div className="overflow-auto rounded-lg border border-border" style={{ "--hp-viewport": "100dvh" } as CSSProperties}><div style={{ width: previewPhone ? 390 : 1280 }}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={title}><CinematicShell contentOnly initialContent={shared}>{preview(view)}</CinematicShell></HomepagePreviewFrame></div></div></details></AdminPanel>
      <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"><Button className="min-h-11" disabled={busy || !!uploading || (!dirty && !pending && !uploads.length)} onClick={() => void save()}>{busy ? "Saving…" : pending ? "Retry same save" : `Save ${title}`}</Button><Button className="min-h-11" variant="outline" disabled={locked} onClick={() => void reload()}>Reload saved page</Button><span className="self-center text-sm text-muted-foreground">{pending ? "Awaiting save confirmation" : dirty ? "Unsaved changes" : "All changes saved"}</span></div>
    </>}
  </AdminPage>;
}
