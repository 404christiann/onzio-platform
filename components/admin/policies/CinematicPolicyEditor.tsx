"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { EditorNotice, EditorSecondaryButton, EditorSegmented } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { EditorDialog, PageFrame, PageFrameSkeleton, PreviewCards, PreviewCardsSkeleton, ValidationMessage, useEditorDialog } from "@/components/admin/ui/editor-kit";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import CinematicPolicyPage from "@/components/cinematic/CinematicPolicyPage";
import CinematicShell from "@/components/cinematic/CinematicShell";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { IconAdd } from "@/components/admin/icons";
import { useMoveFocus } from "@/components/admin/list-cards/useMoveFocus";
import lists from "@/components/admin/list-cards/ListEditor.module.css";
import { createClient } from "@/lib/admin-client";
import { POLICY_LIMITS, POLICY_PAGES, POLICY_PAGE_PATHS, cinematicPolicyDraftSchema, cinematicPolicySaveSchema, type CinematicPolicyDraft, type CinematicPolicySave, type CinematicPolicySnapshot, type PolicyPageKey } from "@/lib/cinematic-policies-content";
import { POLICY_PAGE_NAMES, policyDraftReducer, preparePolicySave, type PolicyDraftAction } from "@/lib/cinematic-policies-draft";
import { loadCinematicPolicyEditor, saveCinematicPolicyEditor } from "@/lib/cinematic-policies-editor";
import { DISCARD_CONFIRM } from "../editor-copy";
import { PolicyDialogFields, type PolicyFieldsApi } from "./PolicyDialogFields";
import { cardSlice, policiesOwnsTarget, policiesStampsByCard, policyCardContent } from "./policies-edit-targets";
import {
  PAGE_DIALOG_ID, buildPolicySaveRequest, changedPolicyPages, firstPageWithError, pageSummary, parseDialogId, policiesDirty, policiesPageState, policyFieldErrors, rowDialogId, rowSummary, savedPolicies,
  type PolicyDialogId,
} from "./policies-sections";
import styles from "./policies.module.css";

const recoverySchema = z.object({ content: cinematicPolicyDraftSchema, pending: cinematicPolicySaveSchema.nullable() });
const PAGE = "Policies";
const TITLE = "Stadium Guidelines & Fan Code";
const CRUMBS = [{ label: "Website", href: "/admin/website-pages" as const }, { label: "Tickets and stadium" }];
const DESCRIPTION = "Edit both accordion pages. Save applies all changes to both pages together.";

type PolicyPageContent = CinematicPolicyDraft[PolicyPageKey];
type CardPreviewProps = { id: string; page: PolicyPageContent; shared: CinematicHomepageContent | null; slice: string; card: boolean };

/** The real public accordion page for one card. Re-renders only when its own slice changes. */
const CardLive = memo(function CardLive({ id, page, shared, card }: CardPreviewProps) {
  const only = parseDialogId(id)?.kind === "row" ? "row" : "page";
  return <div className={styles.only} data-only={only} data-card={card || undefined}><CinematicShell contentOnly initialContent={shared}><CinematicPolicyPage page={policyCardContent(page, id)} /></CinematicShell></div>;
}, (a, b) => a.id === b.id && a.slice === b.slice && a.shared === b.shared && a.card === b.card);

export default function CinematicPolicyEditor() {
  const club = useClubContext();
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null), [sharedSettled, setSharedSettled] = useState(false);
  const [snapshot, setSnapshot] = useState<CinematicPolicySnapshot | null>(null);
  const [draft, setDraft] = useState<CinematicPolicyDraft | null>(null);
  const [pending, setPending] = useState<CinematicPolicySave | null>(null);
  const [page, setPage] = useState<PolicyPageKey>("guidelines");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false), [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false), [saveFailed, setSaveFailed] = useState(false), [validation, setValidation] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedClubId, setLoadedClubId] = useState<string | null>(null), [confirmReload, setConfirmReload] = useState(false);
  const recoveryKey = useRef<string | null>(null), epoch = useRef(0), keepRef = useRef<HTMLButtonElement>(null), addRef = useRef<HTMLButtonElement>(null);
  const dialog = useEditorDialog<PolicyDialogId>();
  const rememberMove = useMoveFocus(draft);
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const saved = savedPolicies(snapshot);
  const dirty = !!draft && !!snapshot && policiesDirty(draft, saved);
  const locked = busy || !!pending;
  const unsaved = dirty || !!pending;

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    recoveryKey.current = null;
    setSnapshot(null); setDraft(null); setLoadedClubId(null); setPending(null); setMessage(""); setFailed(false); setStatus("");
    setConflict(false); setSaveFailed(false); setValidation(""); setErrors({}); setBusy(false);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadCinematicPolicyEditor(), createClient().auth.getUser()]).then(([loaded, user]) => {
      if (!active) return;
      if (!user.data.user) throw new Error("Sign in again to edit these pages.");
      const key = `onzio:cinematic-policies:v1:${location.origin}:${user.data.user.id}:${club.id}`;
      recoveryKey.current = key;
      let recovered: z.infer<typeof recoverySchema> | null = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = recoverySchema.safeParse(JSON.parse(raw));
          if (parsed.success) recovered = parsed.data;
          else localStorage.removeItem(key);
        }
      } catch {}
      setSnapshot(loaded);
      setDraft(recovered?.content ?? savedPolicies(loaded));
      setPending(recovered?.pending ?? null);
      setLoadedClubId(club.id);
      if (recovered) setMessage(recovered.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved draft has been restored.");
    }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load the policy pages."); setFailed(true); } });
    return () => { active = false; epoch.current += 1; };
  }, [club.id, club.presentationTemplateKey]);

  // The previews' site shell reads the Homepage content once here, so no card or dialog preview fetches it on its own.
  useEffect(() => {
    let active = true;
    setShared(null); setSharedSettled(false);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    fetchCinematicHomepageContent(club.id).then(content => { if (active) setShared(content); }).catch(() => undefined).finally(() => { if (active) setSharedSettled(true); });
    return () => { active = false; };
  }, [club.id, club.presentationTemplateKey]);

  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current) return;
    try {
      if (dirty || pending) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending }));
      else localStorage.removeItem(recoveryKey.current);
    } catch { /* The in-memory draft stays usable when browser storage is full. */ }
  }, [draft, snapshot, dirty, pending]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  const settle = () => { setMessage(""); setFailed(false); setValidation(""); setErrors({}); setSaveFailed(false); };
  const edit = (action: PolicyDraftAction) => {
    if (locked) return;
    setDraft(current => current ? policyDraftReducer(current, action) : current);
    settle();
  };

  /** Resolves true only when the server committed the save, so the Save button can show Saved. */
  async function save(): Promise<boolean> {
    if (!draft || !snapshot || busy) return false;
    let request = pending;
    if (!request) {
      const ready = preparePolicySave(draft);
      if (!ready.ok) {
        const found = policyFieldErrors(draft), first = firstPageWithError(found);
        setErrors(found); setSaveFailed(true); setValidation(ready.message);
        if (first) setPage(first);
        return false;
      }
      request = buildPolicySaveRequest({ pending: null, operationId: crypto.randomUUID(), snapshot, content: ready.content });
    }
    const generation = epoch.current;
    setPending(request); setBusy(true); setFailed(false); setSaveFailed(false); setValidation(""); setErrors({}); setMessage(""); setStatus(`Saving ${PAGE}…`);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending: request })); } catch {}
    const result = await saveCinematicPolicyEditor(request);
    if (generation !== epoch.current) return false;
    setBusy(false);
    if (result.status === "committed") {
      setSnapshot(result.snapshot); setDraft(savedPolicies(result.snapshot)); setPending(null); setConflict(false);
      setMessage(""); setStatus("Stadium Guidelines and Fan Code of Conduct saved."); clearRecovery();
      return true;
    } else if (result.status === "uncertain") { setPending(result.request); setFailed(true); setMessage(result.message); }
    else { setPending(null); setFailed(true); setSaveFailed(result.status !== "conflict"); setConflict(result.status === "conflict"); setMessage(result.message); }
    return false;
  }

  /** Discard asks first when there are unsaved edits. */
  function requestDiscard() {
    if (busy) return;
    if (pending) { setFailed(true); setMessage("Retry the same save before discarding your edits, so nothing is lost."); return; }
    if (dirty) setConfirmReload(true);
    else void reload();
  }
  async function reload(keepDraft = false) {
    if (locked) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const loaded = await loadCinematicPolicyEditor();
      cinematicPolicyDraftSchema.parse(savedPolicies(loaded));
      if (generation !== epoch.current) return;
      if (keepDraft && draft) {
        // The latest revision becomes the base and the edits stay.
        setSnapshot(loaded);
        setMessage("Latest saved version loaded. Your edits were kept.");
      } else {
        setSnapshot(loaded); setDraft(savedPolicies(loaded)); setMessage(""); clearRecovery();
      }
      setConflict(false); setFailed(false); setSaveFailed(false); setValidation(""); setErrors({});
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to reload the policy pages."); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }

  const moveRow = (index: number, delta: -1 | 1) => {
    if (!draft || locked) return;
    const row = draft[page].rows[index];
    if (!row) return;
    rememberMove(rowDialogId(row.id), delta, true);
    edit({ type: "move-row", page, row: index, by: delta });
    setStatus(`${row.heading.trim() || `Row ${index + 1}`} is now row ${index + delta + 1}.`);
  };
  const removeRow = (index: number) => {
    if (!draft || locked) return;
    const row = draft[page].rows[index];
    if (!row) return;
    edit({ type: "remove-row", page, row: index });
    dialog.close();
    setStatus(`${row.heading.trim() || `Row ${index + 1}`} removed. Save to publish.`);
    setTimeout(() => addRef.current?.focus(), 0);
  };
  const addRow = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!draft || locked || draft[page].rows.length >= POLICY_LIMITS.rows) return;
    const id = crypto.randomUUID();
    edit({ type: "add-row", page, id });
    dialog.openSection(rowDialogId(id), event);
  };

  const saveAction = useSaveState({
    isDirty: unsaved,
    onSave: async () => { if (!(await save())) throw new Error(`${PAGE} was not saved.`); },
  });
  const latestSave = useRef(save);
  latestSave.current = save;
  useUnsavedGuard(draft ? {
    dirty: unsaved, edited: PAGE, onSave: () => latestSave.current(),
    onDiscard: () => {
      if (busy || pending) throw new Error("A save is still being confirmed.");
      if (!snapshot) return;
      setDraft(saved); settle(); setConflict(false); clearRecovery();
    },
  } : undefined);

  const pageState = policiesPageState({ base: saveAction.state, busy, pending: !!pending, conflict, saveFailed });
  const changedPages = useMemo(() => new Set(draft && snapshot ? changedPolicyPages(draft, saved) : []), [draft, snapshot, saved]);
  const loading = !draft || !snapshot || loadedClubId !== club.id;
  const other = POLICY_PAGES.find(key => key !== page)!;
  // Click-to-field stamps per card, built once per (deferred) draft and page: the draft the previews show, never the live one.
  const deferred = useDeferredValue(draft);
  const stampsByCard = useMemo(() => policiesStampsByCard(deferred?.[page].rows ?? [], rowDialogId), [deferred, page]);
  const otherHasError = Object.keys(errors).some(key => key.startsWith(`${other}.`));

  if (club.presentationTemplateKey !== "cinematic@2") return <PageFrame title={TITLE} breadcrumb={CRUMBS} description="This editor is unavailable for this website design.">{null}</PageFrame>;

  const current = draft?.[page];
  const rowCards = current ? current.rows.map((row, index) => {
    const error = errors[`${page}.${row.id}.heading`];
    return { id: rowDialogId(row.id), title: row.heading.trim() || `Row ${index + 1}`, disabled: locked, error };
  }) : [];
  const headingError = errors[`${page}.title`];
  const headingCard = current ? [{ id: PAGE_DIALOG_ID, title: "Page heading", disabled: locked }] : [];
  const previewOf = (id: string) => { const live = deferred?.[page]; return live && sharedSettled && <CardLive id={id} page={live} shared={shared} slice={cardSlice(live, id)} card />; };
  const onEdit = (id: string, event: React.MouseEvent<HTMLButtonElement>, target?: Parameters<typeof dialog.focusField>[0]) => { dialog.openSection(id as PolicyDialogId, event); dialog.focusField(target); };
  const needing = rowCards.filter(card => card.error);
  const dialogSections = current ? [
    { id: PAGE_DIALOG_ID, title: "Page heading", summary: pageSummary(current) },
    ...current.rows.map((row, index) => ({ id: rowDialogId(row.id), title: row.heading.trim() || `Row ${index + 1}`, summary: rowSummary(row) })),
  ] : [];
  const api: PolicyFieldsApi | null = draft ? { draft, page, locked, errors, edit, moveRow, removeRow } : null;
  const full = !!current && current.rows.length >= POLICY_LIMITS.rows;

  const notice = (message || validation || conflict) ? <div className={lists.notice} data-policies-notice="">
    {validation && <ValidationMessage live="assertive">{validation}{otherHasError && <> <button type="button" className={`admin-press ${lists.keep}`} onClick={() => setPage(other)}>Go to {POLICY_PAGE_NAMES[other]}</button></>}</ValidationMessage>}
    {(message || conflict) && <EditorNotice failed={failed || conflict}>{message}
      {conflict && <span className={lists.noticeActions}>
        <button ref={keepRef} type="button" className={`admin-press ${lists.keep}`} disabled={locked} onClick={() => void reload(true)}>Load latest and keep my edits</button>
        <EditorSecondaryButton disabled={locked} onClick={requestDiscard}>Reload saved pages</EditorSecondaryButton>
      </span>}
    </EditorNotice>}
  </div> : null;

  if (!draft && failed) return <PageFrame title={TITLE} breadcrumb={CRUMBS} description={DESCRIPTION}>
    <EditorNotice failed>{message}</EditorNotice>
    <div><EditorSecondaryButton disabled={false} onClick={() => location.reload()}>Try again</EditorSecondaryButton></div>
  </PageFrame>;

  return <>
    <ShimmerRegion loading={loading} loadingLabel={`Loading ${PAGE}…`} minHeight={480}
      skeleton={<div><PageFrameSkeleton cardCount={0} description /><PreviewCardsSkeleton count={5} /></div>}>
      <PageFrame title={TITLE} breadcrumb={CRUMBS} openPageHref={POLICY_PAGE_PATHS[page]} description={DESCRIPTION} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()} onDiscard={requestDiscard} notice={notice}>
        {current && <>
          <div className={styles.switchRow}>
            <EditorSegmented label="Page to edit" value={page} onChange={setPage} options={POLICY_PAGES.map(key => ({ value: key, label: POLICY_PAGE_NAMES[key] }))} />
            {changedPages.has(other) && <span className={styles.otherEdited} role="status">{POLICY_PAGE_NAMES[other]} has unsaved edits</span>}
          </div>
          <PreviewCards sections={headingCard} label={`${POLICY_PAGE_NAMES[page]} heading`} renderPreview={previewOf} previewScale={0.46}
            stamps={id => stampsByCard.get(id) ?? []} ownsTarget={policiesOwnsTarget} onEdit={onEdit} />
          {headingError && <p className={styles.needed} role="status">{headingError}</p>}
          <section className={styles.section} aria-labelledby="policies-rows-heading">
            <div className={styles.sectionHead}>
              <h2 id="policies-rows-heading">Rows<span className={styles.count}>{current.rows.length} of {POLICY_LIMITS.rows}</span></h2>
              <button ref={addRef} type="button" className={`admin-press ${lists.tool}`} disabled={locked || full} onClick={addRow}><IconAdd size={16} aria-hidden="true" />Add row</button>
            </div>
            <p className={lists.note}>Each row opens to show its answer. Every row with an answer starts open on the page. A row without an answer shows “Details coming soon.” Up to {POLICY_LIMITS.rows} rows, {POLICY_LIMITS.blocks} lines per answer.</p>
            {rowCards.length
              ? <PreviewCards sections={rowCards} label={`${POLICY_PAGE_NAMES[page]} rows`} renderPreview={previewOf} previewScale={0.46}
                stamps={id => stampsByCard.get(id) ?? []} ownsTarget={policiesOwnsTarget} onEdit={onEdit} />
              : <div className={styles.empty}><p>No rows yet. Add the first question visitors can open.</p></div>}
            {needing.length > 0 && <p className={styles.needed} role="status">{needing.map(card => `${card.title}: ${card.error}`).join(" ")}</p>}
            {full && <p className={lists.note}>{POLICY_LIMITS.rows} rows is the most a page can hold.</p>}
          </section>
        </>}
      </PageFrame>
    </ShimmerRegion>
    <p className={lists.srOnly} role="status" data-policies-status="">{status}</p>
    {api && <EditorDialog open={dialog.open} onClose={dialog.close} title={`Edit ${POLICY_PAGE_NAMES[page]}`} mode="split" returnFocusRef={dialog.returnFocusRef} focusRequest={dialog.focusRequest}
      sections={dialogSections} activeId={dialog.activeId} onActiveChange={id => dialog.switchTo(id as PolicyDialogId)}
      renderSection={id => dialog.open ? <PolicyDialogFields api={api} id={id as PolicyDialogId} /> : null}
      renderPreview={id => dialog.open ? <div className={styles.livePreview}>
        <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label={`${POLICY_PAGE_NAMES[page]} ${parseDialogId(id)?.kind === "row" ? "row" : "heading"}`}>
          <div className={styles.only} data-only={parseDialogId(id)?.kind === "row" ? "row" : "page"}><CinematicShell contentOnly initialContent={shared}><CinematicPolicyPage page={policyCardContent(api.draft[page], id)} /></CinematicShell></div>
        </HomepagePreviewFrame></div> : null} />}
    <AdminConfirmDialog open={confirmReload} title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel} destructive
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); void reload(); }}>
      Your unsaved edits to both pages will be discarded and the saved pages loaded.
    </AdminConfirmDialog>
  </>;
}
