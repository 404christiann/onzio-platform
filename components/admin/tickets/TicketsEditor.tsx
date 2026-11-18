"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import {
    EditorActionButton, EditorField, EditorGroup, EditorImage, EditorLoading, EditorNotice, EditorPageLink, EditorPreview, EditorRemoveButton,
    EditorSaveBar, EditorSecondaryButton, EditorSection, heldSaveState, kit,
} from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { createClient } from "@/lib/admin-client";
import { loadTicketsEditor, saveTicketsEditor } from "@/lib/tickets-editor";
import { TICKET_ARTWORK_SLOTS, isTicketPurchaseUrl, emptyTicketsContent, hydrateTicketsContent, ticketsDraftSchema, ticketsDraftFingerprint, ticketsSaveSchema, type TicketArtworkSlot, type TicketVisibilityKey, type TicketsContent, type TicketsSnapshot, type TicketsSaveRequest } from "@/lib/tickets-content";
import CinematicShell from "@/components/cinematic/CinematicShell";
import CinematicTickets from "@/components/cinematic/CinematicTickets";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import "@/components/admin/homepage/homepage-editor.css";
const recoverySchema = z.object({ content: ticketsDraftSchema, revision: z.string().regex(/^[0-9]+$/), designRevision: z.string(), pending: ticketsSaveSchema.nullable(), retired: z.array(z.uuid()), media: z.array(z.object({ id: z.uuid(), storage_bucket: z.string(), storage_path: z.string(), width: z.number(), height: z.number() })) });
const ART_LABELS: Record<TicketArtworkSlot, string> = { banner: "Ticket artwork", seat: "Seat icon", card: "Pay later icon", raffle: "Raffle icon", bus: "Bus", map: "Bus and parking map", partner: "Chick-fil-A / ticket partner" };
function BannerHeightField({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (fraction: number) => void }) {
    const id = useId();
    return <div className={kit.field}><label htmlFor={id}>Show ticket image height (%)</label><input id={id} type="number" min={50} max={100} step={0.1} value={Math.round(value * 1000) / 10} disabled={disabled} aria-describedby={`${id}-hint`} onChange={e => { const next = Number(e.target.value); if (next >= 50 && next <= 100)
            onChange(next / 100); }}/><span id={`${id}-hint`} className={kit.hint}>Reduce this only to hide blank space beneath the artwork. Replacement images start at 100%.</span></div>;
}
export default function TicketsEditor() {
    const club = useClubContext();
    const [snapshot, setSnapshot] = useState<TicketsSnapshot | null>(null), [draft, setDraft] = useState<TicketsContent | null>(null);
    const [media, setMedia] = useState<TicketsSnapshot["media"]>([]), [retired, setRetired] = useState<string[]>([]), [pending, setPending] = useState<TicketsSaveRequest | null>(null);
    const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<TicketArtworkSlot | null>(null), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
    const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [confirmReload, setConfirmReload] = useState(false), [previewPhone, setPreviewPhone] = useState(true);
    const recoveryKey = useRef<string | null>(null);
    const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
    const [loadedClubId, setLoadedClubId] = useState<string | null>(null);
    const dirty = !!draft && !!snapshot && ticketsDraftFingerprint(draft) !== ticketsDraftFingerprint(snapshot.content ?? emptyTicketsContent());
    useEffect(() => {
        let active = true;
        recoveryKey.current = null;
        setSnapshot(null);
        setDraft(null);
        setLoadedClubId(null);
        setPending(null);
        setMedia([]);
        setRetired([]);
        setMessage("");
        setFailed(false);
        if (club.presentationTemplateKey !== "cinematic@2")
            return;
        Promise.all([loadTicketsEditor(), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id)]).then(([loaded, user, homepage]) => {
            if (!active)
                return;
            if (!user.data.user)
                throw new Error("Sign in again to edit Tickets.");
            const key = `onzio:tickets:v1:${location.origin}:${user.data.user.id}:${club.id}`;
            recoveryKey.current = key;
            setShared(homepage);
            setLoadedClubId(club.id);
            let stored: z.infer<typeof recoverySchema> | null = null;
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = recoverySchema.safeParse(JSON.parse(raw));
                    if (parsed.success)
                        stored = parsed.data;
                    else
                        localStorage.removeItem(key);
                }
            }
            catch { }
            setSnapshot(stored ? { ...loaded, revision: stored.revision, designRevision: stored.designRevision } : loaded);
            setDraft(stored?.content ?? loaded.content ?? emptyTicketsContent());
            setMedia(stored?.media ?? loaded.media);
            setRetired(stored?.retired ?? []);
            setPending(stored?.pending ?? null);
            if (stored)
                setMessage(stored.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved Tickets draft has been restored.");
        }).catch(e => { if (active) {
            setMessage(e.message);
            setFailed(true);
        } });
        return () => { active = false; };
    }, [club.id, club.presentationTemplateKey]);
    useEffect(() => { if (!draft || !snapshot || !recoveryKey.current)
        return; try {
        if (dirty || pending || retired.length)
            localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending, media, retired }));
        else
            localStorage.removeItem(recoveryKey.current);
    }
    catch { /* Keep the current draft even if browser storage is full. */ } }, [draft, snapshot, dirty, pending, media, retired]);
    useEffect(() => { if (!dirty && !pending)
        return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, pending]);
    const saveAction = useSaveState({
        isDirty: dirty || !!pending || retired.length > 0,
        onSave: async () => { if (!(await save())) throw new Error("Tickets was not saved."); },
    });
    const locked = busy || !!pending || !!uploading;
    const update = (edit: (value: TicketsContent) => void) => { setDraft(current => { if (!current)
        return current; const copy = structuredClone(current); edit(copy); return copy; }); setMessage(""); setFailed(false); };
    /** Resolves true only when the server committed the save, so the Save button can show Saved. */
    async function save(): Promise<boolean> {
        if (!draft || !snapshot || uploading)
            return false;
        const parsed = ticketsSaveSchema.safeParse(pending ?? { operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: retired });
        if (!parsed.success) {
            setFailed(true);
            setMessage("Review the fields. The purchase link must be a full HTTPS URL.");
            return false;
        }
        const request = parsed.data;
        setPending(request);
        setBusy(true);
        setFailed(false);
        setMessage("Saving Tickets…");
        try {
            if (recoveryKey.current)
                localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, revision: snapshot.revision, designRevision: snapshot.designRevision, pending: request, media, retired }));
        }
        catch { }
        const result = await saveTicketsEditor(request);
        setBusy(false);
        if (result.status === "committed") {
            setSnapshot(result.snapshot);
            setDraft(result.snapshot.content ?? emptyTicketsContent());
            setMedia(result.snapshot.media);
            setRetired([]);
            setPending(null);
            setMessage(result.snapshot.cleanupPending ? "Tickets saved. Image cleanup will retry automatically." : "Tickets saved.");
            clearRecovery();
            return true;
        }
        else if (result.status === "uncertain") {
            setPending(result.request);
            setFailed(true);
            setMessage(result.message);
        }
        else {
            setPending(null);
            setFailed(true);
            setMessage(result.message);
        }
        return false;
    }
    /** Reload asks first when there are unsaved edits (the same decision the native confirm made). */
    function requestReload() {
        if (locked)
            return;
        if (dirty)
            setConfirmReload(true);
        else
            void reload();
    }
    async function reload() {
        if (locked)
            return;
        try {
            const loaded = await loadTicketsEditor();
            setSnapshot(loaded);
            setDraft(loaded.content ?? emptyTicketsContent());
            setMedia(loaded.media);
            setRetired([]);
            setMessage("");
            setFailed(false);
            clearRecovery();
        }
        catch (e) {
            setFailed(true);
            setMessage(e instanceof Error ? e.message : "Unable to reload Tickets.");
        }
    }
    async function upload(slot: TicketArtworkSlot, file: File) {
        if (!draft || locked)
            return;
        setUploading(slot);
        setFailed(false);
        setMessage("Adding your image…");
        try {
            const client = createClient(), bucket = client.storage.from("homepage-artwork");
            const result = await bucket.upload("tickets/" + crypto.randomUUID(), file);
            if (result.error || !result.data)
                throw new Error(result.error?.message ?? "Image upload failed.");
            const bitmap = await createImageBitmap(file);
            const dimensions = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
            const oldId = draft.artwork[slot].assetId;
            if (oldId && media.some(m => m.id === oldId) && !snapshot?.media.some(m => m.id === oldId))
                setRetired(current => [...current, oldId]);
            setMedia(current => [...current, { id: result.data.assetId, storage_bucket: "onzio-media", storage_path: result.data.path, ...dimensions }]);
            update(value => { value.artwork[slot].assetId = result.data.assetId; if (slot === "banner")
                value.bannerHeightFraction = 1; });
            setMessage("Image ready. Save Tickets to use it.");
        }
        catch (e) {
            setFailed(true);
            setMessage(e instanceof Error ? e.message : "Unable to add this image. Choose it again to retry.");
        }
        finally {
            setUploading(null);
        }
    }
    const field = (label: string, key: Exclude<keyof TicketsContent, "artwork" | "perkLabels" | "benefits" | "bannerHeightFraction" | TicketVisibilityKey>, multiline = false) => <EditorField key={key} label={label} value={draft?.[key] ?? ""} multiline={multiline} max={multiline ? 4000 : key === "purchaseUrl" ? 2000 : 120} disabled={locked}
        invalid={key === "purchaseUrl" && !!draft?.purchaseUrl && !isTicketPurchaseUrl(draft.purchaseUrl)} describedBy={key === "purchaseUrl" ? "tickets-purchase-help" : undefined}
        onChange={value => update(v => { v[key] = value; })}/>;
    const page = draft ? hydrateTicketsContent(draft, media, false) : null;
    const saveState = heldSaveState(saveAction.state, busy || !!uploading);
    if (club.presentationTemplateKey !== "cinematic@2")
        return <AdminPage><AdminPageHeader eyebrow="Public website" title="Tickets" description="This page is unavailable for the current website design."/></AdminPage>;
    return <AdminPage className={kit.page}><AdminPageHeader eyebrow="Public website" title="Tickets" description="Edit ticket benefits, travel information and the purchase link. Save applies all changes together." actions={<EditorPageLink href="/tickets">Open Tickets page</EditorPageLink>}/>
 <p className={kit.notice}>Prices, ticket button text and the next-match announcement are shared with <Link className={kit.inlineLink} href="/admin/homepage">Homepage</Link>. Fixtures come from <Link className={kit.inlineLink} href="/admin/schedule">Schedule</Link>.</p>
 {message && <EditorNotice failed={failed}>{message}</EditorNotice>}
 {!draft || loadedClubId !== club.id ? <EditorLoading label="Loading Tickets…" failed={failed} onRetry={() => location.reload()}/> : <>
 <EditorSection title="Page and purchase link"><div className="grid gap-5 md:grid-cols-2">{field("Page heading", "title")}{field("Subtitle", "subtitle")}{field("External ticket purchase URL", "purchaseUrl")}{field("Message until a purchase link is available", "missingPurchaseLabel")}</div><p id="tickets-purchase-help" className={kit.hint}>Use the club’s full HTTPS purchase URL. An empty URL keeps Buy Tickets inactive.</p></EditorSection>
 <EditorSection title="Perks"><div className="grid gap-5 md:grid-cols-2">{field("Perks heading", "perksHeading")}{draft.perkLabels.map((label, index) => <EditorField key={index} label={`Perk ${index + 1} label`} value={label} max={120} disabled={locked} onChange={value => update(v => { v.perkLabels[index] = value; })}/>)}</div></EditorSection>
 <EditorSection title="Ticket includes"><div className={kit.stack}>{field("Benefits heading", "includesHeading")}{draft.benefits.map((benefit, index) => <EditorGroup key={index} legend={`Benefit ${index + 1}`}><div className="grid min-w-0 gap-4 md:grid-cols-2"><EditorField label="Title" value={benefit.title} max={120} disabled={locked} onChange={value => update(v => { v.benefits[index].title = value; })}/><EditorField label="Details" value={benefit.detail} max={4000} multiline disabled={locked} onChange={value => update(v => { v.benefits[index].detail = value; })}/></div><div><EditorRemoveButton disabled={locked} onClick={() => update(v => { v.benefits.splice(index, 1); })}>Remove benefit {index + 1}</EditorRemoveButton></div></EditorGroup>)}<div><EditorActionButton disabled={locked || draft.benefits.length >= 10} onClick={() => update(v => { v.benefits.push({ title: "", detail: "" }); })}>Add benefit</EditorActionButton></div>{field("Benefits footnote", "benefitsNote", true)}</div></EditorSection>
 <EditorSection title="Bus and parking"><div className="grid gap-5 md:grid-cols-2">{field("Bus section heading", "transitHeading")}{field("Bus section subtitle", "transitSubtitle")}{field("Directions heading", "directionsHeading")}{field("Directions", "directionsBody", true)}{field("Parking heading", "parkingHeading")}{field("Parking information", "parkingBody", true)}{field("Parking footnote", "parkingNote", true)}</div></EditorSection>
 <EditorSection title="Images" description="PNG or WebP, up to 5 MB and 3000 pixels per side. Words in artwork change when you replace the image."><div className="grid gap-6 md:grid-cols-2">{TICKET_ARTWORK_SLOTS.map(slot => <EditorGroup key={slot} legend={ART_LABELS[slot]}><EditorImage label={ART_LABELS[slot]} url={page?.artwork[slot].url} alt={draft.artwork[slot].alt} accept="image/png,image/webp" empty="No image yet."
            tone={slot === "seat" ? "dark" : undefined} uploading={uploading === slot} disabled={locked} hasImage={!!page?.artwork[slot].url} onFile={file => void upload(slot, file)}
            onRemove={() => { const id = draft.artwork[slot].assetId; if (id)
                setRetired(v => [...v, id]); update(v => { v.artwork[slot].assetId = null; }); }} removeDisabled={locked || !draft.artwork[slot].assetId}/>
            <EditorField label="Image description" value={draft.artwork[slot].alt} max={1000} disabled={locked} onChange={value => update(v => { v.artwork[slot].alt = value; })}/>{slot === "banner" && <BannerHeightField value={draft.bannerHeightFraction} disabled={locked} onChange={fraction => update(v => { v.bannerHeightFraction = fraction; })}/>}</EditorGroup>)}</div></EditorSection>
 <EditorPreview phone={previewPhone} onPhoneChange={setPreviewPhone}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="Tickets"><CinematicShell contentOnly initialContent={shared}><CinematicTickets content={page!}/></CinematicShell></HomepagePreviewFrame></EditorPreview>
 <EditorSaveBar state={saveState} retry={!!pending} onSave={() => { void saveAction.save().catch(() => undefined); }} status={pending ? "Awaiting save confirmation" : saveState === "dirty" ? "Unsaved changes" : ""}>
            <EditorSecondaryButton disabled={locked} onClick={requestReload}>Reload saved page</EditorSecondaryButton>
 </EditorSaveBar>
 </>}
 <AdminConfirmDialog open={confirmReload} title="Discard your edits?" confirmLabel="Discard and reload" destructive onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
            Discard unsaved Tickets edits and load the saved page?
 </AdminConfirmDialog>
 </AdminPage>;
}
