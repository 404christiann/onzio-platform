"use client";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { GripVertical } from "@/components/admin/icons";
import { useSortableRow } from "@/components/admin/useSortableList";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import type { ProgramDraft } from "@/lib/program-admin";
import type { ProgramsEditor } from "./useProgramsEditor";
import { LAYOUT_VARIANT_LABELS, summarizeHeroDetailMedia } from "./program-editor-types";

export function ProgramsManagement({ editor }: { editor: ProgramsEditor }) {
  const { draft, editorLocked } = editor.program;
  const { gallery } = editor.media;
  const { programs, filteredPrograms, programFilter, setProgramFilter, managementError, managementSaved, managementSaving, managementDirty, unconfirmedManagement, managementConflict, canReorderPrograms, programDragEnabled, programSensors, programCollisionDetection, programSortingStrategy, handleProgramDragEnd, sortableProgramIds, toggleProgramVisibility, saveManagement } = editor.directory;
  const { selectProgram } = editor.view;
  return (
          <aside className="min-w-0 self-start space-y-3 lg:sticky lg:top-40">
            <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="px-3 pb-3 pt-2">
                <h2 className="font-body text-base font-semibold text-foreground">Manage programs</h2>
                <p className="mt-1 font-body text-xs text-muted-foreground">Set the public order and visibility, then save this page.</p>
                {managementError && <p className="mt-3 text-sm text-destructive" role="alert">{managementError}</p>}
                {managementSaved && <p className="mt-3 text-sm text-success" role="status">Programs directory saved</p>}
                <input
                  type="search"
                  value={programFilter}
                  onChange={(event) => setProgramFilter(event.target.value)}
                  placeholder="Find a program"
                  aria-label="Find a program"
                  className={`${ADMIN_INPUT_CLASS} mt-2`}
                />
                {!canReorderPrograms && (
                  <p className="mt-2 font-body text-xs leading-4 text-muted-foreground">
                    Clear the filter to drag and reorder.
                  </p>
                )}
              </div>
              {filteredPrograms.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center font-body text-xs text-muted-foreground">
                  No programs match &ldquo;{programFilter.trim()}&rdquo;.
                </p>
              ) : (
                <DndContext
                  sensors={programDragEnabled ? programSensors : []}
                  collisionDetection={programCollisionDetection}
                  onDragEnd={handleProgramDragEnd}
                >
                  <SortableContext items={sortableProgramIds} strategy={programSortingStrategy}>
                    <div className="space-y-2">
                      {filteredPrograms.map((program) => (
                        <ProgramListRow
                          key={program.id}
                          program={program}
                          isSelected={draft?.id === program.id}
                          onSelect={() => selectProgram(program)}
                          onToggleVisibility={() => { if (program.id) toggleProgramVisibility(program.id); }}
                          dragDisabled={!programDragEnabled}
                          editingDisabled={editorLocked}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              <p className="mt-3 px-1 font-body text-xs leading-4 text-muted-foreground">
                Changes appear on your website after you save.
              </p>
              <button type="button" onClick={() => void saveManagement()} disabled={(!managementDirty && !unconfirmedManagement) || managementSaving || Boolean(managementConflict)} className="mt-4 min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-body text-sm font-semibold normal-case tracking-normal text-primary-foreground disabled:opacity-40">{managementSaving ? "Saving…" : unconfirmedManagement ? "Confirm save" : "Save page"}</button>
            </div>

            {draft && (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="font-body text-xs font-semibold normal-case tracking-normal text-muted-foreground">
                  This program
                </p>
                <dl className="mt-3 space-y-2">
                  <ThisProgramStat
                    label="Layout variant"
                    value={LAYOUT_VARIANT_LABELS[draft.layoutVariant]}
                  />
                  <ThisProgramStat
                    label="Highlights"
                    value={String(draft.highlights.length)}
                  />
                  <ThisProgramStat
                    label="Registration band"
                    value={draft.registrationEnabled ? "On" : "Off"}
                    tone={draft.registrationEnabled ? "success" : "muted"}
                  />
                  <ThisProgramStat
                    label="Gallery images"
                    value={String(gallery.length)}
                  />
                  <ThisProgramStat
                    label="Hero / detail image"
                    value={summarizeHeroDetailMedia(draft).label}
                    tone={
                      summarizeHeroDetailMedia(draft).complete
                        ? "default"
                        : "warning"
                    }
                  />
                </dl>
              </div>
            )}
          </aside>
  );
}

function ThisProgramStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 font-body text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-semibold ${toneClass}`}>{value}</dd>
    </div>
  );
}

function ProgramListRow({
  program,
  isSelected,
  onSelect,
  onToggleVisibility,
  dragDisabled,
  editingDisabled,
}: {
  program: ProgramDraft;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  dragDisabled: boolean;
  editingDisabled: boolean;
}) {
  const { setNodeRef, style, attributes, listeners, isDragging } = useSortableRow(
    program.id ?? "",
  );
  const isActive = program.status === "active";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border p-2 transition ${
        isSelected ? "border-primary/40 bg-primary/10" : "border-border bg-background"
      } ${isDragging ? "relative z-10 opacity-60 shadow-lg" : ""}`}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          {...(dragDisabled ? {} : attributes)}
          {...(dragDisabled ? {} : listeners)}
          disabled={dragDisabled}
          aria-label={`Reorder ${program.displayTitle || "program"}`}
          title={dragDisabled ? "Clear the filter to reorder" : "Drag to reorder"}
          className="mt-1.5 flex size-11 flex-none cursor-grab items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onSelect}
          disabled={editingDisabled}
          className="min-h-11 w-full min-w-0 rounded-lg px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-ring/60"
        >
          <span className="block truncate font-body text-sm font-semibold normal-case tracking-normal text-foreground">
            {program.displayTitle || "Untitled program"}
          </span>
          <span className="mt-1 block truncate font-body text-xs text-muted-foreground">
            /programs/{program.slug}
          </span>
          <span
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-body text-xs font-semibold normal-case tracking-normal ${
              isActive ? "bg-success/10 text-success" : "bg-card text-muted-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 flex-none rounded-full ${
                isActive ? "bg-success" : "bg-muted-foreground"
              }`}
            />
            {program.status}
          </span>
        </button>
      </div>
      <button type="button" onClick={onToggleVisibility} disabled={editingDisabled} className="mt-2 min-h-11 w-full rounded-lg border border-border px-3 py-2 text-left font-body text-sm font-semibold text-foreground hover:bg-accent">{isActive ? "Hide from website" : "Show on website"}</button>
    </div>
  );
}

