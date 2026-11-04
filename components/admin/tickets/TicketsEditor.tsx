"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { Button } from "@/components/ui/button";
import NativeImage from "@/components/ResilientNativeImage";
import { createClient } from "@/lib/admin-client";
import { loadTicketsEditor, saveTicketsEditor } from "@/lib/tickets-editor";
import { TICKET_ARTWORK_SLOTS, isTicketPurchaseUrl, emptyTicketsContent, hydrateTicketsContent, ticketsDraftSchema, ticketsDraftFingerprint, ticketsSaveSchema, type TicketArtworkSlot, type TicketsContent, type TicketsSnapshot, type TicketsSaveRequest } from "@/lib/tickets-content";
import CinematicShell from "@/components/cinematic/CinematicShell";
import CinematicTickets from "@/components/cinematic/CinematicTickets";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import "@/components/admin/homepage/homepage-editor.css";
const recoverySchema = z.object({ content: ticketsDraftSchema, revision: z.string().regex(/^[0-9]+$/), designRevision: z.string(), pending: ticketsSaveSchema.nullable(), retired: z.array(z.uuid()), media: z.array(z.object({ id: z.uuid(), storage_bucket: z.string(), storage_path: z.string(), width: z.number(), height: z.number() })) });
const ART_LABELS: Record<TicketArtworkSlot, string> = { banner: "Ticket artwork", seat: "Seat icon", card: "Pay later icon", raffle: "Raffle icon", bus: "Bus", map: "Bus and parking map", partner: "Chick-fil-A / ticket partner" };
export default function TicketsEditor() {
    const club = useClubContext();
    const [snapshot, setSnapshot] = useState<TicketsSnapshot | null>(null), [draft, setDraft] = useState<TicketsContent | null>(null);
    const [media, setMedia] = useState<TicketsSnapshot["media"]>([]), [retired, setRetired] = useState<string[]>([]), [pending, setPending] = useState<TicketsSaveRequest | null>(null);
    const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<TicketArtworkSlot | null>(null), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
    const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [previewPhone, setPreviewPhone] = useState(true);
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
    if (club.presentationTemplateKey !== "cinematic@2")
        return <AdminPage><AdminPageHeader title="Tickets" description="This page is unavailable for the current website design."/></AdminPage>;
    const locked = busy || !!pending || !!uploading;
    const update = (edit: (value: TicketsContent) => void) => { setDraft(current => { if (!current)
        return current; const copy = structuredClone(current); edit(copy); return copy; }); setMessage(""); setFailed(false); };
    async function save() {
        if (!draft || !snapshot || uploading)
            return;
        const parsed = ticketsSaveSchema.safeParse(pending ?? { operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft, retiredMediaAssetIds: retired });
        if (!parsed.success) {
            setFailed(true);
            setMessage("Review the fields. The purchase link must be a full HTTPS URL.");
            return;
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
    }
    async function reload() {
        if (locked)
            return;
        if (dirty && !window.confirm("Discard unsaved Tickets edits and load the saved page?"))
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
    const field = (label: string, key: Exclude<keyof TicketsContent, "artwork" | "perkLabels" | "benefits" | "bannerHeightFraction">, multiline = false) => <label className="block space-y-2" key={key}><span className="text-sm font-medium">{label}</span>{multiline ? <textarea className={ADMIN_INPUT_CLASS + " min-h-28"} disabled={locked} value={draft?.[key] ?? ""} maxLength={4000} onChange={e => update(v => { v[key] = e.target.value; })}/> : <input className={ADMIN_INPUT_CLASS} aria-invalid={key === "purchaseUrl" && !!draft?.purchaseUrl && !isTicketPurchaseUrl(draft.purchaseUrl) ? true : undefined} aria-describedby={key === "purchaseUrl" ? "tickets-purchase-help" : undefined} disabled={locked} value={draft?.[key] ?? ""} maxLength={key === "purchaseUrl" ? 2000 : 120} onChange={e => update(v => { v[key] = e.target.value; })}/>}</label>;
    const page = draft ? hydrateTicketsContent(draft, media, false) : null;
    return <AdminPage className="pb-24"><AdminPageHeader title="Tickets" description="Edit ticket benefits, travel information and the purchase link. Save applies all changes together." actions={<Link className="text-primary underline" href="/tickets" target="_blank">Open Tickets page</Link>}/>
 <AdminPanel><p className="text-sm text-muted-foreground">Prices, ticket button text and the next-match announcement are shared with <Link className="text-primary underline" href="/admin/homepage">Homepage</Link>. Fixtures come from <Link className="text-primary underline" href="/admin/schedule">Schedule</Link>.</p></AdminPanel>
 {message && <div className={failed ? "rounded-lg border border-destructive p-4 text-sm" : "rounded-lg border border-border p-4 text-sm"} role={failed ? "alert" : "status"}>{message}</div>}
 {!draft || loadedClubId !== club.id ? <AdminPanel><p role="status">Loading Tickets…</p>{failed && <Button onClick={() => location.reload()}>Try again</Button>}</AdminPanel> : <>
 <AdminPanel><h2 className="mb-5 text-lg font-semibold">Page and purchase link</h2><div className="grid gap-5 md:grid-cols-2">{field("Page heading", "title")}{field("Subtitle", "subtitle")}{field("External ticket purchase URL", "purchaseUrl")}{field("Message until a purchase link is available", "missingPurchaseLabel")}</div><p id="tickets-purchase-help" className="mt-4 text-sm text-muted-foreground">Use the club’s full HTTPS purchase URL. An empty URL keeps Buy Tickets inactive.</p></AdminPanel>
 <AdminPanel><h2 className="mb-5 text-lg font-semibold">Perks</h2><div className="grid gap-5 md:grid-cols-2">{field("Perks heading", "perksHeading")}{draft.perkLabels.map((label, index) => <label className="block space-y-2" key={index}><span className="text-sm font-medium">Perk {index + 1} label</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={label} maxLength={120} onChange={e => update(v => { v.perkLabels[index] = e.target.value; })}/></label>)}</div></AdminPanel>
 <AdminPanel><h2 className="mb-5 text-lg font-semibold">Ticket includes</h2><div className="space-y-5">{field("Benefits heading", "includesHeading")}{draft.benefits.map((benefit, index) => <fieldset className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2" key={index}><legend className="px-1 text-sm">Benefit {index + 1}</legend><label className="block space-y-2"><span className="text-sm">Title</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={benefit.title} maxLength={120} onChange={e => update(v => { v.benefits[index].title = e.target.value; })}/></label><label className="block space-y-2"><span className="text-sm">Details</span><textarea className={ADMIN_INPUT_CLASS} disabled={locked} value={benefit.detail} maxLength={4000} onChange={e => update(v => { v.benefits[index].detail = e.target.value; })}/></label><Button variant="outline" disabled={locked} onClick={() => update(v => { v.benefits.splice(index, 1); })}>Remove benefit</Button></fieldset>)}<Button variant="outline" disabled={locked || draft.benefits.length >= 10} onClick={() => update(v => { v.benefits.push({ title: "", detail: "" }); })}>Add benefit</Button>{field("Benefits footnote", "benefitsNote", true)}</div></AdminPanel>
 <AdminPanel><h2 className="mb-5 text-lg font-semibold">Bus and parking</h2><div className="grid gap-5 md:grid-cols-2">{field("Bus section heading", "transitHeading")}{field("Bus section subtitle", "transitSubtitle")}{field("Directions heading", "directionsHeading")}{field("Directions", "directionsBody", true)}{field("Parking heading", "parkingHeading")}{field("Parking information", "parkingBody", true)}{field("Parking footnote", "parkingNote", true)}</div></AdminPanel>
 <AdminPanel><h2 className="mb-5 text-lg font-semibold">Images</h2><div className="grid gap-6 md:grid-cols-2">{TICKET_ARTWORK_SLOTS.map(slot => <fieldset className="min-w-0 space-y-3 rounded-lg border border-border p-4" key={slot}><legend className="px-1 text-sm font-medium">{ART_LABELS[slot]}</legend>{page?.artwork[slot].url && <NativeImage src={page.artwork[slot].url!} alt={draft.artwork[slot].alt} style={{ height: 120, width: "100%", objectFit: "contain", ...(slot === "seat" ? { filter: "brightness(0)" } : {}) }}/>}<label className="block space-y-2"><span className="text-sm">Replace {ART_LABELS[slot].toLowerCase()}</span><input className={ADMIN_INPUT_CLASS} type="file" accept="image/png,image/webp" disabled={locked} onChange={e => { const file = e.target.files?.[0]; if (file)
            void upload(slot, file); e.target.value = ""; }}/></label><label className="block space-y-2"><span className="text-sm">Image description</span><input className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.artwork[slot].alt} maxLength={1000} onChange={e => update(v => { v.artwork[slot].alt = e.target.value; })}/></label><Button variant="outline" disabled={locked || !draft.artwork[slot].assetId} onClick={() => { const id = draft.artwork[slot].assetId; if (id)
            setRetired(v => [...v, id]); update(v => { v.artwork[slot].assetId = null; }); }}>Remove image</Button>{slot === "banner" && <label className="block space-y-2"><span className="text-sm">Show ticket image height (%)</span><input className={ADMIN_INPUT_CLASS} type="number" min={50} max={100} step={0.1} value={Math.round(draft.bannerHeightFraction * 1000) / 10} disabled={locked} onChange={e => { const value = Number(e.target.value); if (value >= 50 && value <= 100)
            update(v => { v.bannerHeightFraction = value / 100; }); }}/><p className="text-xs text-muted-foreground">Reduce this only to hide blank space beneath the artwork. Replacement images start at 100%.</p></label>}</fieldset>)}</div><p className="mt-4 text-sm text-muted-foreground">PNG or WebP, up to 5 MB and 3000 pixels per side. Words in artwork change when you replace the image.</p></AdminPanel>
 <AdminPanel><details><summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">Preview current edits</summary><div className="my-4 flex gap-3"><Button variant={previewPhone ? "default" : "outline"} onClick={() => setPreviewPhone(true)}>Phone</Button><Button variant={!previewPhone ? "default" : "outline"} onClick={() => setPreviewPhone(false)}>Desktop</Button></div><div className="overflow-auto rounded-lg border border-border" style={{ "--hp-viewport": "100dvh" } as CSSProperties}><div style={{ width: previewPhone ? 390 : 1280 }}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="Tickets"><CinematicShell contentOnly initialContent={shared}><CinematicTickets content={page!}/></CinematicShell></HomepagePreviewFrame></div></div></details></AdminPanel>
 <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"><Button disabled={busy || !!uploading || (!dirty && !pending && !retired.length)} onClick={() => void save()}>{busy ? "Saving…" : pending ? "Retry same save" : "Save Tickets"}</Button><Button variant="outline" disabled={locked} onClick={() => void reload()}>Reload saved page</Button><span className="self-center text-sm text-muted-foreground">{pending ? "Awaiting save confirmation" : dirty ? "Unsaved changes" : "All changes saved"}</span></div>
 </>}
 </AdminPage>;
}
