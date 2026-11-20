"use client";
import { useState } from "react";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { OperationsToolbarSkeleton, ProgramsCopySkeleton, ProgramsWorkspaceSkeleton } from "@/components/admin/AdminOperationsSkeletons";
import { AdminPage, AdminPageHeader, AdminPageToolbar, AdminPanel } from "@/components/admin/AdminPage";
import { AdminSectionRail } from "@/components/admin/AdminSectionRail";
import ProgramCanvasFrame from "@/components/admin/ProgramCanvasFrame";
import PageEditorInspector from "@/components/admin/PageEditorInspector";
import type { ProgramsEditor } from "./useProgramsEditor";
import type { ProgramPreviews } from "./program-previews";
import type { PageCopySection } from "./program-editor-types";
import { ProgramFields } from "./ProgramFields";
import { ProgramsCopyFields } from "./ProgramsCopyFields";
import { ProgramsManagement } from "./ProgramsManagement";

export function LegacyProgramsEditor({ editor, previews }: { editor: ProgramsEditor; previews: ProgramPreviews }) {
  const [replaceProgramDraft, setReplaceProgramDraft] = useState(false);
  const [replaceDirectory, setReplaceDirectory] = useState(false);
  const { hidesSlugField, hidesProgramCreation, hidesPageCopyEditor } = editor.policy;
  const { loading, error } = editor.state;
  const { draft, errors, dirty, saving, saved, editorLocked, activeTab, tabDirection, programConflict, unconfirmedProgram, updateDraft, selectTab, saveProgram, discardDraftChanges, derivedSlugForNewProgram, resolveProgramConflict, addHighlight, setHighlight, removeHighlight, reorderHighlight } = editor.program;
  const { gallery, galleryInput, uploadingRole, uploadingGallery, uploadMedia, uploadGalleryImage, setGalleryAlt, reorderGallery, removeGalleryImage } = editor.media;
  const { pageCopy, pageCopyErrors, pageCopyDefaults, pageCopyDirection, pageCopyDirty, pageCopyError, pageCopyPanel, pageCopySaveLabel, pageCopySaved, pageCopySaving, pageCopySectionItems, activePageCopySection, selectPageCopySection, updatePageCopy, savePageCopy } = editor.copy;
  const { programs, filteredPrograms, programFilter, setProgramFilter, managementSaving, managementSaved, managementError, setManagementError, managementDirty, managementConflict, unconfirmedManagement, canReorderPrograms, programDragEnabled, programSensors, programCollisionDetection, programSortingStrategy, handleProgramDragEnd, sortableProgramIds, persistProgramOrder, toggleProgramVisibility, saveManagement, applyDirectory } = editor.directory;
  const { pageView, selectedSection, setSelectedSection, selectCanvasSection, selectProgram, showDirectory, showManage, startCreate } = editor.view;
  const { previewProgram, previewOtherPrograms, directoryPrograms } = editor.preview;
  return (
    // overflow-x-clip (not overflow-hidden): still clips the SlidingPanel's
    // horizontal slide animation, but `clip` doesn't turn this wrapper into a
    // scroll container, which would silently disable the sticky rail/preview
    // columns below.
    <AdminPage className="overflow-x-clip">
      <AdminPageHeader
        eyebrow="Public website"
        title="Programs"
        description="Choose a program to edit its page, photos, and registration details."
        actions={!hidesProgramCreation ? (
          <button
            type="button"
            onClick={startCreate}
            disabled={loading}
            className="min-h-11 rounded-lg bg-primary px-5 py-3 font-body text-sm font-semibold normal-case tracking-normal text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create program
          </button>
        ) : undefined}
      />

      <div className="program-editor-layout">
        <nav className="program-editor-navigation" aria-label="Program pages">
          <div className="program-editor-navigation-desktop">
            <h2>Program pages</h2>
            <button type="button" aria-current={pageView === "directory" ? "page" : undefined} onClick={showDirectory}>All programs <span>/programs</span></button>
            <input type="search" value={programFilter} onChange={(event) => setProgramFilter(event.target.value)} placeholder="Find a program" aria-label="Find a program" />
            <div className="program-editor-navigation-list">
              {filteredPrograms.map((program) => <button key={program.id} type="button" aria-current={pageView === "detail" && draft?.id === program.id ? "page" : undefined} onClick={() => selectProgram(program)}>
                <strong>{program.navLabel || program.displayTitle}</strong><span>{program.status === "hidden" ? "Hidden · " : ""}/programs/{program.slug}</span>
              </button>)}
              {filteredPrograms.length === 0 && <p>No programs match your search.</p>}
            </div>
            <button type="button" aria-current={pageView === "manage" ? "page" : undefined} onClick={showManage}>Manage programs <span>Order and visibility</span></button>
          </div>
          <details className="program-editor-navigation-phone" key={`${pageView}-${draft?.id ?? "none"}`}>
            <summary><span>{pageView === "directory" ? "All programs" : pageView === "manage" ? "Manage programs" : draft?.navLabel || draft?.displayTitle || "New program"}</span><span>Change page</span></summary>
            <div className="program-editor-navigation-phone-menu">
              <input type="search" value={programFilter} onChange={(event) => setProgramFilter(event.target.value)} placeholder="Find a program" aria-label="Find a program" />
              <button type="button" onClick={showDirectory}>All programs</button>
              {filteredPrograms.map((program) => <button key={program.id} type="button" onClick={() => selectProgram(program)}>{program.navLabel || program.displayTitle}{program.status === "hidden" ? " · Hidden" : ""}</button>)}
              {filteredPrograms.length === 0 && <p>No programs match your search.</p>}
              <button type="button" onClick={showManage}>Manage programs</button>
            </div>
          </details>
        </nav>
        <div className="program-editor-main">

      {error && (
        <div className="mb-5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {loading && !hidesPageCopyEditor && <ProgramsCopySkeleton />}

      {!loading && !hidesPageCopyEditor && pageView === "directory" && (
        <div className="grid min-w-0 gap-6 sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
          <AdminSectionRail
            className="self-start"
            items={pageCopySectionItems}
            value={activePageCopySection}
            onChange={(id) => selectPageCopySection(id as PageCopySection)}
          />

          <div ref={pageCopyPanel} className="min-w-0 scroll-mt-24 self-start">
          <AdminPanel className="p-4 sm:p-5">
            <div className="mb-5">
              <h2 className="font-body text-sm font-semibold normal-case tracking-normal text-foreground">
                Programs page copy
              </h2>
              <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                The wording around your programs — the homepage &ldquo;pathway&rdquo;
                band, the /programs page header, and the closing band at the
                bottom of /programs. The programs themselves are edited below.
                Leave a field empty to keep the standard wording shown as its
                placeholder.
              </p>
            </div>

            {pageCopyError && (
              <div className="mb-5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive" role="alert">
                {pageCopyError}
              </div>
            )}

            <ProgramsCopyFields editor={editor} />

            <div className="mt-6 flex items-center gap-4 border-t border-border pt-6">
              <button
                type="button"
                onClick={() => void savePageCopy()}
                disabled={pageCopySaving || !pageCopyDirty}
                className="min-h-11 rounded-lg bg-primary px-6 py-3 font-body text-sm font-semibold normal-case tracking-normal text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {pageCopySaving ? "Saving…" : pageCopySaveLabel}
              </button>
              {pageCopySaved && !pageCopyDirty && (
                <span className="font-body text-xs text-success" role="status">
                  Page copy saved
                </span>
              )}
            </div>
          </AdminPanel>
          </div>
        </div>
      )}

      {loading && <OperationsToolbarSkeleton label="Loading program actions" />}

      {!loading && draft && pageView === "detail" && (
        <AdminPageToolbar className="program-editor-detail-toolbar z-10 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="font-body text-xs font-semibold normal-case tracking-normal text-muted-foreground">
              Editing
            </span>
            <span className="truncate font-body text-base font-semibold normal-case text-foreground">
              {draft.id ? draft.displayTitle || "Untitled program" : "New program"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-body text-xs font-semibold normal-case tracking-normal ${
                draft.status === "active"
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 flex-none rounded-full ${
                  draft.status === "active" ? "bg-success" : "bg-muted-foreground"
                }`}
              />
              {draft.status === "active" ? "Active" : "Hidden"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            {dirty && (
              <span className="inline-flex items-center gap-1.5 font-body text-xs font-semibold text-warning-ink">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 flex-none rounded-full bg-warning"
                />
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              onClick={discardDraftChanges}
              disabled={!dirty || editorLocked}
              className="min-h-11 rounded-lg border border-border px-4 py-2.5 font-body text-sm font-semibold normal-case tracking-normal text-muted-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void saveProgram()}
              disabled={
                saving || uploadingRole !== null || uploadingGallery || (!dirty && !unconfirmedProgram) || Boolean(programConflict)
              }
              className="min-h-11 rounded-lg bg-primary px-6 py-3 font-body text-sm font-semibold normal-case tracking-normal text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {unconfirmedProgram ? "Confirm save" : "Save changes"}
            </button>
          </div>
          <p className="sr-only" role="status">{saving ? "Saving program…" : saved ? "Program saved" : ""}</p>
        </AdminPageToolbar>
      )}

      {programConflict && <div role="region" aria-label="Review latest program" className="mb-4 rounded-xl border border-border bg-card p-4 text-sm"><p>Another editor saved this program. Your draft is still here. Latest title: {programConflict.program.display_title}.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded-lg border border-border px-3" onClick={() => resolveProgramConflict(true)}>Keep my draft</button><button type="button" className="min-h-11 rounded-lg border border-border px-3" onClick={() => setReplaceProgramDraft(true)}>Use latest saved page</button></div></div>}
      <AdminConfirmDialog open={replaceProgramDraft} title="Use the latest saved page?" confirmLabel="Use latest saved page" onCancel={() => setReplaceProgramDraft(false)} onConfirm={() => { setReplaceProgramDraft(false); resolveProgramConflict(false); }}>Discard this program draft and use its latest saved page?</AdminConfirmDialog>
      {managementConflict && <div role="region" aria-label="Review latest Programs directory" className="mb-4 rounded-xl border border-border bg-card p-4 text-sm"><p>Another editor saved the directory. Your order and visibility choices are still here. Latest order: {managementConflict.map((row) => `${row.display_title} (${row.status})`).join(", ")}.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded-lg border border-border px-3" onClick={() => { applyDirectory(managementConflict, true); setManagementError("Your choices are ready to save over the reviewed directory."); }}>Keep my draft</button><button type="button" className="min-h-11 rounded-lg border border-border px-3" onClick={() => setReplaceDirectory(true)}>Use latest saved page</button></div></div>}
      <AdminConfirmDialog open={replaceDirectory && managementConflict !== null} title="Use the latest saved directory?" confirmLabel="Use latest saved page" onCancel={() => setReplaceDirectory(false)} onConfirm={() => { setReplaceDirectory(false); if (managementConflict) { applyDirectory(managementConflict, false); setManagementError(null); } }}>Discard your order and visibility choices?</AdminConfirmDialog>
      {loading ? (
        <ProgramsWorkspaceSkeleton label="Loading programs" />
      ) : pageView === "directory" ? (
        <div className="program-editor-canvas-wrap">
          <div className="program-editor-canvas-heading"><div><h2>All programs</h2><p>Tap a program card to edit that public page.</p></div><span>{hidesPageCopyEditor ? "Page copy managed by Onzio" : "Click a heading or paragraph to change its words"}</span></div>
          {managementDirty && <div className="program-editor-directory-save"><p>Program order or visibility has not been saved yet.</p><button type="button" onClick={() => void saveManagement()} disabled={managementSaving || Boolean(managementConflict)}>{managementSaving ? "Saving…" : unconfirmedManagement ? "Confirm save" : "Save page"}</button></div>}
          {managementError && <p className="mb-3 text-sm text-destructive" role="alert">{managementError}</p>}
          <ProgramCanvasFrame path="/programs" onSelect={selectCanvasSection} onProgramLink={(slug) => { const found = programs.find((program) => program.slug === slug); if (found) selectProgram(found); }}>
            {previews.directory(directoryPrograms, pageCopy)}
          </ProgramCanvasFrame>
          {selectedSection && <div className="program-editor-ownership" role="status"><strong>{selectedSection}</strong>{selectedSection === "Program cards" ? <p>Select a program card to open its page. Add, order, and hide programs in Manage programs.</p> : <p>This wording is managed by Onzio for the Academy template.</p>}<button type="button" onClick={() => setSelectedSection(null)}>Done</button></div>}
        </div>
      ) : programs.length === 0 && !draft ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-sm">
          <h2 className="font-body text-xl font-semibold normal-case text-foreground">
            No programs yet
          </h2>
          <p className="mx-auto mt-2 max-w-md font-body text-sm leading-6 text-muted-foreground">
            {hidesProgramCreation
              ? "Your programs are set up by Onzio. Contact us to add one."
              : "Create the first reusable program page. Nothing is published until a valid program is saved as active."}
          </p>
          {!hidesProgramCreation && (
            <button
              type="button"
              onClick={startCreate}
              className="min-h-11 mt-6 rounded-lg border border-border px-5 py-3 font-body text-sm font-semibold normal-case tracking-normal text-foreground transition hover:bg-accent"
            >
              Create program
            </button>
          )}
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-6 ${pageView === "detail" ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}
        >
          {pageView === "manage" && (
          <ProgramsManagement editor={editor} />
          )}

          {pageView === "detail" && draft && (
            <PageEditorInspector open={Boolean(selectedSection)} onClose={() => setSelectedSection(null)} label="Program page tools" breakpoint={1023} className="program-editor-inspector min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6" data-selected={Boolean(selectedSection)}>
              <div className="program-editor-inspector-heading"><h2>{selectedSection ?? "Select a section on the page"}</h2><div><button type="button" onClick={() => void saveProgram()} disabled={(!dirty && !unconfirmedProgram) || saving || uploadingRole !== null || uploadingGallery || Boolean(programConflict)}>{unconfirmedProgram ? "Confirm save" : "Save program"}</button><button type="button" onClick={() => setSelectedSection(null)}>Done</button></div></div>
              {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
              {selectedSection === "Explore other programs" ? <p className="font-body text-sm leading-6 text-muted-foreground">This section is set by the Academy template. Select another program in the page to open its editor.</p> : selectedSection ? <fieldset className="program-editor-fields" disabled={editorLocked}>
              <ProgramFields editor={editor} />
              </fieldset> : <p className="font-body text-sm leading-6 text-muted-foreground">Tap a section in the public page to edit it. Changes appear on your website after Save.</p>}
            </PageEditorInspector>
          )}

          {pageView === "detail" && draft && (
            <aside className="program-editor-detail-canvas min-w-0 self-start rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-40">
              <p className="font-body text-xs font-semibold normal-case tracking-normal text-muted-foreground">
                Program page preview
              </p>
              <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
                The real public page, including unsaved changes. Turning the
                Registration tab&rsquo;s toggle on shows the registration band
                exactly where visitors would find it.
              </p>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <ProgramCanvasFrame path={`/programs/${previewProgram.slug || "new-program"}`} onSelect={selectCanvasSection} onProgramLink={(slug) => { const found = programs.find((program) => program.slug === slug); if (found) selectProgram(found); }}>
                  {previews.detail(previewProgram, previewOtherPrograms)}
                </ProgramCanvasFrame>
              </div>
            </aside>
          )}
        </div>
      )}
        {!loading && (pageView === "detail" || managementDirty) && !selectedSection && <div className="program-editor-mobile-save">
          <span>{pageView === "detail" ? (draft?.displayTitle || "Program page") : "Programs directory"}</span>
          <button type="button" onClick={() => void (pageView === "detail" ? saveProgram() : saveManagement())} disabled={pageView === "detail" ? (!dirty && !unconfirmedProgram) || saving || uploadingRole !== null || uploadingGallery || Boolean(programConflict) : (!managementDirty && !unconfirmedManagement) || managementSaving || Boolean(managementConflict)}>{pageView === "detail" ? (saving ? "Saving…" : unconfirmedProgram ? "Confirm save" : "Save program") : (managementSaving ? "Saving…" : unconfirmedManagement ? "Confirm save" : "Save page")}</button>
        </div>}
        </div>
      </div>
    </AdminPage>
  );
}
