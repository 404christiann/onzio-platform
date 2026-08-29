"use client";

import { useCallback } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

/**
 * useSortableList / useSortableRow — minimal drag-and-drop reorder helpers
 * built on @dnd-kit/core + @dnd-kit/sortable.
 *
 * These wrap DndContext/SortableContext/useSortable just enough for a
 * future consumer with an existing ordered list (e.g. the Programs page)
 * to drop in drag handles and get an `onReorder(newOrderIds: string[])`
 * callback on drop. Matches the existing pattern where reordering writes
 * immediately and is not gated behind a Save button — see `reorderProgram`
 * in app/admin/(protected)/programs/page.tsx and `moveTryout` in
 * lib/tryout-admin.ts. The consumer keeps owning persistence: turn the new
 * id order into `sortOrder`/`sort_order` values and write them the same
 * way those two already do. Nothing in this file writes to the database.
 *
 * Usage — one `useSortableList` call for the list, one `useSortableRow`
 * call per row (the row component must render inside the `<SortableContext>`
 * this hook's `strategy`/`collisionDetection` are meant to be passed to):
 *
 * ```tsx
 * import { DndContext, SortableContext } from "@dnd-kit/core"; // core re-exports DndContext
 * import { SortableContext as SortableContextImpl } from "@dnd-kit/sortable";
 * import { useSortableList, useSortableRow } from "@/components/admin/useSortableList";
 *
 * function ProgramList({ programs, onReorder }) {
 *   const { sensors, collisionDetection, strategy, handleDragEnd } = useSortableList({
 *     ids: programs.map((p) => p.id),
 *     onReorder, // e.g. persist via the same per-row `sort_order` update reorderProgram does
 *   });
 *
 *   return (
 *     <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
 *       <SortableContext items={programs.map((p) => p.id)} strategy={strategy}>
 *         {programs.map((program) => (
 *           <ProgramRow key={program.id} id={program.id} program={program} />
 *         ))}
 *       </SortableContext>
 *     </DndContext>
 *   );
 * }
 *
 * function ProgramRow({ id, program }) {
 *   const { setNodeRef, style, attributes, listeners, isDragging } = useSortableRow(id);
 *   return (
 *     <div ref={setNodeRef} style={style} className={isDragging ? "opacity-50" : undefined}>
 *       <button {...attributes} {...listeners} aria-label={`Reorder ${program.title}`}>
 *         ::
 *       </button>
 *       {program.title}
 *     </div>
 *   );
 * }
 * ```
 */

type UseSortableListOptions = {
  /** Current item ids, in display order. */
  ids: readonly string[];
  /** Called with the full new id order once a drag completes and the order actually changed. */
  onReorder: (newOrderIds: string[]) => void;
};

export function useSortableList({ ids, onReorder }: UseSortableListOptions) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      onReorder(arrayMove([...ids], oldIndex, newIndex));
    },
    [ids, onReorder],
  );

  return {
    sensors,
    collisionDetection: closestCenter,
    strategy: verticalListSortingStrategy,
    handleDragEnd,
  };
}

/**
 * Per-row helper. Call once per sortable row, inside the `<SortableContext>`
 * rendered by the consumer of `useSortableList`. Returns everything needed
 * to wire up the row's drag handle without pulling in `@dnd-kit/utilities`.
 */
export function useSortableRow(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = transform
    ? {
        transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`,
        transition: transition ?? undefined,
      }
    : transition
      ? { transition }
      : undefined;

  return { setNodeRef, style, attributes, listeners, isDragging };
}
