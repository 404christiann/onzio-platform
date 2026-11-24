"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";

import { currentAdminTab, trackAdminEvent } from "@/lib/admin-analytics";
import ResilientImage from "@/components/ResilientImage";
import { useAnimatedList } from "./useAnimatedList";
import { useAdminToast } from "./AdminToast";
import { imageAccept, imageFileIssue, imageHint, type AdminImageRules } from "./adminImageFiles";
import styles from "./AdminPhotoManager.module.css";

export type AdminPhoto = {
  id: string;
  url: string;
  description: string;
  name?: string;
};

export type AdminPhotoManagerProps = AdminImageRules & {
  label: string;
  collectionId: string;
  onAbandonedUpload?: (photos: AdminPhoto[], collectionId: string) => void;
  variant: "rows" | "tiles";
  photos: readonly AdminPhoto[];
  onChange: (photos: AdminPhoto[]) => void;
  onUpload: (files: File[]) => Promise<AdminPhoto[]>;
  onDirty?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onUndoPendingChange?: (pending: boolean) => void;
  showDescriptions?: boolean;
  descriptionLabel?: string;
  /** The caller may already present per-file failures or an intentional cancellation. */
  emptyUploadMessage?: string;
  removalMessage?: string;
  reorderLabels?: "up-down" | "earlier-later";
  disabled?: boolean;
  /** Static slot name for analytics. Defaults to the current admin tab id. */
  analyticsSlot?: string;
};

const limit = 6;

export function AdminPhotoManager({ collectionId, ...props }: AdminPhotoManagerProps) {
  return <PhotoCollection key={collectionId} collectionId={collectionId} {...props} />;
}

function PhotoCollection({
  collectionId, label, variant, photos, onChange, onUpload, onAbandonedUpload, onDirty, disabled = false,
  allowedTypes, maxBytes,
  onPendingChange, onUndoPendingChange, showDescriptions = true, descriptionLabel = "Description", emptyUploadMessage = "The photos could not be uploaded. Try again.", removalMessage, reorderLabels = "up-down", analyticsSlot,
}: AdminPhotoManagerProps) {
  const input = useRef<HTMLInputElement>(null);
  const current = useRef(photos);
  current.current = photos;
  const logicalOrder = useRef(photos.map((photo) => photo.id));
  for (const photo of photos) {
    if (!logicalOrder.current.includes(photo.id)) logicalOrder.current.push(photo.id);
  }
  const dragId = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const reservedSlots = useRef(0);
  const undoSlots = useRef(new Set<number>());
  const nextUndoSlot = useRef(0);
  const [undoCount, setUndoCount] = useState(0);
  const nextPendingId = useRef(0);
  const activeBatches = useRef(0);
  const [pending, setPending] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<{ id: number; name: string }[]>([]);
  const [message, setMessage] = useState("");
  const [successIds, setSuccessIds] = useState<string[]>([]);
  const hintId = useId();
  const { showUndo, expireUndo } = useAdminToast();
  const alive = useRef(true);
  const undoToastIds = useRef(new Set<number>());
  const preparation = useRef<{ count: number; notify?: (pending: boolean) => void }>({ count: 0 });
  const pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  const chooser = useRef<typeof preparation.current | null>(null);
  function beginPreparation() {
    if (!preparation.current.count) preparation.current = { count: 0, notify: pendingCallback.current };
    const attempt = preparation.current;
    attempt.count++;
    if (attempt.count === 1) attempt.notify?.(true);
    return attempt;
  }
  const finishPreparation = useCallback((attempt: typeof preparation.current) => {
    if (preparation.current !== attempt) return;
    attempt.count--;
    if (!attempt.count) attempt.notify?.(false);
  }, []);
  const cancelChooser = useCallback(() => {
    const attempt = chooser.current;
    chooser.current = null;
    if (attempt) finishPreparation(attempt);
  }, [finishPreparation]);
  const undoCallback = useRef(onUndoPendingChange);
  undoCallback.current = onUndoPendingChange;
  const undoNotified = useRef(false);
  function updateUndoCount() {
    const pending = undoSlots.current.size > 0;
    setUndoCount(undoSlots.current.size);
    if (pending !== undoNotified.current) {
      undoNotified.current = pending;
      undoCallback.current?.(pending);
    }
  }
  useLayoutEffect(() => {
    alive.current = true;
    const ids = undoToastIds.current;
    const picker = input.current;
    picker?.addEventListener("cancel", cancelChooser);
    return () => {
      alive.current = false;
      picker?.removeEventListener("cancel", cancelChooser);
      chooser.current = null;
      const attempt = preparation.current;
      preparation.current = { count: 0 };
      if (attempt.count) attempt.notify?.(false);
      if (undoNotified.current) {
        undoNotified.current = false;
        undoCallback.current?.(false);
      }
      for (const id of ids) expireUndo(id);
      ids.clear();
    };
  }, [expireUndo, cancelChooser]);
  const animated = useAnimatedList({ axis: variant === "tiles" ? "both" : "vertical" });
  const busy = disabled || pending;
  const availableSlots = Math.max(0, limit - photos.length - reservedSlots.current - undoCount);
  const rules = { allowedTypes, maxBytes };

  function update(next: AdminPhoto[]) {
    current.current = next;
    onChange(next);
    onDirty?.();
  }

  function move(id: string, offset: number) {
    const before = [...current.current];
    const index = before.findIndex((photo) => photo.id === id);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= before.length || busy) return;
    const [photo] = before.splice(index, 1);
    before.splice(destination, 0, photo);
    const order = logicalOrder.current.filter((key) => key !== id);
    const next = before[destination + 1]?.id;
    const previous = before[destination - 1]?.id;
    const anchor = next ? order.indexOf(next) : previous ? order.indexOf(previous) + 1 : order.length;
    order.splice(anchor < 0 ? order.length : anchor, 0, id);
    logicalOrder.current = order;
    const hadArrowFocus = document.activeElement instanceof HTMLButtonElement
      && document.activeElement.hasAttribute("data-move")
      && document.activeElement.closest("[data-photo-id]")?.getAttribute("data-photo-id") === id;
    animated.change({ type: "reorder" }, () => update(before));
    if (hadArrowFocus) queueMicrotask(() => {
      const row = Array.from(animated.listRef.current?.children ?? []).find((element) =>
        element instanceof HTMLElement && element.dataset.photoId === id);
      const direction = destination === 0 ? "down" : destination === before.length - 1 ? "up" : offset < 0 ? "up" : "down";
      row?.querySelector<HTMLButtonElement>(`[data-move="${direction}"]`)?.focus({ preventScroll: true });
    });
  }

  function remove(id: string) {
    const before = [...current.current];
    const index = before.findIndex((photo) => photo.id === id);
    if (index < 0 || busy) return;
    const removed = before[index];
    const slot = ++nextUndoSlot.current;
    undoSlots.current.add(slot);
    updateUndoCount();
    animated.change({ type: "remove", key: id }, () => update(before.filter((photo) => photo.id !== id)));
    const toastId = showUndo({
      message: removalMessage ?? `Removed ${removed.name || (index === 0 ? "cover photo" : `photo ${index + 1}`)}`,
      onUndo: () => {
        undoToastIds.current.delete(toastId);
        if (!alive.current) return;
        undoSlots.current.delete(slot);
        updateUndoCount();
        const latest = [...current.current];
        if (latest.some((photo) => photo.id === id)) return;
        const orderIndex = logicalOrder.current.indexOf(id);
        const successor = logicalOrder.current.slice(orderIndex + 1)
          .find((key) => latest.some((photo) => photo.id === key));
        const insertion = successor ? latest.findIndex((photo) => photo.id === successor) : latest.length;
        latest.splice(insertion, 0, removed);
        animated.change({ type: "add", key: id }, () => update(latest));
      },
      onExpire: () => {
        undoToastIds.current.delete(toastId);
        if (!alive.current) return;
        logicalOrder.current = logicalOrder.current.filter((key) => key !== id);
        undoSlots.current.delete(slot);
        updateUndoCount();
      },
    });
    undoToastIds.current.add(toastId);
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length || disabled) { cancelChooser(); return; }
    const attempt = chooser.current ?? beginPreparation();
    chooser.current = null;
    const incoming = Array.from(files);
    const wasIdle = activeBatches.current === 0;
    const held = Math.min(incoming.length, Math.max(0,
      limit - current.current.length - reservedSlots.current - undoSlots.current.size));
    reservedSlots.current += held;
    if (held) {
      activeBatches.current += 1;
      setPending(true);
    }
    if (wasIdle) setMessage("");
    let selectedCount = held;
    let pendingIds: number[] = [];
    try {
      const accepted: File[] = [];
      const problems: string[] = [];
      for (const file of incoming) {
        const issue = await imageFileIssue(file, rules);
        if (issue) problems.push(issue);
        else accepted.push(file);
      }
      if (!alive.current) return;
      const skipped = Math.max(0, accepted.length - held);
      const selected = accepted.slice(0, held);
      if (skipped) problems.push(`Only 6 photos fit. ${skipped} were not added.`);
      if (problems.length) setMessage((previous) => [previous, ...problems].filter(Boolean).join(" "));
      if (selected.length < held) {
        reservedSlots.current -= held - selected.length;
        selectedCount = selected.length;
      }
      if (!selected.length) return;
      const tiles = selected.map((file) => ({ id: ++nextPendingId.current, name: file.name }));
      pendingIds = tiles.map((tile) => tile.id);
      setPendingPhotos((previous) => [...previous, ...tiles]);
      const slot = analyticsSlot ?? currentAdminTab();
      let added: AdminPhoto[];
      try {
        added = await onUpload(selected);
      } catch (error) {
        trackAdminEvent("admin_media_uploaded", { slot, ok: false });
        throw error;
      }
      trackAdminEvent("admin_media_uploaded", { slot, ok: added.length > 0 });
      if (!alive.current) {
        onAbandonedUpload?.(added, collectionId);
        return;
      }
      const known = new Set(current.current.map((photo) => photo.id));
      const unique = added.filter((photo) => {
        if (known.has(photo.id)) return false;
        known.add(photo.id);
        return true;
      });
      const room = Math.max(0, limit - current.current.length - undoSlots.current.size);
      const committed = unique.slice(0, Math.min(selected.length, room));
      if (committed.length < unique.length) {
        setMessage((previous) => [previous, `Only 6 photos fit. ${unique.length - committed.length} were not added.`].filter(Boolean).join(" "));
      }
      if (!committed.length) {
        if (emptyUploadMessage) setMessage((previous) => [previous, emptyUploadMessage].filter(Boolean).join(" "));
        return;
      }
      for (const photo of committed) {
        logicalOrder.current.push(photo.id);
        animated.change({ type: "add", key: photo.id }, () => update([...current.current, photo]));
      }
      setSuccessIds(committed.map((photo) => photo.id));
      window.setTimeout(() => setSuccessIds([]), 200);
    } catch {
      if (!alive.current) return;
      setMessage((previous) => [previous, "The photos could not be uploaded. Try again."].filter(Boolean).join(" "));
    } finally {
      finishPreparation(attempt);
      if (!alive.current) return;
      reservedSlots.current -= selectedCount;
      if (pendingIds.length) {
        setPendingPhotos((previous) => previous.filter((tile) => !pendingIds.includes(tile.id)));
      }
      if (held) {
        activeBatches.current -= 1;
        setPending(activeBatches.current > 0);
      }
    }
  }

  function dropFiles(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
  }

  return (
    <section className={styles.manager} data-admin-photo-manager={variant}>
      <div className={styles.heading}>
        <div>
          <h3>{label}</h3>
          <p id={hintId}>{imageHint(rules)}</p>
        </div>
        <span className={styles.counter} aria-label={`${photos.length} of 6 photos`}>{photos.length}/6</span>
      </div>
      <div
        className={styles.drop}
        data-dragging={dragging || undefined}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!busy && event.dataTransfer.types.includes("Files")) setDragging(true);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={dropFiles}
      >
        <div ref={animated.listRef} className={styles.list} data-variant={variant} data-admin-animated-list="">
          {photos.map((photo, index) => (
            <article
              key={photo.id}
              {...animated.rowProps(photo.id)}
              className={styles.item}
              data-photo-id={photo.id}
              data-success={successIds.includes(photo.id) || undefined}
              draggable={!busy}
              onDragStart={(event) => {
                dragId.current = photo.id;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", photo.id);
              }}
              onDragOver={(event) => {
                if (dragId.current) event.preventDefault();
              }}
              onDrop={(event) => {
                if (!dragId.current) return;
                event.preventDefault();
                event.stopPropagation();
                const source = current.current.findIndex((item) => item.id === dragId.current);
                move(dragId.current, index - source);
                dragId.current = null;
              }}
              onDragEnd={() => { dragId.current = null; }}
            >
              <div className={styles.thumb}>
                <ResilientImage src={photo.url} alt={photo.description || photo.name || `Photo ${index + 1}`} fill sizes={variant === "tiles" ? "160px" : "96px"} className={styles.image} />
                {index === 0 && <span className={styles.badge}>{variant === "rows" ? "Slide 1" : "Cover"}</span>}
              </div>
              {showDescriptions && <div className={styles.itemBody}>
                <div className={styles.itemTitle}>
                  <GripVertical size={16} aria-hidden="true" />
                  <span>{photo.name || `Photo ${index + 1}`}</span>
                </div>
                <label htmlFor={`${hintId}-description-${photo.id}`}>{descriptionLabel}</label>
                <input
                  id={`${hintId}-description-${photo.id}`}
                  type="text"
                  value={photo.description}
                  aria-invalid={!photo.description.trim() || undefined}
                  className={styles.description}
                  placeholder="Describe this photo"
                  disabled={busy}
                  onChange={(event) => update(current.current.map((item) =>
                    item.id === photo.id ? { ...item, description: event.target.value } : item))}
                />
              </div>}
              <div className={styles.itemActions}>
                <button type="button" data-move="up" onClick={() => move(photo.id, -1)} disabled={busy || index === 0} aria-label={`Move ${photo.name || `photo ${index + 1}`} ${reorderLabels === "earlier-later" ? "earlier" : "up"}`}><ArrowUp size={16} aria-hidden="true" /></button>
                <button type="button" data-move="down" onClick={() => move(photo.id, 1)} disabled={busy || index === photos.length - 1} aria-label={`Move ${photo.name || `photo ${index + 1}`} ${reorderLabels === "earlier-later" ? "later" : "down"}`}><ArrowDown size={16} aria-hidden="true" /></button>
                <button type="button" onClick={() => remove(photo.id)} disabled={busy} aria-label={`Remove ${photo.name || `photo ${index + 1}`}`}><Trash2 size={16} aria-hidden="true" /></button>
              </div>
            </article>
          ))}
          {pendingPhotos.map((photo) => (
            <article key={photo.id} className={`${styles.item} ${styles.pendingItem}`} data-admin-photo-pending="" aria-label={`Uploading ${photo.name}`} aria-busy="true">
              <div className={styles.thumb}>
                <span className={styles.pendingOverlay}><span className={styles.ring} data-admin-photo-pending-ring="" aria-hidden="true" /></span>
              </div>
              <span className={styles.pendingName}>Uploading {photo.name}…</span>
            </article>
          ))}
        </div>
        <input
          ref={input}
          type="file"
          multiple
          accept={imageAccept(rules)}
          className={styles.fileInput}
          aria-label={`Choose photos for ${label}`}
          disabled={busy || availableSlots === 0}
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <button type="button" className={styles.add} disabled={busy || availableSlots === 0} onClick={() => {
          if (!input.current || chooser.current) return;
          chooser.current = beginPreparation();
          try { input.current.click(); } catch { cancelChooser(); }
        }} aria-describedby={hintId}>
          <Plus size={16} aria-hidden="true" /> Add photos
        </button>
      </div>
      <p className={styles.message} data-admin-photo-message="" aria-live="polite">{message}</p>
    </section>
  );
}

