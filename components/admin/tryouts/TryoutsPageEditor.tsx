"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import FileUpload from "@/components/admin/FileUpload";
import ScaledTryoutsPreview from "@/components/admin/ScaledTryoutsPreview";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useClubContext } from "@/components/ClubContextProvider";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { createClient } from "@/lib/admin-client";
import type { DBContactProfile, DBProgram, DBRegistrationForm, DBTryout, DBTryoutsPageContent } from "@/lib/db-types";
import { mapTryout } from "@/lib/queries";
import {
  buildTryoutMutationPayload, buildTryoutsPageMutationPayload, emptyTryoutDraft,
  emptyTryoutsPageDraft, moveTryout, tryoutDraftToRow, tryoutsPageToDraft,
  tryoutToDraft, validateTryoutDraft, validateTryoutsPageDraft,
  type TryoutDraft, type TryoutValidationErrors, type TryoutsPageDraft,
  type TryoutsPageValidationErrors,
} from "@/lib/tryout-admin";
import { resolveTryoutsPageContent, TRYOUTS_PAGE_LIMITS } from "@/lib/tryouts-page-content";
import type { TryoutsPageSaveRequest } from "@/lib/tryouts-page-editor/contract";
import type { PublicRegistrationForm } from "@/lib/registration-public";

type EventDraft = TryoutDraft & { clientKey: string };
type DeletedEvent = { event: EventDraft; index: number };
type Snapshot = { revision: string; page: Partial<DBTryoutsPageContent>; events: DBTryout[];
  registrationForms?: Record<string, PublicRegistrationForm>;
  operation?: { status: "committed" | "not-committed"; receipt?: Snapshot } };
type ProgramOption = Pick<DBProgram, "id" | "display_title">;
type FormOption = Pick<DBRegistrationForm, "id" | "title" | "status">;

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function getSnapshot(operationId?: string): Promise<Snapshot> {
  const response = await fetch(`/api/admin/tryouts-page${operationId ? `?operationId=${encodeURIComponent(operationId)}` : ""}`,
    { cache: "no-store" });
  const body = await response.json() as Snapshot & { error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Unable to load Tryouts page");
  return body;
}

function fromSnapshot(row: DBTryout): EventDraft {
  return { ...tryoutToDraft(row), clientKey: row.id };
}

function ordered(events: EventDraft[]): EventDraft[] {
  return events.map((event, sortOrder) => ({ ...event, sortOrder }));
}

const PHONE_PREVIEW_QUERY = "(max-width: 767px)";
function subscribePhoneViewport(listener: () => void) {
  const query = window.matchMedia(PHONE_PREVIEW_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function isPhoneViewport() { return window.matchMedia(PHONE_PREVIEW_QUERY).matches; }
function serverPhoneViewport() { return false; }

export default function TryoutsPageEditor() {
  const club = useClubContext();
  if (club.presentationTemplateKey !== "academy@1" && club.presentationTemplateKey !== "editorial@1") {
    return <AdminPage><AdminPageHeader eyebrow="Public website" title="Tryouts"
      description="This website design does not publish a Tryouts page." />
      <p className="rounded-xl border border-border bg-card p-6 font-body text-sm text-muted-foreground">Choose a supported website design before editing a public Tryouts page.</p>
    </AdminPage>;
  }
  return <TryoutsPageEditorContent />;
}

function TryoutsPageEditorContent() {
  const club = useClubContext();
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const isEditorial = club.presentationTemplateKey === "editorial@1";
  const showsProgramAndHeroFields = !isAcademy && !isEditorial;
  const showsHeroImage = isAcademy;
  const [events, setEvents] = useState<EventDraft[]>([]);
  const [deleted, setDeleted] = useState<DeletedEvent[]>([]);
  const [pageCopy, setPageCopy] = useState<TryoutsPageDraft>(emptyTryoutsPageDraft);
  const [pageDirty, setPageDirty] = useState(false);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [registrationForms, setRegistrationForms] = useState<FormOption[]>([]);
  const [nativeForms, setNativeForms] = useState<Record<string, PublicRegistrationForm>>({});
  const [contactEmail, setContactEmail] = useState("");
  const [revision, setRevision] = useState("0");
  const [selected, setSelected] = useState<string | null>(null);
  const narrowViewport = useSyncExternalStore(subscribePhoneViewport, isPhoneViewport, serverPhoneViewport);
  const [deviceChoice, setDeviceChoice] = useState<"auto" | "desktop" | "phone">("auto");
  const phone = deviceChoice === "auto" ? narrowViewport : deviceChoice === "phone";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageErrors, setPageErrors] = useState<TryoutsPageValidationErrors>({});
  const [eventErrors, setEventErrors] = useState<Record<string, TryoutValidationErrors>>({});
  const [unconfirmed, setUnconfirmed] = useState<TryoutsPageSaveRequest | null>(null);
  const [conflictSnapshot, setConflictSnapshot] = useState<Snapshot | null>(null);
  const [confirmation, setConfirmation] = useState<{ kind: "delete"; event: EventDraft } | { kind: "discard" } | null>(null);
  const [dialogContainer, setDialogContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setDialogContainer(document.querySelector<HTMLElement>(".admin-theme") ?? document.body);
  }, []);
  const toolsHeading = useRef<HTMLHeadingElement>(null);
  const unsavedUploads = useRef(new Set<string>());
  const mounted = useRef(false);
  const saveInFlight = useRef(false);
  const saveUnconfirmed = useRef(false);

  async function retireUnsavedUpload(assetId: string, silent = false) {
    if (!unsavedUploads.current.has(assetId)) return;
    try {
      const response = await fetch("/api/admin/media/cleanup", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      if (!response.ok) throw new Error("Could not remove the unused event photo.");
      unsavedUploads.current.delete(assetId);
    } catch {
      if (!silent && mounted.current) setError("An unused event photo could not be removed. Try again or leave this page to retry cleanup.");
    }
  }

  useEffect(() => {
    mounted.current = true;
    const uploads = unsavedUploads.current;
    return () => {
      mounted.current = false;
      // An in-flight or unconfirmed Save may have committed these assets. The
      // server receipt must settle it before they can be retired safely.
      if (saveInFlight.current || saveUnconfirmed.current) return;
      for (const assetId of uploads) {
        void fetch("/api/admin/media/cleanup", {
          method: "POST", credentials: "same-origin", keepalive: true,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }),
        }).catch(() => undefined);
      }
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [snapshot, programsResult, contactResult, formsResult] = await Promise.all([
        getSnapshot(),
        createClient().from("programs").select("id, display_title").order("sort_order", { ascending: true }),
        createClient().from("contact_profile").select("public_email").limit(1),
        createClient().from("registration_forms").select("id,title,status").order("title", { ascending: true }),
      ]);
      const queryError = programsResult.error ?? contactResult.error ?? formsResult.error;
      if (queryError) throw new Error(queryError.message);
      setEvents(snapshot.events.map(fromSnapshot));
      setPageCopy(tryoutsPageToDraft(snapshot.page));
      setPageDirty(false);
      setRevision(snapshot.revision);
      setPrograms((programsResult.data ?? []) as ProgramOption[]);
      setContactEmail(((contactResult.data ?? []) as Pick<DBContactProfile,"public_email">[])[0]?.public_email ?? "");
      setRegistrationForms((formsResult.data ?? []) as FormOption[]);
      setNativeForms(snapshot.registrationForms ?? {});
      setDeleted([]);
      setSelected(null);
      setPageErrors({});
      setEventErrors({});
      setDirty(false);
      saveUnconfirmed.current = false;
      setUnconfirmed(null);
      setConflictSnapshot(null);
    } catch (caught) { setError(message(caught, "Unable to load tryout events")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [club.id, load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const interceptNavigation = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.ownerDocument !== document) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      if (!window.confirm("Leave Tryouts? Your unsaved page changes will be lost.")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", interceptNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", interceptNavigation, true);
    };
  }, [dirty]);
  useEffect(() => {
    if (selected) toolsHeading.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  const selectedKey = selected?.startsWith("event:") ? selected.slice(6) : null;
  const selectedEvent = events.find((event) => event.clientKey === selectedKey) ?? null;
  const editor = { selected, onSelect: setSelected };

  function changePage<K extends keyof TryoutsPageDraft>(field: K, value: TryoutsPageDraft[K]) {
    if (unconfirmed) return;
    setPageCopy((current) => ({ ...current, [field]: value }));
    setPageErrors((current) => ({ ...current, [field]: undefined }));
    setPageDirty(true);
    setDirty(true); setSaved(false); setError(null);
  }
  function changeEvent<K extends keyof TryoutDraft>(field: K, value: TryoutDraft[K]) {
    if (!selectedEvent || unconfirmed) return;
    setEvents((current) => current.map((event) => event.clientKey === selectedEvent.clientKey ? { ...event, [field]: value } : event));
    setEventErrors((current) => ({ ...current, [selectedEvent.clientKey]: { ...current[selectedEvent.clientKey], [field]: undefined } }));
    setDirty(true); setSaved(false); setError(null);
  }
  function addEvent() {
    if (unconfirmed) return;
    const clientKey = crypto.randomUUID();
    setEvents((current) => [...current, { ...emptyTryoutDraft(current.length), clientKey }]);
    setSelected(`event:${clientKey}`);
    setDirty(true); setSaved(false); setError(null);
  }
  function reorder(index: number, delta: -1 | 1) {
    if (unconfirmed) return;
    setEvents((current) => moveTryout(current, index, delta) as EventDraft[]);
    setDirty(true); setSaved(false); setError(null);
  }
  function stageDelete(event: EventDraft) {
    if (unconfirmed) return;
    const index = events.findIndex((item) => item.clientKey === event.clientKey);
    setEvents((current) => ordered(current.filter((item) => item.clientKey !== event.clientKey)));
    setDeleted((current) => [...current, { event, index }]);
    setSelected(null);
    setDirty(true); setSaved(false); setError(null);
  }
  function undoDelete() {
    if (unconfirmed) return;
    const last = deleted.at(-1);
    if (!last) return;
    setEvents((rows) => ordered([...rows.slice(0, last.index), last.event, ...rows.slice(last.index)]));
    setDeleted((current) => current.slice(0, -1));
    setSelected(`event:${last.event.clientKey}`);
    setDirty(true);
  }
  async function uploadHero(files: FileList | null) {
    const file = files?.[0];
    if (!file || !selectedEvent || unconfirmed) return;
    setUploading(true); setError(null);
    try {
      const client = createClient();
      const { data, error: uploadError } = await client.storage.from("tryouts").upload(`hero/${Date.now()}-${file.name}`, file);
      if (uploadError || !data?.assetId) throw new Error(uploadError?.message ?? "Upload failed");
      unsavedUploads.current.add(data.assetId);
      if (!mounted.current) { await retireUnsavedUpload(data.assetId, true); return; }
      const { data: publicData, error: publicError } = client.storage.from("tryouts").getPublicUrl(data.path);
      if (publicError || !publicData.publicUrl) {
        await retireUnsavedUpload(data.assetId);
        throw new Error(publicError?.message ?? "Upload failed");
      }
      if (selectedEvent.heroMediaAssetId && unsavedUploads.current.has(selectedEvent.heroMediaAssetId)) {
        void retireUnsavedUpload(selectedEvent.heroMediaAssetId);
      }
      changeEvent("heroMediaAssetId", data.assetId);
      changeEvent("heroMediaPreviewUrl", publicData.publicUrl);
    } catch (caught) { setError(message(caught, "Upload failed")); }
    finally { setUploading(false); }
  }

  function applySnapshot(snapshot: Snapshot, committed = true) {
    const retained = committed ? new Set(snapshot.events.map((event) => event.hero_media_asset_id)) : new Set<string>();
    for (const assetId of unsavedUploads.current) {
      if (retained.has(assetId)) unsavedUploads.current.delete(assetId);
      else void retireUnsavedUpload(assetId);
    }
    setEvents(snapshot.events.map(fromSnapshot));
    setPageCopy(tryoutsPageToDraft(snapshot.page));
    setPageDirty(false);
    setRevision(snapshot.revision);
    setNativeForms(snapshot.registrationForms ?? {});
    setDeleted([]); setSelected(null);
    setPageErrors({}); setEventErrors({});
    setDirty(false); setSaved(true); setError(null); setUnconfirmed(null);
    saveUnconfirmed.current = false;
    setConflictSnapshot(null);
  }

  async function savePage() {
    if ((!dirty && !unconfirmed) || saving || uploading || conflictSnapshot) return;
    if (!unconfirmed) {
      const copyErrors = validateTryoutsPageDraft(pageCopy);
      const rowErrors = Object.fromEntries(events.map((event) => [event.clientKey, validateTryoutDraft(event)]));
      setPageErrors(copyErrors); setEventErrors(rowErrors);
      if (Object.keys(copyErrors).length || Object.values(rowErrors).some((row) => Object.keys(row).length)) {
        const invalid = events.find((event) => Object.keys(rowErrors[event.clientKey]).length);
        setSelected(invalid ? `event:${invalid.clientKey}` : "intro");
        setError("Review the highlighted fields before saving.");
        return;
      }
    }
    const request: TryoutsPageSaveRequest = unconfirmed ?? {
      operationId: crypto.randomUUID(), expectedRevision: revision,
      page: pageDirty ? buildTryoutsPageMutationPayload(pageCopy) as Exclude<TryoutsPageSaveRequest["page"], null> : null,
      events: events.map((event, sort_order) => ({
        ...buildTryoutMutationPayload({ ...event, sortOrder: sort_order }), id: event.id, sort_order,
      })) as TryoutsPageSaveRequest["events"],
      deletedIds: deleted.map(({ event }) => event.id).filter((id): id is string => Boolean(id)),
    };
    saveInFlight.current = true;
    setSaving(true); setSaved(false); setError(null);
    try {
      const response = await fetch("/api/admin/tryouts-page", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await response.json() as Snapshot & { error?: { message?: string; code?: string } };
      if (!response.ok) {
        if (response.status === 409 && body.error?.code === "TRYOUTS_CHANGED") {
          setError(body.error.message ?? "The public page changed. Review the latest version before saving.");
          try { setConflictSnapshot(await getSnapshot()); }
          catch { setError("The Tryouts page changed. Your draft is safe, but the latest page could not be loaded. Try again shortly."); }
        } else setError(body.error?.message ?? "Unable to save Tryouts page");
        saveUnconfirmed.current = false;
        setUnconfirmed(null);
        return;
      }
      applySnapshot(body);
    } catch {
      try {
        const check = await getSnapshot(request.operationId);
        if (check.operation?.status === "committed" && check.operation.receipt) applySnapshot(check);
        else { saveUnconfirmed.current = false; setUnconfirmed(null); setError("Save did not finish. Your changes are still here; try Save page again."); }
      } catch {
        saveUnconfirmed.current = true;
        setUnconfirmed(request);
        setError("Save status is unknown. Retry the exact save to confirm it. Your draft is locked until then.");
      }
    } finally { saveInFlight.current = false; setSaving(false); }
  }

  const previewTryouts = events.map((event) => mapTryout(tryoutDraftToRow({
    ...event, id: event.id ?? event.clientKey,
  }), contactEmail, event.registrationFormId ? nativeForms[event.registrationFormId] : undefined));
  const previewPageContent = resolveTryoutsPageContent(
    buildTryoutsPageMutationPayload(pageCopy) as Partial<DBTryoutsPageContent>);
  const canEdit = !saving && !uploading && !unconfirmed;

  return <AdminPage className="overflow-x-clip pb-24 lg:pb-8">
    <AdminPageHeader eyebrow="Public website" title="Tryouts"
      description="Tap the page introduction or an event card to edit what visitors see. One Save page publishes all changes together."
      actions={<div className="flex flex-wrap gap-2">
        <button type="button" onClick={addEvent} disabled={!canEdit || loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 font-display text-xs font-bold uppercase text-foreground hover:bg-accent disabled:opacity-40"><Plus size={16} />Add event</button>
        <button type="button" onClick={() => void savePage()} disabled={saving || uploading || Boolean(conflictSnapshot) || (!dirty && !unconfirmed)} className="min-h-11 rounded-lg bg-primary px-5 font-display text-xs font-bold uppercase text-primary-foreground disabled:opacity-40">{saving ? "Saving…" : "Save page"}</button>
      </div>} />
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <p className="font-body text-xs text-muted-foreground">Your public <strong className="text-foreground">/tryouts</strong> page · {events.length} {events.length === 1 ? "event" : "events"}{dirty ? " · Unsaved changes" : ""}</p>
      <div role="group" aria-label="Preview device" className="flex rounded-lg border border-border p-1">
        <button type="button" aria-pressed={!phone} onClick={() => setDeviceChoice("desktop")} className={`min-h-10 rounded-md px-3 font-body text-xs ${!phone ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Desktop</button>
        <button type="button" aria-pressed={phone} onClick={() => setDeviceChoice("phone")} className={`min-h-10 rounded-md px-3 font-body text-xs ${phone ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Phone</button>
      </div>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive">{error}</p>}
    {conflictSnapshot && <div className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-4 font-body text-sm" role="region" aria-label="Review changes from another editor">
      <p className="font-semibold text-foreground">Review the latest saved page</p>
      <p className="mt-1 text-muted-foreground">Your draft is still in the canvas. The saved page now has {conflictSnapshot.events.length} {conflictSnapshot.events.length === 1 ? "event" : "events"}: {conflictSnapshot.events.map((event) => event.headline || "Untitled event").join(", ") || "none"}.</p>
      <p className="mt-2 text-xs text-muted-foreground">Saved introduction with events: {conflictSnapshot.page.intro_with_tryouts || "template default"}</p>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setConfirmation({ kind: "discard" })} className="min-h-11 rounded-lg border border-border px-4 font-semibold">Use latest saved page</button><button type="button" onClick={() => { setRevision(conflictSnapshot.revision); setConflictSnapshot(null); setError("Your draft is ready to save over the reviewed page. Select Save page to continue."); }} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">Keep my draft</button></div>
    </div>}
    {deleted.length > 0 && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 font-body text-sm"><span>{deleted.length === 1 ? `${deleted[0].event.headline || "Event"} will be deleted` : `${deleted.length} events will be deleted`} when you Save page.</span><button type="button" onClick={undoDelete} disabled={!canEdit} className="min-h-11 rounded-lg border border-border px-4 font-semibold text-foreground disabled:opacity-40">Undo</button></div>}
    {loading ? <div role="status" className="rounded-xl border border-border bg-card p-10 font-body text-sm text-muted-foreground">Loading tryout events…</div> :
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <div className="min-w-0">
        <ScaledTryoutsPreview tryouts={previewTryouts} clubName={club.name} contactEmail={contactEmail}
          content={previewPageContent} phone={phone} selected={selected} onSelect={editor.onSelect} />
        {events.length === 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card px-5 py-4"><div><p className="font-display text-sm font-bold text-foreground">No tryout events yet</p><p className="font-body text-xs text-muted-foreground">The public page shows the no-events introduction.</p></div><button type="button" onClick={addEvent} disabled={!canEdit} className="min-h-11 rounded-lg border border-border px-4 font-body text-sm font-semibold disabled:opacity-40">Add event</button></div>}
      </div>
      <aside className={`${selected ? "fixed inset-x-0 bottom-0 z-40 max-h-[78dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-card shadow-xl lg:sticky lg:inset-auto lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:rounded-xl lg:border" : "hidden lg:block"} min-w-0 self-start p-5`} aria-label="Selected section tools">
        {selected ? <>
          <div className="mb-5 flex items-start justify-between gap-3 border-b border-border pb-4">
            <div><p className="font-body text-xs text-muted-foreground">Public Tryouts page</p><h2 ref={toolsHeading} tabIndex={-1} className="mt-1 font-display text-lg font-black uppercase text-foreground">{selected === "intro" ? "Page introduction" : selected === "heading" ? "Page heading" : selectedEvent?.headline || "New tryout event"}</h2></div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Done editing section" className="inline-flex size-11 items-center justify-center rounded-lg border border-border text-foreground hover:bg-accent"><X size={18} /></button>
          </div>
          {selected === "heading" ? <p className="font-body text-sm leading-6 text-muted-foreground">The heading follows your website design and club name. Onzio manages this text.</p> :
          selected === "intro" ? <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-60"><p className="font-body text-xs leading-5 text-muted-foreground">The page shows one introduction when events are listed and the other when none are announced.</p>
            <Field label="Intro shown when tryouts are published" error={pageErrors.introWithTryouts}><Textarea value={pageCopy.introWithTryouts} onChange={(event) => changePage("introWithTryouts", event.target.value)} maxLength={TRYOUTS_PAGE_LIMITS.introWithTryouts} className="min-h-28" /></Field>
            <Field label="Intro shown when none are published" error={pageErrors.introNoTryouts}><Textarea value={pageCopy.introNoTryouts} onChange={(event) => changePage("introNoTryouts", event.target.value)} maxLength={TRYOUTS_PAGE_LIMITS.introNoTryouts} className="min-h-28" /></Field>
          </fieldset> : selectedEvent ? <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-60">
            <Field label="Name" error={eventErrors[selectedEvent.clientKey]?.headline}><input className={ADMIN_INPUT_CLASS} value={selectedEvent.headline} onChange={(event) => changeEvent("headline",event.target.value)} maxLength={80} /></Field>
            <Field label="Status"><NativeSelect value={selectedEvent.status} onChange={(event) => changeEvent("status",event.target.value as TryoutDraft["status"])}><NativeSelectOption value="upcoming">Upcoming</NativeSelectOption><NativeSelectOption value="open">Open</NativeSelectOption><NativeSelectOption value="closed">Closed</NativeSelectOption></NativeSelect></Field>
            {showsProgramAndHeroFields && <Field label="Program association"><NativeSelect value={selectedEvent.programId ?? ""} onChange={(event) => changeEvent("programId",event.target.value || null)}><NativeSelectOption value="">General club tryout</NativeSelectOption>{programs.map((program) => <NativeSelectOption key={program.id} value={program.id}>{program.display_title}</NativeSelectOption>)}</NativeSelect></Field>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><Field label="Event date" error={eventErrors[selectedEvent.clientKey]?.eventDate}><input type="date" className={ADMIN_INPUT_CLASS} value={selectedEvent.eventDate} onChange={(event) => changeEvent("eventDate",event.target.value)} /></Field><Field label="Location" error={eventErrors[selectedEvent.clientKey]?.location}><input className={ADMIN_INPUT_CLASS} value={selectedEvent.location} onChange={(event) => changeEvent("location",event.target.value)} maxLength={160} /></Field><Field label="Cost" error={eventErrors[selectedEvent.clientKey]?.costText}><input className={ADMIN_INPUT_CLASS} value={selectedEvent.costText} onChange={(event) => changeEvent("costText",event.target.value)} maxLength={120} /></Field></div>
            <p className="font-body text-xs leading-5 text-muted-foreground">Leave date, location, or cost blank to show TBA to visitors.</p>
            <Field label="Onzio registration form"><NativeSelect value={selectedEvent.registrationFormId ?? ""} onChange={(event) => changeEvent("registrationFormId",event.target.value || null)}><NativeSelectOption value="">No native form — use the destination below</NativeSelectOption>{registrationForms.map((form) => <NativeSelectOption key={form.id} value={form.id}>{form.title} — {form.status}</NativeSelectOption>)}</NativeSelect></Field>
            <p className="font-body text-xs leading-5 text-muted-foreground">An open form launches native registration. Draft, closed, or unselected forms preserve the external or contact fallback. Submissions remain in Registrations.</p>
            <Field label="Button text" error={eventErrors[selectedEvent.clientKey]?.ctaLabel}><input className={ADMIN_INPUT_CLASS} value={selectedEvent.ctaLabel} onChange={(event) => changeEvent("ctaLabel",event.target.value)} maxLength={40} /></Field>
            <Field label="External registration destination" error={eventErrors[selectedEvent.clientKey]?.registrationHref}><input className={ADMIN_INPUT_CLASS} value={selectedEvent.registrationHref} onChange={(event) => changeEvent("registrationHref",event.target.value)} maxLength={2048} placeholder="https://…" /></Field>
            <Field label="Closed message" error={eventErrors[selectedEvent.clientKey]?.closedMessage}><Textarea value={selectedEvent.closedMessage} onChange={(event) => changeEvent("closedMessage",event.target.value)} maxLength={320} className="min-h-24" /></Field>
            {showsHeroImage && <div><span className={ADMIN_LABEL_CLASS}>Event photo</span><FileUpload label="Upload event photo" accept="image/jpeg,image/png,image/webp" onUpload={(files) => void uploadHero(files)} uploading={uploading} previewUrl={selectedEvent.heroMediaPreviewUrl || null} onRemove={selectedEvent.heroMediaAssetId ? () => { const assetId = selectedEvent.heroMediaAssetId; changeEvent("heroMediaAssetId",null); changeEvent("heroMediaPreviewUrl",""); if (assetId && unsavedUploads.current.has(assetId)) void retireUnsavedUpload(assetId); } : undefined} disabled={!canEdit} /></div>}
            {showsHeroImage && <p className="font-body text-xs text-muted-foreground">The first event with a photo also supplies the Academy page hero.</p>}
            <div className="flex gap-2 border-t border-border pt-4"><button type="button" onClick={() => reorder(events.findIndex((event) => event.clientKey === selectedEvent.clientKey), -1)} disabled={events[0]?.clientKey === selectedEvent.clientKey} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-sm disabled:opacity-30"><ArrowUp size={16} />Move up</button><button type="button" onClick={() => reorder(events.findIndex((event) => event.clientKey === selectedEvent.clientKey), 1)} disabled={events.at(-1)?.clientKey === selectedEvent.clientKey} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-sm disabled:opacity-30"><ArrowDown size={16} />Move down</button></div>
            <button type="button" onClick={() => setConfirmation({ kind: "delete", event: selectedEvent })} className="min-h-11 w-full rounded-lg bg-destructive px-4 font-display text-xs font-bold uppercase text-destructive-foreground hover:bg-destructive/90">Delete event</button>
            <p className="font-body text-xs text-muted-foreground">Deletion is staged. Undo before Save page to keep the event.</p>
          </fieldset> : null}
          <div className="sticky bottom-0 mt-6 flex gap-2 border-t border-border bg-card pt-4 lg:hidden"><button type="button" onClick={() => setSelected(null)} className="min-h-11 flex-1 rounded-lg border border-border font-body text-sm font-semibold">Done</button><button type="button" onClick={() => void savePage()} disabled={saving || uploading || Boolean(conflictSnapshot) || (!dirty && !unconfirmed)} className="min-h-11 flex-1 rounded-lg bg-primary font-body text-sm font-semibold text-primary-foreground disabled:opacity-40">Save page</button></div>
        </> : <div className="py-14 text-center"><p className="font-display text-sm font-bold text-foreground">Tap a section to edit</p><p className="mt-2 font-body text-xs leading-5 text-muted-foreground">Select the introduction, a card, or the heading in the page preview.</p></div>}
      </aside>
    </div>}
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"><span className="font-body text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "Tryouts page"}</span><button type="button" onClick={() => void savePage()} disabled={saving || uploading || Boolean(conflictSnapshot) || (!dirty && !unconfirmed)} className="min-h-11 rounded-lg bg-primary px-5 font-body text-sm font-semibold text-primary-foreground disabled:opacity-40">{saving ? "Saving…" : "Save page"}</button></div>
    <AdminSaveFeedback saving={saving || uploading} saved={saved} savingLabel={uploading ? "Uploading hero image…" : "Saving Tryouts page…"} successLabel="Tryouts page saved" />
    <AlertDialog.Root open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }}>
      <AlertDialog.Portal container={dialogContainer}>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/45" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <AlertDialog.Popup className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <AlertDialog.Title className="font-display text-xl font-bold text-foreground">{confirmation?.kind === "delete" ? `Delete ${confirmation.event.headline || "this tryout event"}?` : "Use the latest saved page?"}</AlertDialog.Title>
            <AlertDialog.Description className="mt-3 font-body text-sm leading-6 text-muted-foreground">{confirmation?.kind === "delete" ? "The card will leave this preview. You can Undo before Save page applies the deletion." : "This replaces your unsaved Tryouts draft with the latest saved page."}</AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Close className="min-h-11 rounded-lg border border-border px-4 font-body text-sm font-semibold text-foreground">Cancel</AlertDialog.Close>
              <button type="button" onClick={() => {
                if (confirmation?.kind === "delete") stageDelete(confirmation.event);
                else if (confirmation?.kind === "discard" && conflictSnapshot) applySnapshot(conflictSnapshot, false);
                setConfirmation(null);
              }} className="min-h-11 rounded-lg bg-destructive px-4 font-body text-sm font-semibold text-destructive-foreground hover:bg-destructive/90">{confirmation?.kind === "delete" ? "Delete event" : "Replace draft"}</button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </AdminPage>;
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return <label className="block"><span className={`${ADMIN_LABEL_CLASS} mb-2 block`}>{label}</span>{children}{error && <span role="alert" className="mt-1.5 block font-body text-xs text-destructive">{error}</span>}</label>;
}
