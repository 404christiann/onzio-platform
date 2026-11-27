"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus } from "@/components/admin/icons";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import ScaledTryoutsPreview from "@/components/admin/ScaledTryoutsPreview";
import { AdminDialog, AdminDialogFooter } from "@/components/admin/ui/AdminDialog";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { AdminSaveButton } from "@/components/admin/ui/AdminSaveButton";
import { AdminPendingButton } from "@/components/admin/ui/AdminPendingButton";
import { AdminImageField } from "@/components/admin/ui/AdminImageField";
import { adminImageRules } from "@/components/admin/ui/adminImageFiles";
import { PreviewToggle } from "@/components/admin/ui/PreviewToggle";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { useDelayedLoading } from "@/components/admin/ui/useDelayedLoading";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { createClient } from "@/lib/admin-client";
import { clubToday } from "@/lib/club-time";
import type { DBContactProfile, DBProgram, DBRegistrationForm } from "@/lib/db-types";
import { submitPageSave } from "@/lib/page-editor-save";
import { capturePageEditorFocus } from "@/lib/page-editor-focus";
import { mapTryout } from "@/lib/queries";
import { compareTryoutsByDate } from "@/lib/sign-up-state";
import { emptyTryoutDraft, emptyTryoutsPageDraft, buildTryoutsPageMutationPayload,
  moveTryout, tryoutDraftToRow, tryoutsPageToDraft, validateTryoutDraft, validateTryoutsPageDraft,
  type TryoutDraft, type TryoutValidationErrors, type TryoutsPageDraft,
  type TryoutsPageValidationErrors } from "@/lib/tryout-admin";
import { resolveTryoutsPageContent, TRYOUTS_PAGE_LIMITS } from "@/lib/tryouts-page-content";
import { deletionCommand, eventFromSnapshot, orderedEvents, pageCommand, reconcileDeletedEvent,
  type EventDraft, type TryoutsCommand, type TryoutsSnapshot } from "./classic-tryouts-state";
import styles from "./classic-tryouts.module.css";
import { LINK_DESTINATION_HINT } from "@/lib/link-destination";

type ProgramOption = Pick<DBProgram, "id" | "display_title">;
type FormOption = Pick<DBRegistrationForm, "id" | "title" | "status">;
type Group = "when" | "signup" | "photo";
type Confirmation = { kind: "delete"; event: EventDraft } | { kind: "discard" } | { kind: "latest" };
const phoneQuery = "(max-width: 767px)";
function subscribePhone(listener: () => void) {
  const query = window.matchMedia(phoneQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function isPhone() { return window.matchMedia(phoneQuery).matches; }
function serverPhone() { return false; }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
async function readSnapshot(): Promise<TryoutsSnapshot> {
  const response = await fetch("/api/admin/tryouts-page", { cache: "no-store" });
  const result = await response.json() as TryoutsSnapshot & { error?: { message: string } };
  if (!response.ok) throw new Error(result.error?.message ?? "Unable to load tryout events");
  return result;
}

export default function ClassicTryoutsPageEditor({ policy }: { policy: { showProgramAndHeroFields: boolean; showHeroImageField: boolean } }) {
  const club = useClubContext();
  const { timeZone } = useAdminPortal();
  const today = clubToday(timeZone);
  const [confirmed, setConfirmed] = useState<TryoutsSnapshot | null>(null);
  const [events, setEvents] = useState<EventDraft[]>([]);
  const [pageCopy, setPageCopy] = useState<TryoutsPageDraft>(emptyTryoutsPageDraft);
  const [pageDirty, setPageDirty] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [contactEmail, setContactEmail] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [group, setGroup] = useState<Group>("when");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageErrors, setPageErrors] = useState<TryoutsPageValidationErrors>({});
  const [eventErrors, setEventErrors] = useState<Record<string, TryoutValidationErrors>>({});
  const [unconfirmed, setUnconfirmed] = useState<TryoutsCommand | null>(null);
  const [conflict, setConflict] = useState<TryoutsSnapshot | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState("");
  const narrow = useSyncExternalStore(subscribePhone, isPhone, serverPhone);
  const [device, setDevice] = useState<"desktop" | "phone" | null>(null);
  const phone = device ? device === "phone" : narrow;
  const phase = useDelayedLoading(loading);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const unsettled = useRef<TryoutsCommand | null>(null);
  const uploads = useRef(new Set<string>());
  const imagePending = useRef(false);
  const restoreFocus = useRef<(() => void) | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const current = useRef({ events, pageCopy, pageDirty, confirmed, dirty, conflict });
  current.current = { events, pageCopy, pageDirty, confirmed, dirty, conflict };
  const callbacks = useRef({ save: async () => false, discard: () => {} });
  const savedResult = useRef(false);
  const saveDisplay = useSaveState({
    isDirty: dirty || unconfirmed !== null,
    onSave: async () => {
      savedResult.current = await savePage();
      if (!savedResult.current) throw new Error("The Tryouts page has not been saved.");
    },
  });
  useUnsavedGuard({
    dirty: dirty || unconfirmed !== null,
    edited: "your Tryouts page",
    onSave: () => callbacks.current.save(),
    onDiscard: () => callbacks.current.discard(),
  });

  const selectedEvent = events.find((event) => selected === "event:" + event.clientKey) ?? null;
  const canEdit = !loading && !busy && !uploadPending && !unconfirmed && saveDisplay.state !== "saving";
  const groups = [
    { id: "when" as const, label: "When and where" }, { id: "signup" as const, label: "Sign-up" },
    ...(policy?.showHeroImageField ? [{ id: "photo" as const, label: "Photo" }] : []),
  ];

  async function retireUpload(assetId: string, silent = false) {
    if (!uploads.current.has(assetId)) return;
    try {
      const response = await fetch("/api/admin/media/cleanup", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      if (!response.ok) throw new Error("The unused event photo could not be removed.");
      uploads.current.delete(assetId);
    } catch {
      if (!silent && mounted.current) setError("An unused event photo could not be removed. Try again or leave this page to retry cleanup.");
    }
  }
  useEffect(() => {
    mounted.current = true;
    const owned = uploads.current;
    return () => {
      mounted.current = false;
      if (inFlight.current || unsettled.current) return;
      for (const assetId of owned) void fetch("/api/admin/media/cleanup", {
        method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }),
      }).catch(() => undefined);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [snapshot, programResult, contactResult, formResult] = await Promise.all([
        readSnapshot(),
        createClient().from("programs").select("id, display_title").order("sort_order", { ascending: true }),
        createClient().from("contact_profile").select("public_email").limit(1),
        createClient().from("registration_forms").select("id,title,status").order("title", { ascending: true }),
      ]);
      const queryError = programResult.error ?? contactResult.error ?? formResult.error;
      if (queryError) throw new Error(queryError.message);
      if (!mounted.current) return;
      setConfirmed(snapshot); setEvents(snapshot.events.map(eventFromSnapshot));
      setPageCopy(tryoutsPageToDraft(snapshot.page)); setPageDirty(false); setDirty(false);
      setPrograms((programResult.data ?? []) as ProgramOption[]);
      setForms((formResult.data ?? []) as FormOption[]);
      setContactEmail(((contactResult.data ?? []) as Pick<DBContactProfile, "public_email">[])[0]?.public_email ?? "");
      setPageErrors({}); setEventErrors({}); setSelected(null); setConflict(null);
      unsettled.current = null; setUnconfirmed(null);
    } catch (caught) { if (mounted.current) setError(message(caught, "Unable to load tryout events")); }
    finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [club.id, load]);
  useEffect(() => {
    if (!dirty && !unconfirmed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, unconfirmed]);

  function select(target: string) {
    restoreFocus.current = capturePageEditorFocus(document);
    setSelected(target); setGroup("when");
  }
  function closeEditor() {
    if (busy || imagePending.current) return;
    setSelected(null);
  }
  function changePage<K extends keyof TryoutsPageDraft>(key: K, value: TryoutsPageDraft[K]) {
    if (inFlight.current || unsettled.current) return;
    setPageCopy((draft) => ({ ...draft, [key]: value })); setPageDirty(true); setDirty(true);
    setPageErrors((errors) => ({ ...errors, [key]: undefined })); setError(null); setNotice("");
  }
  function changeEvent<K extends keyof TryoutDraft>(key: K, value: TryoutDraft[K]) {
    if (!selectedEvent || inFlight.current || unsettled.current) return;
    const clientKey = selectedEvent.clientKey;
    setEvents((rows) => rows.map((row) => row.clientKey === clientKey ? { ...row, [key]: value } : row));
    setEventErrors((errors) => ({ ...errors, [clientKey]: { ...errors[clientKey], [key]: undefined } }));
    setDirty(true); setError(null); setNotice("");
  }
  function addEvent() {
    if (!canEdit || !confirmed) return;
    const clientKey = crypto.randomUUID();
    setEvents((rows) => [...rows, { ...emptyTryoutDraft(rows.length), clientKey }]);
    select("event:" + clientKey); setDirty(true); setNotice("");
  }
  function reorder(delta: -1 | 1) {
    if (!selectedEvent || !canEdit) return;
    setEvents((rows) => moveTryout(rows, rows.findIndex((row) => row.clientKey === selectedEvent.clientKey), delta) as EventDraft[]);
    setDirty(true); setNotice("");
  }
  function releaseUnusedDraftUploads(rows: EventDraft[]) {
    const retained = new Set(rows.map((row) => row.heroMediaAssetId));
    for (const assetId of uploads.current) if (!retained.has(assetId)) void retireUpload(assetId);
  }
  function replaceDraft(snapshot: TryoutsSnapshot) {
    if (inFlight.current || unsettled.current || imagePending.current) throw new Error("Confirm the pending save before discarding.");
    releaseUnusedDraftUploads([]);
    setConfirmed(snapshot); setEvents(snapshot.events.map(eventFromSnapshot));
    setPageCopy(tryoutsPageToDraft(snapshot.page)); setPageDirty(false); setDirty(false);
    setSelected(null); setConflict(null); setPageErrors({}); setEventErrors({}); setError(null); setNotice("");
  }
  function applyPage(snapshot: TryoutsSnapshot) {
    const retained = new Set(snapshot.events.map((row) => row.hero_media_asset_id));
    for (const assetId of uploads.current) {
      if (retained.has(assetId)) uploads.current.delete(assetId);
      else void retireUpload(assetId);
    }
    const previous = current.current.events;
    setConfirmed({ ...snapshot, registrationForms: snapshot.registrationForms ?? current.current.confirmed?.registrationForms });
    setEvents(snapshot.events.map((row) => {
      const next = eventFromSnapshot(row);
      if (!next.heroMediaPreviewUrl && next.heroMediaAssetId) next.heroMediaPreviewUrl =
        previous.find((event) => event.heroMediaAssetId === next.heroMediaAssetId)?.heroMediaPreviewUrl ?? "";
      return next;
    }));
    setPageCopy(tryoutsPageToDraft(snapshot.page)); setPageDirty(false); setDirty(false);
    setSelected(null); setPageErrors({}); setEventErrors({}); setConflict(null); setNotice("");
  }
  function applyDeletion(snapshot: TryoutsSnapshot, key: string) {
    const draft = current.current;
    const result = reconcileDeletedEvent(snapshot, draft.events, key, draft.pageDirty);
    setConfirmed({ ...snapshot, registrationForms: snapshot.registrationForms ?? draft.confirmed?.registrationForms }); setEvents(result.events); setDirty(result.dirty);
    releaseUnusedDraftUploads(result.events);
    setSelected((value) => value === "event:" + key ? null : value);
    setEventErrors((errors) => { const next = { ...errors }; delete next[key]; return next; });
    setConflict(null); setNotice("Tryout event deleted.");
    return result.dirty;
  }

  async function execute(command: TryoutsCommand, retry = false): Promise<{ committed: boolean; remainingDirty: boolean }> {
    if (inFlight.current || imagePending.current) return { committed: false, remainingDirty: false };
    inFlight.current = true; setBusy(true); setError(null); setNotice("");
    try {
      const request = command.request;
      const result = await submitPageSave<TryoutsSnapshot>(() => fetch("/api/admin/tryouts-page", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(retry ? { "X-Editor-Recovery": "1" } : {}) },
        body: JSON.stringify(request),
      }), "/api/admin/tryouts-page?operationId=" + encodeURIComponent(request.operationId));
      if (result.kind === "committed") {
        unsettled.current = null; setUnconfirmed(null);
        const remainingDirty = command.kind === "delete" ? applyDeletion(result.snapshot, command.key) : false;
        if (command.kind === "page") applyPage(result.snapshot);
        setError(null);
        return { committed: true, remainingDirty };
      }
      if (result.kind === "unconfirmed") {
        unsettled.current = command; setUnconfirmed(command); setError(result.message);
      } else {
        unsettled.current = null; setUnconfirmed(null); setError(result.message);
        if (result.status === 409 && result.code === "TRYOUTS_CHANGED") {
          setSelected(null); setConfirmation(null);
          try { setConflict(await readSnapshot()); }
          catch { setError("The Tryouts page changed. Your draft is safe, but the latest page could not be loaded. Try Save again shortly."); }
        }
      }
      return { committed: false, remainingDirty: false };
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function savePage(): Promise<boolean> {
    const draft = current.current;
    if (inFlight.current || imagePending.current || loading || draft.conflict || !draft.confirmed) return false;
    if (unsettled.current) {
      const result = await execute(unsettled.current, true);
      if (result.committed && result.remainingDirty) {
        setError("Deletion confirmed. Your other edits are still unsaved. Save changes to publish them.");
      }
      return result.committed && !result.remainingDirty;
    }
    if (!draft.dirty) return true;
    const copyErrors = validateTryoutsPageDraft(draft.pageCopy);
    const rowErrors = Object.fromEntries(draft.events.map((event) => [event.clientKey, validateTryoutDraft(event)]));
    setPageErrors(copyErrors); setEventErrors(rowErrors);
    if (Object.keys(copyErrors).length || Object.values(rowErrors).some((row) => Object.keys(row).length)) {
      const invalid = draft.events.find((event) => Object.keys(rowErrors[event.clientKey]).length);
      select(invalid ? "event:" + invalid.clientKey : "intro");
      setGroup(invalid && (rowErrors[invalid.clientKey].ctaLabel || rowErrors[invalid.clientKey].registrationHref || rowErrors[invalid.clientKey].closedMessage) ? "signup" : "when");
      setError("Review the highlighted fields before saving.");
      return false;
    }
    const result = await execute(pageCommand(draft.confirmed.revision, draft.pageCopy, draft.pageDirty, draft.events, crypto.randomUUID()));
    return result.committed && !result.remainingDirty;
  }
  async function runSave(): Promise<boolean> {
    if (inFlight.current || imagePending.current || conflict) return false;
    savedResult.current = false;
    try { await saveDisplay.save(); return savedResult.current; }
    catch { return false; }
  }
  callbacks.current = {
    save: runSave,
    discard: () => {
      const baseline = current.current.confirmed;
      if (baseline) replaceDraft(baseline);
    },
  };

  async function deleteEvent(event: EventDraft) {
    if (inFlight.current || imagePending.current || conflict || !confirmed) return;
    if (unsettled.current) {
      if (unsettled.current.kind === "delete" && unsettled.current.key === event.clientKey &&
          (await execute(unsettled.current, true)).committed) setConfirmation(null);
      return;
    }
    if (!event.id) {
      const result = reconcileDeletedEvent(confirmed, current.current.events, event.clientKey, current.current.pageDirty);
      setEvents(result.events); setDirty(result.dirty); setSelected(null); setConfirmation(null);
      releaseUnusedDraftUploads(result.events); setNotice("Unsaved tryout event removed.");
      return;
    }
    try {
      const command = deletionCommand(confirmed, event, crypto.randomUUID());
      if ((await execute(command)).committed) setConfirmation(null);
    } catch (caught) { setError(message(caught, "Unable to delete tryout event")); }
  }

  async function uploadHero(files: FileList): Promise<boolean> {
    const file = files[0], event = selectedEvent;
    if (!file || !event || inFlight.current || unsettled.current) return false;
    try {
      const client = createClient();
      const { data, error: uploadError } = await client.storage.from("tryouts").upload("hero/" + Date.now() + "-" + file.name, file);
      if (uploadError || !data?.assetId) throw new Error(uploadError?.message ?? "Upload failed");
      uploads.current.add(data.assetId);
      if (!mounted.current) { await retireUpload(data.assetId, true); return false; }
      const { data: publicData, error: publicError } = client.storage.from("tryouts").getPublicUrl(data.path);
      if (publicError || !publicData.publicUrl) { await retireUpload(data.assetId); throw new Error(publicError?.message ?? "Upload failed"); }
      setEvents((rows) => rows.map((row) => row.clientKey === event.clientKey ? {
        ...row, heroMediaAssetId: data.assetId, heroMediaPreviewUrl: publicData.publicUrl,
      } : row));
      if (event.heroMediaAssetId && uploads.current.has(event.heroMediaAssetId) &&
          !current.current.events.some((row) => row.clientKey !== event.clientKey && row.heroMediaAssetId === event.heroMediaAssetId)) {
        void retireUpload(event.heroMediaAssetId);
      }
      setDirty(true); setError(null); setNotice("");
      return true;
    } catch (caught) { setError(message(caught, "Upload failed")); return false; }
  }
  function keepDraftAfterConflict() {
    if (!conflict || unsettled.current || inFlight.current) return;
    const latestIds = new Set(conflict.events.map((event) => event.id));
    const draftIds = new Set(events.map((event) => event.id));
    setEvents(orderedEvents([
      ...events.map((event) => event.id && !latestIds.has(event.id) ? { ...event, id: null } : event),
      ...conflict.events.filter((event) => !draftIds.has(event.id)).map(eventFromSnapshot),
    ]));
    setConfirmed({ ...conflict, registrationForms: conflict.registrationForms ?? confirmed?.registrationForms }); setConflict(null); setDirty(true);
    setError("Your draft is ready to save over the reviewed page. Events added elsewhere are preserved. Select Save changes to continue.");
  }

  const previewTryouts = events.filter((event) => !event.signUp?.hidden).map((event) =>
    mapTryout({ ...tryoutDraftToRow({ ...event, id: event.id ?? event.clientKey }), ...(event.signUp ?? {}) },
      contactEmail, event.registrationFormId ? confirmed?.registrationForms?.[event.registrationFormId] : undefined, today))
    .sort(compareTryoutsByDate);
  const previewPageContent = resolveTryoutsPageContent(buildTryoutsPageMutationPayload(pageCopy));
  const errorFor = selectedEvent ? eventErrors[selectedEvent.clientKey] ?? {} : {};
  const saveAction = uploadPending
    ? <AdminPendingButton label="Save changes" pendingLabel="Checking photo…" pending className={styles.save} />
    : unconfirmed
      ? <AdminPendingButton label="Confirm save" pendingLabel="Confirming…" pending={busy} onClick={() => void runSave()} className={styles.save} />
      : <AdminSaveButton className={styles.save} state={loading || Boolean(conflict) ? "clean" : saveDisplay.state} onSave={() => void runSave()} />;
  const confirmBusy = busy || uploadPending;

  return <AdminPage className={styles.page}>
    <AdminPageHeader eyebrow="Public website" title="Tryouts"
      description="Edit the introduction and event cards. Save changes publishes your page draft together."
      actions={<div data-admin-page-action-group="" className={styles.actions}>
        {dirty && <Button type="button" variant="outline" className={styles.action} disabled={!canEdit} onClick={() => setConfirmation({ kind: "discard" })}>Discard</Button>}
        {saveAction}
      </div>} />
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!loading && !confirmed && <Button type="button" variant="outline" onClick={() => void load()}>Try again</Button>}
    {conflict && <div role="region" aria-label="Review changes from another editor" className={styles.conflict}>
      <h2>Review the latest saved page</h2>
      <p>Your draft is safe. The saved page now has {conflict.events.length} {conflict.events.length === 1 ? "event" : "events"}: {conflict.events.map((event) => event.headline || "Untitled event").join(", ") || "none"}.</p>
      <p>Saved introduction with events: {conflict.page.intro_with_tryouts || "template default"}</p>
      <div className={styles.actions}><Button variant="outline" onClick={() => setConfirmation({ kind: "latest" })}>Use latest saved page</Button><Button onClick={keepDraftAfterConflict}>Keep my draft</Button></div>
    </div>}
    <div className={styles.toolbar}>
      <p>Your public <strong>/tryouts</strong> page <span className={styles.count}>{confirmed ? events.length : "—"}</span> events</p>
      <PreviewToggle value={phone ? "phone" : "desktop"} onChange={setDevice} />
    </div>
    <div className={styles.tools} aria-label="Tryouts editing tools">
      <Button variant="outline" className={styles.action} disabled={!canEdit || !confirmed} onClick={() => select("intro")}>Page introduction</Button>
      <label className={styles.eventPicker}>Edit event
        <NativeSelect value={selectedEvent?.clientKey ?? ""} disabled={!canEdit || !confirmed || events.length === 0}
          onChange={(event) => { if (event.target.value) select("event:" + event.target.value); }}>
          <NativeSelectOption value="">Choose an event</NativeSelectOption>
          {events.map((event) => <NativeSelectOption key={event.clientKey} value={event.clientKey}>{event.headline || "Untitled event"}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      <Button ref={addButton} variant="outline" className={styles.action} disabled={!canEdit || !confirmed} onClick={addEvent}><Plus size={16} />Add event</Button>
    </div>
    <div className={styles.canvas} data-admin-loading-region="" data-phase={phase.phase} aria-busy={phase.phase !== "content"} data-tryouts-classic-canvas="">
      <div className={styles.preview} data-tryouts-preview-content="" data-hidden={!phase.showContent || undefined} aria-hidden={!phase.showContent || undefined} inert={!phase.showContent}>
        <ScaledTryoutsPreview tryouts={previewTryouts} clubName={club.name} contactEmail={contactEmail}
          content={previewPageContent} phone={phone} selected={selected} onSelect={select} />
      </div>
      {phase.showSkeleton && <div className={styles.skeleton} data-admin-skeleton-layer="" role="status" aria-label="Loading tryout events" aria-hidden={phase.phase === "crossfade" || undefined}>
        <Shimmer className={styles.skeletonHeading} /><Shimmer className={styles.skeletonCopy} />
        <div className={styles.skeletonCards}>{[0, 1, 2].map((key) => <Shimmer key={key} className={styles.skeletonCard} />)}</div>
      </div>}
    </div>
    {!loading && confirmed && events.length === 0 && <p className={styles.empty}>No tryout events yet. The public page shows the no-events introduction.</p>}
    <p role="status" className={styles.notice}>{notice}</p>

    <AdminDialog open={selected !== null} onClose={closeEditor} size={selectedEvent ? "xl" : "md"}
      eyebrow="Public Tryouts page" title={selected === "intro" ? "Page introduction" : selected === "heading" ? "Page heading" : selectedEvent?.headline || "New tryout event"}
      busy={busy || uploadPending} finalFocus={() => { restoreFocus.current?.(); if (document.activeElement === document.body) addButton.current?.focus(); return false; }}
      footer={<AdminDialogFooter
        primary={<Button type="button" className={styles.action} onClick={closeEditor} disabled={confirmBusy}>Done</Button>}
        status={unconfirmed ? "Confirm the pending save before editing." : conflict ? "Review the latest saved page before saving or deleting." : "Your edits stay in the page draft until you save."}
        destructive={selectedEvent && <Button type="button" variant="outline" className={styles.danger} disabled={!canEdit || Boolean(conflict)} onClick={() => setConfirmation({ kind: "delete", event: selectedEvent })}>Delete event</Button>} />}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {selected === "heading" ? <p className={styles.hint}>The heading follows your website design and club name. Onzio manages this text.</p> :
        selected === "intro" ? <fieldset disabled={!canEdit} className={styles.fields}>
          <p className={styles.hint}>The page shows one introduction when events are listed and the other when none are announced.</p>
          <Field label="Intro shown when tryouts are published" error={pageErrors.introWithTryouts}><Textarea value={pageCopy.introWithTryouts} onChange={(event) => changePage("introWithTryouts", event.target.value)} maxLength={TRYOUTS_PAGE_LIMITS.introWithTryouts} /></Field>
          <Field label="Intro shown when none are published" error={pageErrors.introNoTryouts}><Textarea value={pageCopy.introNoTryouts} onChange={(event) => changePage("introNoTryouts", event.target.value)} maxLength={TRYOUTS_PAGE_LIMITS.introNoTryouts} /></Field>
        </fieldset> : selectedEvent ? <div className={styles.split}>
          <nav aria-label="Event editor sections" className={styles.sections}>
            {groups.map((section) => <button type="button" key={section.id} disabled={busy || uploadPending || Boolean(unconfirmed)} aria-current={group === section.id ? "true" : undefined} onClick={() => setGroup(section.id)}>{section.label}</button>)}
          </nav>
          <fieldset disabled={!canEdit} className={styles.fields}>
            <h3>{groups.find((section) => section.id === group)?.label}</h3>
            {group === "when" && <>
              <Field label="Name" error={errorFor.headline}><input className={ADMIN_INPUT_CLASS} value={selectedEvent.headline} onChange={(event) => changeEvent("headline", event.target.value)} maxLength={80} /></Field>
              {(policy?.showProgramAndHeroFields ?? true) && <Field label="Program association"><NativeSelect value={selectedEvent.programId ?? ""} onChange={(event) => changeEvent("programId", event.target.value || null)}><NativeSelectOption value="">General club tryout</NativeSelectOption>{programs.map((program) => <NativeSelectOption key={program.id} value={program.id}>{program.display_title}</NativeSelectOption>)}</NativeSelect></Field>}
              <div className={styles.twoFields}><Field label="Event date" error={errorFor.eventDate}><input type="date" className={ADMIN_INPUT_CLASS} value={selectedEvent.eventDate} onChange={(event) => changeEvent("eventDate", event.target.value)} /></Field><Field label="Cost" error={errorFor.costText}><input className={ADMIN_INPUT_CLASS} value={selectedEvent.costText} onChange={(event) => changeEvent("costText", event.target.value)} maxLength={120} /></Field></div>
              <Field label="Location" error={errorFor.location}><input className={ADMIN_INPUT_CLASS} value={selectedEvent.location} onChange={(event) => changeEvent("location", event.target.value)} maxLength={160} /></Field>
              <p className={styles.hint}>Leave date, location, or cost blank to show TBA to visitors.</p>
              <div className={styles.reorder}><Button type="button" variant="outline" className={styles.action} disabled={!canEdit || events[0]?.clientKey === selectedEvent.clientKey} onClick={() => reorder(-1)}><ArrowUp size={16} />Move up</Button><Button type="button" variant="outline" className={styles.action} disabled={!canEdit || events.at(-1)?.clientKey === selectedEvent.clientKey} onClick={() => reorder(1)}><ArrowDown size={16} />Move down</Button></div>
            </>}
            {group === "signup" && <>
              <Field label="Sign-ups"><NativeSelect value={selectedEvent.status === "closed" ? "closed" : "open"} onChange={(event) => changeEvent("status", event.target.value as TryoutDraft["status"])}><NativeSelectOption value="open">Open, closes by itself the day after its date</NativeSelectOption><NativeSelectOption value="closed">Closed</NativeSelectOption></NativeSelect></Field>
              <Field label="Onzio registration form"><NativeSelect value={selectedEvent.registrationFormId ?? ""} onChange={(event) => changeEvent("registrationFormId", event.target.value || null)}><NativeSelectOption value="">No native form — use the destination below</NativeSelectOption>{forms.map((form) => <NativeSelectOption key={form.id} value={form.id}>{form.title} — {form.status}</NativeSelectOption>)}</NativeSelect></Field>
              <p className={styles.hint}>An open form launches native registration. Draft, closed, or unselected forms preserve the external or contact fallback. Submissions remain in Registrations.</p>
              <Field label="Button text" error={errorFor.ctaLabel}><input className={ADMIN_INPUT_CLASS} value={selectedEvent.ctaLabel} onChange={(event) => changeEvent("ctaLabel", event.target.value)} maxLength={40} /></Field>
              <Field label="External registration destination" error={errorFor.registrationHref}><input className={ADMIN_INPUT_CLASS} value={selectedEvent.registrationHref} onChange={(event) => changeEvent("registrationHref", event.target.value)} maxLength={2048} /></Field>
              <p className={styles.hint}>{LINK_DESTINATION_HINT}</p>
              <Field label="Closed message" error={errorFor.closedMessage}><Textarea value={selectedEvent.closedMessage} onChange={(event) => changeEvent("closedMessage", event.target.value)} maxLength={320} /></Field>
            </>}
            {group === "photo" && policy?.showHeroImageField && <>
              <AdminImageField label="Event photo" shape="square" size={96}
                previewUrl={selectedEvent.heroMediaPreviewUrl || null} disabled={busy || Boolean(unconfirmed)}
                {...adminImageRules("photo")}
                onPendingChange={(pending) => { imagePending.current = pending; setUploadPending(pending); }}
                onUpload={uploadHero}
                onRemove={selectedEvent.heroMediaAssetId ? () => {
                  const assetId = selectedEvent.heroMediaAssetId;
                  changeEvent("heroMediaAssetId", null); changeEvent("heroMediaPreviewUrl", "");
                  if (assetId && !events.some((event) => event.clientKey !== selectedEvent.clientKey && event.heroMediaAssetId === assetId)) void retireUpload(assetId);
                } : undefined} />
              <p className={styles.hint}>The first event with a photo also supplies the Academy page hero.</p>
            </>}
          </fieldset>
        </div> : null}
    </AdminDialog>

    <AdminConfirmDialog open={confirmation !== null}
      title={confirmation?.kind === "delete" ? "Delete " + (confirmation.event.headline || "this tryout event") + "?" : confirmation?.kind === "latest" ? "Use the latest saved page?" : "Discard unsaved changes?"}
      confirmLabel={confirmation?.kind === "delete" ? unconfirmed ? "Confirm deletion" : "Delete event" : confirmation?.kind === "latest" ? "Replace draft" : "Discard changes"}
      destructive busy={confirmBusy}
      onCancel={() => { if (!confirmBusy) setConfirmation(null); }}
      onConfirm={() => {
        if (confirmation?.kind === "delete") void deleteEvent(confirmation.event);
        else if (confirmation?.kind === "latest" && conflict) { replaceDraft(conflict); setConfirmation(null); }
        else if (confirmed) { replaceDraft(confirmed); setConfirmation(null); }
      }}>
      {confirmation?.kind === "delete"
        ? confirmation.event.id
          ? "This deletes the saved event immediately. Other unsaved page edits stay in your draft. This cannot be undone."
          : "This removes the unsaved event from your draft. It has not been published."
        : confirmation?.kind === "latest" ? "This replaces your unsaved Tryouts draft with the latest saved page." : "This restores the last confirmed page and events."}
      {unconfirmed && <p className={styles.hint}>The earlier response is uncertain. Confirming retries only that exact operation.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </AdminConfirmDialog>
  </AdminPage>;
}

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  const id = useId();
  const control = isValidElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>(children)
    ? cloneElement(children, { id, "aria-invalid": Boolean(error) || undefined, "aria-describedby": error ? id + "-error" : undefined })
    : children;
  return <div className={styles.field}><label htmlFor={id}>{label}</label>{control}
    {error && <span id={id + "-error"} role="alert" className={styles.fieldError}>{error}</span>}</div>;
}
