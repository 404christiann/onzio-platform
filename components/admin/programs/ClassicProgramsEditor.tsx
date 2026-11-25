"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import ProgramCanvasFrame from "@/components/admin/ProgramCanvasFrame";
import { AdminDialog, AdminDialogFooter } from "@/components/admin/ui/AdminDialog";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { AdminSaveButton } from "@/components/admin/ui/AdminSaveButton";
import { AdminPendingButton } from "@/components/admin/ui/AdminPendingButton";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { PreviewToggle } from "@/components/admin/ui/PreviewToggle";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { useDelayedLoading } from "@/components/admin/ui/useDelayedLoading";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from "@/components/admin/icons";
import { moveProgram, programDraftToContent, type ProgramDraft } from "@/lib/program-admin";
import { ProgramFields } from "./ProgramFields";
import { ProgramsCopyFields } from "./ProgramsCopyFields";
import { PAGE_COPY_SECTION_LABELS, PROGRAM_FIELD_TABS, type PageCopySection, type ProgramEditorTab } from "./program-editor-types";
import type { ProgramsEditor } from "./useProgramsEditor";
import type { ProgramPreviews } from "./program-previews";
import "./classic-programs.css";

type Target = "program" | "copy" | "order" | null;
type ProgramSection = ProgramEditorTab | "visibility" | "preview";
type Opener = { element: HTMLElement | null; section?: string; slug?: string };
const SECTIONS: Array<{ id: ProgramSection; label: string }> = [
  { id: "content", label: "Basics" }, { id: "media", label: "Photos" },
  { id: "registration", label: "Sign-up" }, { id: "visibility", label: "Visibility" },
  { id: "preview", label: "Preview" },
];

function focusable(element: Element | null): element is HTMLElement {
  const target = element as HTMLElement | null;
  return Boolean(target?.isConnected && target.tabIndex >= 0 && target.getClientRects().length && !target.closest("[inert]") && !target.hasAttribute("disabled"));
}

export function ClassicProgramsEditor({ editor, previews }: { editor: ProgramsEditor; previews: ProgramPreviews }) {
  const latest = useRef(editor);
  latest.current = editor;
  const [target, setTarget] = useState<Target>(null);
  const [section, setSection] = useState<ProgramSection>("content");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [detailDevice, setDetailDevice] = useState<"desktop" | "phone">("desktop");
  const [previewReady, setPreviewReady] = useState(false);
  const onReady = useCallback((ready: boolean) => setPreviewReady(ready), []);
  const [confirmation, setConfirmation] = useState<"program" | "directory" | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [discarded, setDiscarded] = useState(false);
  const opener = useRef<Opener>({ element: null });
  const preview = useRef<HTMLDivElement>(null);
  const fields = useRef<HTMLDivElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const headerSave = useRef<HTMLButtonElement>(null);
  const orderButton = useRef<HTMLButtonElement>(null);
  const orderList = useRef<HTMLUListElement>(null);
  const sectionNav = useRef<HTMLElement>(null);
  const pendingOrderFocus = useRef<{ id: string; direction: -1 | 1; previous: HTMLElement } | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ section: ProgramSection } | null>(null);

  const dirty = editor.program.dirty || editor.copy.pageCopyDirty || editor.directory.managementDirty ||
    Boolean(editor.program.unconfirmedProgram || editor.directory.unconfirmedManagement) ||
    editor.state.pickerPending || editor.state.hasOwnedUploads || Boolean(editor.state.cleanupError);
  const mediaBusy = editor.state.pickerPending || editor.media.uploadingRole !== null || editor.media.uploadingGallery;
  const uncertain = Boolean(editor.program.unconfirmedProgram || editor.directory.unconfirmedManagement);
  const result = useRef(false);
  async function persist() {
    setActionError(null);
    setDiscarded(false);
    result.current = await latest.current.actions.saveAll();
    if (!result.current) throw new Error("Your changes could not all be saved.");
  }
  const save = useSaveState({ isDirty: dirty, onSave: persist });
  const saveAttempt = useRef<(origin?: "header" | "guard") => Promise<boolean>>(async () => false);
  saveAttempt.current = async (origin = "header") => {
    if ((origin === "header" && save.state === "saving") || latest.current.state.batchSaving) return false;
    if (!dirty) return true;
    result.current = false;
    try {
      if (origin === "guard") await persist();
      else await save.save();
      return result.current;
    } catch { return false; }
  };
  const requestNavigation = useUnsavedGuard({
    dirty,
    edited: "Programs",
    onSave: () => saveAttempt.current("guard"),
    onDiscard: () => latest.current.actions.discardAll(),
  });
  const busy = save.state === "saving" || editor.state.batchSaving || mediaBusy || confirmBusy ||
    editor.program.saving || editor.directory.managementSaving || editor.copy.pageCopySaving;
  const locked = busy || editor.program.editorLocked;
  const loading = useDelayedLoading(editor.state.loading || !previewReady);
  const displayDraft = editor.program.draft;
  const staged = editor.directory.programs.map(program => displayDraft?.id === program.id && editor.program.dirty
    ? { ...displayDraft, status: program.status, sortOrder: program.sortOrder } : program);
  if (displayDraft && !displayDraft.id && editor.program.dirty) staged.push({ ...displayDraft, slug: editor.program.derivedSlugForNewProgram(displayDraft) });
  const directoryPrograms = staged.map(program => programDraftToContent(program));
  const hidden = staged.filter(program => program.status === "hidden").map(program => program.slug);
  const labels = Object.fromEntries(staged.map(program => [program.slug, program.navLabel || program.displayTitle]));
  const editable = editor.policy.hidesPageCopyEditor ? [] : ["Page heading", "Closing band"];

  useEffect(() => { if (dirty) setDiscarded(false); }, [dirty]);
  useEffect(() => {
    if (target === "program" && editor.state.error) setSection(editor.program.activeTab);
  }, [editor.state.error, editor.program.activeTab, target]);
  useLayoutEffect(() => {
    const nav = sectionNav.current;
    const selected = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !selected) return;
    const bounds = nav.getBoundingClientRect(), active = selected.getBoundingClientRect();
    if (active.left < bounds.left) nav.scrollLeft += active.left - bounds.left;
    else if (active.right > bounds.right) nav.scrollLeft += active.right - bounds.right;
  }, [section, target]);
  useLayoutEffect(() => {
    if (!focusRequest || target !== "program" || focusRequest.section !== section) return;
    setFocusRequest(null);
    const invalid = fields.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)');
    const first = fields.current?.querySelector<HTMLElement>("input:not(:disabled),textarea:not(:disabled),select:not(:disabled)");
    (invalid ?? first)?.focus({ preventScroll: true });
  }, [focusRequest, section, target]);
  useLayoutEffect(() => {
    const pending = pendingOrderFocus.current;
    if (!pending) return;
    pendingOrderFocus.current = null;
    const current = document.activeElement;
    if (current !== pending.previous && focusable(current) && !current.closest("[data-program-order-row]")) return;
    const row = Array.from(orderList.current?.querySelectorAll<HTMLElement>("[data-program-order-row]") ?? []).find(element => element.dataset.programOrderRow === pending.id);
    const next = row?.querySelector<HTMLElement>('[data-order-direction="' + pending.direction + '"]:not(:disabled)') ??
      row?.querySelector<HTMLElement>("button:not(:disabled)");
    next?.focus({ preventScroll: true });
  }, [editor.directory.programs]);

  function capture(element?: HTMLElement, identity?: Omit<Opener, "element">) {
    opener.current = { element: element ?? (document.activeElement as HTMLElement | null), ...identity };
  }
  function restoreFocus() {
    const current = document.activeElement;
    const active = current?.tagName === "IFRAME" ? (current as HTMLIFrameElement).contentDocument?.activeElement ?? null : current;
    if (focusable(active) && !active.closest('[data-slot="admin-dialog"]') && !current?.closest('[data-slot="admin-dialog"]')) return false;
    const previous = opener.current;
    if (previous.element?.isConnected && previous.element.getClientRects().length) return previous.element;
    const frame = preview.current?.querySelector("iframe")?.contentDocument;
    const replacement = previous.slug
      ? Array.from(frame?.querySelectorAll<HTMLElement>("[data-program-editor-card]") ?? []).find(element => element.dataset.programEditorCard === previous.slug)
      : Array.from(frame?.querySelectorAll<HTMLElement>("[data-program-editor-section]") ?? []).find(element => element.dataset.programEditorSection === previous.section);
    return replacement ?? orderButton.current ?? headerSave.current;
  }
  function close() { if (!busy) setTarget(null); }
  function openWords(next: PageCopySection, element?: HTMLElement, identity?: string) {
    if (busy || editor.policy.hidesPageCopyEditor) return;
    capture(element, { section: identity });
    latest.current.copy.selectPageCopySection(next);
    setTarget("copy");
    setActionError(null);
  }
  function openProgram(slug: string, element?: HTMLElement) {
    if (busy) return;
    const current = latest.current;
    const program = current.directory.programs.find(item => item.slug === slug);
    const newDraft = current.program.draft;
    if (!program && !(newDraft && !newDraft.id && current.program.derivedSlugForNewProgram(newDraft) === slug)) return;
    capture(element, { slug });
    const show = () => {
      const live = latest.current;
      if (program && live.program.draft?.id !== program.id) {
        const selected = live.directory.programs.find(item => item.id === program.id);
        if (!selected) return;
        live.view.selectProgram(selected);
      }
      const sameProgram = !program || live.program.draft?.id === program.id;
      const errorField = (Object.keys(live.program.errors) as Array<keyof typeof live.program.errors>)
        .find(field => live.program.errors[field] && PROGRAM_FIELD_TABS[field]);
      const next = sameProgram && errorField ? PROGRAM_FIELD_TABS[errorField] : "content";
      live.program.selectTab(next);
      setSection(next);
      setTarget("program");
      setFocusRequest({ section: next });
      setActionError(null);
    };
    if (!program || current.program.draft?.id === program.id) show();
    else requestNavigation({ kind: "switch", label: program.displayTitle || "another program", continue: show, opener: element });
  }
  function onSection(next: string, element?: HTMLElement) {
    if (next === "Page heading") openWords("pageHeader", element, next);
    else if (next === "Closing band") openWords("closingBand", element, next);
  }
  function openOrder(element: HTMLElement) {
    if (busy) return;
    capture(element);
    setTarget("order");
    setActionError(null);
  }
  function createProgram(element: HTMLElement) {
    if (busy || editor.policy.hidesProgramCreation) return;
    capture(element);
    requestNavigation({ kind: "switch", label: "a new program", opener: element, continue: () => {
      latest.current.view.startCreate();
      setSection("content");
      setTarget("program");
    } });
  }
  async function discard() {
    if (busy) return;
    setActionError(null);
    try { await latest.current.actions.discardAll(); setDiscarded(true); setTarget(null); }
    catch (failure) { setActionError(failure instanceof Error ? failure.message : "Your changes could not be discarded."); }
  }
  function move(id: string, direction: -1 | 1, element: HTMLElement) {
    const current = latest.current;
    if (locked || !current.directory.canReorderPrograms) return;
    const index = current.directory.programs.findIndex(program => program.id === id);
    pendingOrderFocus.current = { id, direction, previous: element };
    current.directory.persistProgramOrder(moveProgram(current.directory.programs, index, direction));
  }
  function chooseSection(next: ProgramSection) {
    if (busy) return;
    setSection(next);
    if (next !== "visibility" && next !== "preview") latest.current.program.selectTab(next);
  }
  async function confirmLatest() {
    if (!confirmation || confirmBusy) return;
    setConfirmBusy(true);
    setActionError(null);
    try {
      if (confirmation === "program") await latest.current.actions.discardProgramConflict();
      else if (latest.current.directory.managementConflict) {
        latest.current.directory.applyDirectory(latest.current.directory.managementConflict, false);
        latest.current.directory.setManagementError(null);
      }
      setConfirmation(null);
    } catch (failure) { setActionError(failure instanceof Error ? failure.message : "Your draft is still here."); }
    finally { setConfirmBusy(false); }
  }
  function conflicts() {
    return <>
      {editor.program.programConflict && <section className="classic-programs-conflict" role="region" aria-label="Review latest program">
        <h3>Another editor saved this program</h3><p>Your draft is still here. Latest title: {editor.program.programConflict.program.display_title}.</p>
        <div className="classic-programs-buttons"><Button variant="outline" disabled={busy} onClick={() => editor.program.resolveProgramConflict(true)}>Keep my draft</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmation("program")}>Use latest saved page</Button></div>
      </section>}
      {editor.directory.managementConflict && <section className="classic-programs-conflict" role="region" aria-label="Review latest Programs directory">
        <h3>Another editor saved the directory</h3><p>Your order and visibility choices are still here. Latest order: {editor.directory.managementConflict.map(program => program.display_title + " (" + program.status + ")").join(", ")}.</p>
        <div className="classic-programs-buttons"><Button variant="outline" disabled={busy} onClick={() => { editor.directory.applyDirectory(editor.directory.managementConflict!, true); editor.directory.setManagementError("Your choices are ready to save over the reviewed directory."); }}>Keep my draft</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmation("directory")}>Use latest saved page</Button></div>
      </section>}
    </>;
  }
  const errors = [editor.state.error, editor.copy.pageCopyError, editor.directory.managementError, editor.state.cleanupError, actionError].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const saveControl = mediaBusy
    ? <AdminPendingButton className="classic-programs-header-action" label="Save changes" pendingLabel="Preparing photo…" pending />
    : uncertain ? <AdminPendingButton className="classic-programs-header-action" label="Confirm save" pendingLabel="Confirming…" pending={busy} onClick={() => void saveAttempt.current()} />
      : <AdminSaveButton ref={headerSave} className="classic-programs-header-action" state={editor.state.loading ? "clean" : save.state} onSave={() => void saveAttempt.current()} />;
  const footer = <AdminDialogFooter
    status={mediaBusy ? "Wait for your photo to finish." : dirty ? "Changes appear after Save changes." : undefined}
    primary={uncertain ? <AdminPendingButton label="Confirm save" pendingLabel="Confirming…" pending={busy} onClick={() => void saveAttempt.current()} /> : <Button ref={done} className="classic-programs-done" disabled={busy} onClick={close}>Done</Button>}
  >{uncertain && <Button ref={done} variant="outline" disabled={busy} onClick={close}>Done</Button>}</AdminDialogFooter>;

  return <AdminPage className="classic-programs">
    <AdminPageHeader eyebrow="Public website" title="Programs" description="The programs families can join, and the words around them on your website."
      actions={<div className="classic-programs-header-actions" data-admin-page-action-group="">
        {dirty && <Button variant="outline" className="classic-programs-header-action" disabled={busy || uncertain} onClick={() => void discard()}>Discard</Button>}
        {saveControl}
      </div>} />
    {errors.map(message => <p key={message} className="classic-programs-error" role="alert">{message}</p>)}
    {uncertain && <p className="classic-programs-notice" role="status">The previous save is still unconfirmed. Confirm save checks that same request before making another change.</p>}
    {discarded && <p className="classic-programs-notice" role="status">Changes discarded</p>}
    {conflicts()}
    <div className="classic-programs-toolbar">
      <PreviewToggle value={device} onChange={setDevice} />
      <span className="classic-programs-count"><span>{editor.state.loading ? "—" : editor.directory.programs.length}</span> programs</span>
      <div className="classic-programs-tools">
        {!editor.policy.hidesPageCopyEditor && <Button variant="outline" disabled={busy || editor.state.loading} onClick={event => openWords("homepageBand", event.currentTarget)}>Homepage band</Button>}
        <Button ref={orderButton} variant="outline" disabled={busy || editor.state.loading} onClick={event => openOrder(event.currentTarget)}>Order and visibility</Button>
        {!editor.policy.hidesProgramCreation && <Button variant="outline" disabled={busy || editor.state.loading} onClick={event => createProgram(event.currentTarget)}>Add a program</Button>}
      </div>
    </div>
    <div className="classic-programs-canvas" data-programs-phase={loading.phase} aria-busy={editor.state.loading || !previewReady || undefined}>
      <div className="classic-programs-loading" data-phase={loading.phase} aria-hidden={!loading.showSkeleton} role={loading.showSkeleton ? "status" : undefined} aria-label="Loading programs">
        <div className="classic-programs-skeleton-hero"><Shimmer className="h-4 w-24" /><Shimmer className="h-14 w-4/5" /><Shimmer className="h-14 w-3/5" /><Shimmer className="h-4 w-full" /><Shimmer className="h-4 w-4/5" /></div>
        <div className="classic-programs-skeleton-grid">{[0, 1].map(id => <div key={id}><Shimmer className="aspect-[16/10] w-full" /><Shimmer className="mt-5 h-8 w-4/5" /><Shimmer className="mt-3 h-4 w-2/3" /></div>)}</div>
        <div className="classic-programs-skeleton-close"><Shimmer className="h-10 w-2/3" /><Shimmer className="mt-4 h-4 w-4/5" /></div>
      </div>
      <div ref={preview} className="classic-programs-render" data-hidden={!loading.showContent || undefined}>
        <ProgramCanvasFrame path="/programs" classic device={device} autoHeight hiddenPrograms={hidden} programLabels={labels} editableSections={editable} onReady={onReady} onSelect={onSection} onProgramLink={openProgram}>
          {previews.directory(directoryPrograms, editor.copy.pageCopy)}
        </ProgramCanvasFrame>
      </div>
    </div>
    <AdminDialog open={target === "copy"} onClose={close} title={PAGE_COPY_SECTION_LABELS[editor.copy.activePageCopySection]} eyebrow="Programs page" size="md" busy={busy} initialFocus={() => fields.current?.querySelector<HTMLElement>("input,textarea") ?? done.current} finalFocus={restoreFocus} footer={footer}>
      <div ref={target === "copy" ? fields : undefined} className="classic-programs-dialog">
        <p className="classic-programs-hint">Leave a field empty to use the standard wording.</p>
        {editor.copy.pageCopyError && <p className="classic-programs-error" role="alert">{editor.copy.pageCopyError}</p>}
        <ProgramsCopyFields editor={editor} classic disabled={locked} />
      </div>
    </AdminDialog>
    <AdminDialog open={target === "program"} onClose={close} title={displayDraft?.id ? displayDraft.displayTitle || "Edit program" : "Add a program"} eyebrow="Program" size="xl" busy={busy} initialFocus={() => fields.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)') ?? fields.current?.querySelector<HTMLElement>("input:not(:disabled),textarea:not(:disabled),select:not(:disabled)") ?? done.current} finalFocus={restoreFocus} footer={footer}>
      <div className="classic-programs-dialog">
        {errors.map(message => <p key={message} className="classic-programs-error" role="alert">{message}</p>)}
        {conflicts()}
        <div className="classic-programs-two-pane">
          <nav ref={sectionNav} className="classic-programs-section-nav" aria-label="Program editor sections">
            {SECTIONS.map(item => <button key={item.id} type="button" aria-current={section === item.id ? "true" : undefined} disabled={busy} onClick={() => chooseSection(item.id)}>{item.label}</button>)}
          </nav>
          <div ref={target === "program" ? fields : undefined} className="classic-programs-pane" data-program-editor-pane={section}>
            {section === "visibility" && displayDraft ? <div className="classic-programs-visibility">
              <div><h3>Show on your website</h3><p>Turn off to hide this program without deleting it.</p></div>
              <AdminSwitch checked={displayDraft.status === "active"} label="Show this program on your website" disabled={locked} onCheckedChange={checked => {
                if (displayDraft.id) editor.directory.toggleProgramVisibility(displayDraft.id);
                else editor.program.updateDraft("status", checked ? "active" : "hidden");
              }} />
            </div> : section === "preview" ? <div className="classic-programs-detail-preview">
              <PreviewToggle value={detailDevice} onChange={setDetailDevice} />
              <ProgramCanvasFrame path={"/programs/" + (editor.preview.previewProgram.slug || "new-program")} classic device={detailDevice} programLabels={labels} editableSections={["Program hero", "Program details", "Program focus", "Registration band"]} onEscape={close} onProgramLink={openProgram} onSelect={(name, element) => {
                const next = name === "Registration band" ? "registration" : "content";
                setSection(next);
                editor.program.selectTab(next);
                setFocusRequest({ section: next });
              }}>
                {previews.detail(editor.preview.previewProgram, editor.preview.previewOtherPrograms)}
              </ProgramCanvasFrame>
            </div> : <ProgramFields editor={editor} section={section as ProgramEditorTab} disabled={locked} />}
          </div>
        </div>
      </div>
    </AdminDialog>
    <AdminDialog open={target === "order"} onClose={close} title="Order and visibility" eyebrow="Programs page" size="md" busy={busy} finalFocus={restoreFocus} footer={footer}>
      <div className="classic-programs-dialog">
        <p className="classic-programs-hint">Programs show on your website in this order. Hidden programs stay here.</p>
        <label className="classic-programs-field"><span className="classic-programs-label">Find a program</span><input type="search" value={editor.directory.programFilter} onChange={event => editor.directory.setProgramFilter(event.target.value)} /></label>
        {!editor.directory.canReorderPrograms && <p className="classic-programs-hint">Clear the filter to reorder.</p>}
        {editor.directory.managementError && <p className="classic-programs-error" role="alert">{editor.directory.managementError}</p>}
        {conflicts()}
        <ul ref={orderList} className="classic-programs-order">
          {editor.directory.filteredPrograms.map((program, index) => <li key={program.id} data-program-order-row={program.id ?? undefined}>
            <button type="button" className="classic-programs-order-name" disabled={busy} onClick={event => openProgram(program.slug, event.currentTarget)}><strong>{program.displayTitle || "Untitled program"}</strong><span>/programs/{program.slug}</span></button>
            <div className="classic-programs-order-controls">
              <Button variant="outline" size="icon" data-order-direction="-1" disabled={locked || !editor.directory.canReorderPrograms || index === 0} aria-label={"Move " + program.displayTitle + " up"} onClick={event => program.id && move(program.id, -1, event.currentTarget)}><ChevronUp size={16} aria-hidden="true" /></Button>
              <Button variant="outline" size="icon" data-order-direction="1" disabled={locked || !editor.directory.canReorderPrograms || index === editor.directory.filteredPrograms.length - 1} aria-label={"Move " + program.displayTitle + " down"} onClick={event => program.id && move(program.id, 1, event.currentTarget)}><ChevronDown size={16} aria-hidden="true" /></Button>
              <AdminSwitch checked={program.status === "active"} label={"Show " + program.displayTitle + " on your website"} disabled={locked} onCheckedChange={() => program.id && editor.directory.toggleProgramVisibility(program.id)} />
            </div>
          </li>)}
        </ul>
        {!editor.directory.filteredPrograms.length && <p className="classic-programs-empty">No programs match your search.</p>}
      </div>
    </AdminDialog>
    <AdminConfirmDialog open={confirmation !== null} title="Use the latest saved page?" confirmLabel="Use latest saved page" destructive busy={confirmBusy} onCancel={() => { if (!confirmBusy) setConfirmation(null); }} onConfirm={() => void confirmLatest()}>
      Your unsaved {confirmation === "program" ? "program changes" : "order and visibility choices"} will be discarded. Other unsaved work stays here.
      {actionError && <p className="classic-programs-error" role="alert">{actionError}</p>}
    </AdminConfirmDialog>
  </AdminPage>;
}
