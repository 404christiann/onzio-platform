"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/admin-client";
import { buildHomepageSaveRequest, type HomepageEditorSnapshot } from "./adapter";
import { resolveHomepageCapabilities } from "./capabilities";
import { createHomepageEditorState, getDirtyHomepageSections, reduceHomepageEditor, type HomepageEditorAction, type HomepageEditorState, type HomepagePhoto, type PieceId } from "./model";
import { resolveHomepageRecovery, type HomepageRecoveryRecord, type HomepageRecoveryResult } from "./recovery";
import { RECOVERY_UNAVAILABLE, clearRecoveryRecord, readRecoveryFile, readRecoveryRecord, recoveryStorageKey, writeRecoveryFile, writeRecoveryRecord } from "./recovery-storage";

type ErrorInfo = { code: string; message: string };
type RecoveryNotice = "restored" | "reconciled" | null;

export function useHomepageEditor(clubId: string) {
  const [state, setState] = useState<HomepageEditorState | null>(null);
  const current = useRef<HomepageEditorState | null>(null);
  const [snapshot, setSnapshot] = useState<HomepageEditorSnapshot | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [programs, setPrograms] = useState<{ slug: string; navLabel: string; displayTitle: string }[]>([]);
  const [recoveryNotice, setRecoveryNotice] = useState<RecoveryNotice>(null);
  const [recoveryOtherTab, setRecoveryOtherTab] = useState(false);
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(false);
  const [recoveryConflict, setRecoveryConflict] = useState<Extract<HomepageRecoveryResult, { kind: "conflict" }> | null>(null);
  const [cleanupWarning, setCleanupWarning] = useState(false);
  const [discardingUnsaved, setDiscardingUnsaved] = useState(false);
  const [discardingRecovery, setDiscardingRecovery] = useState(false);
  const ownedRecord = useRef<unknown>(null);
  const persistence = useRef<Promise<void>>(Promise.resolve());
  const busy = useRef(false);
  const leaving = useRef(false);
  const files = useRef(new Map<string, File>());
  const uploading = useRef(new Set<string>());
  const uploadTasks = useRef(new Map<string, Promise<void>>());
  const pendingUploadCleanup = useRef(new Set<string>());
  const cleanupTasks = useRef(new Map<string, Promise<boolean>>());
  const recoveryDiscardBusy = useRef(false);
  const generation = useRef(0);
  const recoveryKey = useRef<string | null>(null);
  const recoveryUserId = useRef<string | null>(null);
  const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelPendingPersistence() {
    if (persistTimeout.current) { clearTimeout(persistTimeout.current); persistTimeout.current = null; }
  }
  function clearRecoveryNow(): Promise<boolean> {
    cancelPendingPersistence();
    const key = recoveryKey.current;
    const pending = persistence.current.then(async () => {
      if (key && !await clearRecoveryRecord(key, ownedRecord.current, Array.from(files.current.keys()))) {
        setRecoveryUnavailable(true);
        return false;
      }
      ownedRecord.current = null;
      return true;
    });
    persistence.current = pending.then(() => undefined);
    return pending;
  }
  function persistState(value: HomepageEditorState): Promise<void> {
    const key = recoveryKey.current;
    if (!key) return Promise.resolve();
    const record = {
      schemaVersion: 1, scope: { origin: window.location.origin, userId: recoveryUserId.current, clubId },
      savedAt: new Date().toISOString(), baseRevision: value.baseRevision,
      designRevision: value.designRevision, baseline: value.baseline, draft: value.draft, submitted: value.submitted,
    };
    const pending = persistence.current.then(async () => {
      const result = await writeRecoveryRecord(key, record, { expected: ownedRecord.current });
      if (result === "written") { ownedRecord.current = record; setRecoveryOtherTab(false); }
      else if (result === "newer-record") setRecoveryOtherTab(true);
      else setRecoveryUnavailable(true);
    });
    persistence.current = pending;
    return pending;
  }
  const dispatch = useCallback((action: HomepageEditorAction) => {
    if (!current.current) return;
    const next = reduceHomepageEditor(current.current, action);
    current.current = next;
    setState(next);
  }, []);
  const saveInFlight = () => busy.current || current.current?.save === "saving";

  async function cleanupUploadedAsset(assetId: string): Promise<boolean> {
    const existing = cleanupTasks.current.get(assetId);
    if (existing) return existing;
    pendingUploadCleanup.current.add(assetId);
    const task = (async () => {
      try {
        const response = await fetch("/api/admin/homepage/upload-cleanup", {
          method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId }),
        });
        if (!response.ok) throw new Error("Could not remove the unused photo.");
        pendingUploadCleanup.current.delete(assetId);
        if (pendingUploadCleanup.current.size === 0) setCleanupWarning(false);
        return true;
      } catch {
        setCleanupWarning(true);
        return false;
      } finally { cleanupTasks.current.delete(assetId); }
    })();
    cleanupTasks.current.set(assetId, task);
    return task;
  }

  async function discardUnsavedUploads(): Promise<boolean> {
    // Save may have started before React has disabled the Leave button. Never
    // navigate away from an in-flight operation that can still commit.
    if (leaving.current || saveInFlight()) return false;
    leaving.current = true; setDiscardingUnsaved(true);
    const run = generation.current;
    let readyToNavigate = false;
    try {
      await Promise.allSettled(Array.from(uploadTasks.current.values()));
      if (run !== generation.current || saveInFlight()) return false;
      const unsaved = current.current?.draft.photos.items
        .filter(photo => photo.rowId === null && photo.assetId !== null)
        .map(photo => photo.assetId!) ?? [];
      const assets = new Set([...pendingUploadCleanup.current, ...unsaved]);
      const results = await Promise.all(Array.from(assets, cleanupUploadedAsset));
      if (!results.every(Boolean) || run !== generation.current || saveInFlight()) return false;
      if (!await clearRecoveryNow() || run !== generation.current || saveInFlight()) return false;
      readyToNavigate = true;
      return true;
    } finally {
      // A successful Leave keeps the lock until this editor unmounts. A failed
      // cleanup/clear releases it so the person can retry or keep editing.
      if (!readyToNavigate && run === generation.current) {
        leaving.current = false; setDiscardingUnsaved(false);
      }
    }
  }
  async function retryUnusedCleanup(): Promise<void> {
    await Promise.all(Array.from(pendingUploadCleanup.current, cleanupUploadedAsset));
  }

  useEffect(() => {
    const controller = new AbortController();
    const run = ++generation.current;
    current.current = null;
    setState(null); setSnapshot(null); setLoading(true); setError(null); setRecoveryNotice(null); setRecoveryConflict(null); setRecoveryUnavailable(false); setRecoveryOtherTab(false); ownedRecord.current = null;
    files.current.clear(); uploading.current.clear(); busy.current = false; leaving.current = false; setDiscardingUnsaved(false); recoveryDiscardBusy.current = false; setDiscardingRecovery(false); recoveryKey.current = null;
    async function load() {
      try {
        const response = await fetch("/api/admin/homepage", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "We could not load your homepage.");
        let data = body as HomepageEditorSnapshot;
        const capabilities = resolveHomepageCapabilities(data.design);
        const allowedPieces: PieceId[] = [];
        if (capabilities.editableSections.includes("hero")) {
          if (capabilities.heroEditableFields.includes("eyebrow")) allowedPieces.push("hero.eyebrow");
          allowedPieces.push("hero.heading", "hero.intro", "hero.cta");
        }
        if (capabilities.editableSections.includes("photos")) allowedPieces.push("photos");
        if (capabilities.editableSections.includes("story")) allowedPieces.push("story.text", "story.cta");
        if (capabilities.editableSections.includes("video")) allowedPieces.push("video");
        if (capabilities.sharedTargets.storyText) allowedPieces.push("shared.story");
        allowedPieces.push("shared.shop");
        if (capabilities.sharedTargets.programs) allowedPieces.push("shared.programs");
        let next = createHomepageEditorState({ content: data.content, revision: data.revision, designRevision: data.designRevision, editableSections: capabilities.editableSections, allowedPieces });
        if (generation.current !== run) return;
        // Recovery never blocks the editor: any failure here is swallowed and
        // the editor mounts with a clean server-loaded draft either way.
        try {
          const { data: authData } = await createClient().auth.getUser();
          const userId = authData.user?.id;
          if (userId) {
            const key = recoveryStorageKey(clubId, userId);
            recoveryKey.current = key; recoveryUserId.current = userId;
            const record = await readRecoveryRecord(key);
            if (record === RECOVERY_UNAVAILABLE) setRecoveryUnavailable(true);
            else ownedRecord.current = record;
            const result: HomepageRecoveryResult = resolveHomepageRecovery({
              record, scope: { origin: window.location.origin, userId, clubId },
              serverRevision: data.revision, designRevision: data.designRevision, now: new Date().toISOString(),
            });
            if (generation.current !== run) return;
            if (result.kind === "conflict") {
              setRecoveryConflict(result);
            } else if (result.kind === "restore" || result.kind === "reconcile") {
              // The resolver validated the stored shape and identity above.
              const stored = record as HomepageRecoveryRecord;
              let shouldRestore = true;
              if (stored.submitted) {
                const receiptResponse = await fetch(`/api/admin/homepage?operationId=${encodeURIComponent(stored.submitted.operationId)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
                if (!receiptResponse.ok) throw new Error("Could not check the last save.");
                const latest = await receiptResponse.json() as HomepageEditorSnapshot;
                if (generation.current !== run) return;
                if (latest.designRevision !== data.designRevision) throw new Error("The design changed while loading.");
                data = latest;
                next = createHomepageEditorState({ content: latest.content, revision: latest.revision, designRevision: latest.designRevision, editableSections: capabilities.editableSections, allowedPieces });
                if (latest.operation?.status === "committed") {
                  // Use CURRENT content, not the historical receipt: another
                  // administrator may have saved after our acknowledged save.
                  if (await clearRecoveryRecord(key, stored)) ownedRecord.current = null;
                  else setRecoveryUnavailable(true);
                  shouldRestore = false;
                } else if (latest.revision !== stored.baseRevision || latest.designRevision !== stored.designRevision) {
                  setRecoveryConflict({ kind: "conflict", draft: stored.draft, reason: latest.designRevision !== stored.designRevision ? "DESIGN_CHANGED" : "CONTENT_CHANGED" });
                  shouldRestore = false;
                }
              }
              if (shouldRestore) {
                for (const photo of result.draft.photos.items) {
                  if (photo.upload !== "ready" && photo.localFileKey) {
                    const file = await readRecoveryFile(photo.localFileKey, key);
                    if (file === RECOVERY_UNAVAILABLE) setRecoveryUnavailable(true);
                    else if (file) files.current.set(photo.clientId, file);
                  }
                }
                if (generation.current !== run) return;
                const restoredDraft = { ...result.draft, photos: { ...result.draft.photos, items: result.draft.photos.items.map(photo => photo.upload === "ready" ? photo : {
                  ...photo, upload: "failed" as const, error: photo.error ?? { code: "RECOVERY_INTERRUPTED", message: "This photo needs to be added again." },
                }) } };
                next = { ...next, draft: restoredDraft, submitted: stored.submitted, ...(stored.submitted ? { save: "failed" as const } : {}) };
                if (getDirtyHomepageSections(next).length) setRecoveryNotice("restored");
              }
            } else if (record !== RECOVERY_UNAVAILABLE) {
              await clearRecoveryRecord(key, record);
              ownedRecord.current = null;
            }
          }
        } catch {
          // A failed receipt lookup must not erase or blindly replay a draft.
          // Retry loading after connectivity is restored.
          if (ownedRecord.current) throw new Error("We could not check your recovered draft. It is still stored in this browser. Try loading again.");
          setRecoveryUnavailable(true);
        }
        if (generation.current !== run) return;
        current.current = next; setState(next); setSnapshot(data);
        // Existing dynamic destinations remain available in the button picker.
        const result = await createClient().from("programs").select("slug, nav_label, display_title").eq("status", "active").order("sort_order", { ascending: true });
        if (result.error) throw new Error("We could not load button destinations. Try loading your homepage again.");
        if (generation.current !== run) return;
        setPrograms((result.data ?? []).map((p: { slug: string; nav_label: string; display_title: string }) => ({ slug: p.slug, navLabel: p.nav_label, displayTitle: p.display_title })));
      } catch (failure) {
        if (controller.signal.aborted || generation.current !== run) return;
        current.current = null; setState(null); setSnapshot(null);
        setError({ code: "LOAD_FAILED", message: failure instanceof Error ? failure.message : "We could not load your homepage." });
      } finally { if (generation.current === run && !controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => { controller.abort(); generation.current = run + 1; };
  }, [clubId, reload]);

  const dirty = state ? getDirtyHomepageSections(state) : [];
  useEffect(() => {
    if (!dirty.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.length]);

  // Selection changes never rewrite recovery. Serialize writes and clears;
  // canceling a debounce alone cannot cancel an already-started IDB write.
  useEffect(() => {
    if (!recoveryKey.current || !state || recoveryConflict) return;
    persistTimeout.current = setTimeout(() => {
      persistTimeout.current = null;
      if (dirty.length === 0 && !state.submitted) { void clearRecoveryNow(); return; }
      void persistState(state);
    }, 500);
    return cancelPendingPersistence;
    // Persist content/save changes only; helpers read the current scope refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.draft, state?.submitted, state?.baseRevision, dirty.length, clubId, recoveryConflict]);

  async function save(): Promise<boolean> {
    const before = current.current;
    if (!before || !snapshot || busy.current || leaving.current || recoveryConflict) return false;
    let payload;
    try { payload = buildHomepageSaveRequest(before, snapshot.design, crypto.randomUUID()); }
    catch { setError({ code: "INVALID_FIELDS", message: "Check the field lengths and photo descriptions before saving." }); return false; }
    dispatch({ type: "save-started", operationId: payload.operationId });
    if (current.current?.save !== "saving") return false;
    busy.current = true; setError(null);
    const run = generation.current;
    try {
      cancelPendingPersistence();
      // Persist the operation before sending: a quick commit/response loss can
      // happen before the ordinary 500ms editing debounce runs.
      if (current.current) await persistState(current.current);
      const response = await fetch("/api/admin/homepage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (run !== generation.current) return false;
      if (!response.ok) {
        const failure = data.error ?? { code: "SAVE_FAILED", message: "We could not confirm your save. Your changes are still here." };
        dispatch({ type: "save-failed", ...failure });
        // Validation/authorization/conflict responses prove no content committed.
        // Network and server failures retain the same submitted operation.
        if (response.status >= 400 && response.status < 500) dispatch({ type: "save-reconciled-not-committed" });
        setError(failure); return false;
      }
      const saved = data as HomepageEditorSnapshot;
      dispatch({ type: "save-succeeded", operationId: payload.operationId, content: saved.content, revision: saved.revision });
      setSnapshot(saved); setRecoveryNotice(null);
      void clearRecoveryNow();
      return true;
    } catch {
      if (run === generation.current) {
        const failure = { code: "SAVE_UNCERTAIN", message: "We could not confirm your save. Your changes are still here. Try saving again." };
        dispatch({ type: "save-failed", ...failure }); setError(failure);
      }
      return false;
    } finally { if (run === generation.current) busy.current = false; }
  }

  function updatePhoto(id: string, update: Partial<HomepagePhoto>) {
    const next = current.current;
    if (!next) return;
    dispatch({ type: "photos-changed", photos: next.draft.photos.items.map(photo => photo.clientId === id ? { ...photo, ...update } : photo) });
  }
  async function upload(id: string) {
    const file = files.current.get(id);
    if (!file || uploading.current.has(id) || current.current?.submitted) return;
    const run = generation.current;
    uploading.current.add(id); updatePhoto(id, { upload: "uploading", error: undefined });
    try {
      const storage = createClient().storage.from("homepage");
      const path = `${id}-${file.name}`;
      const result = await storage.upload(path, file);
      if (result.error || !result.data) throw new Error("This photo could not be added. Your other changes are still here.");
      const url = storage.getPublicUrl(path).data.publicUrl;
      const stillInDraft = generation.current === run && current.current?.draft.photos.items.some(photo => photo.clientId === id);
      if (stillInDraft) updatePhoto(id, { assetId: result.data.assetId, url, upload: "ready", error: undefined });
      else await cleanupUploadedAsset(result.data.assetId);
    } catch (failure) {
      if (generation.current === run) updatePhoto(id, { upload: "failed", error: { code: "UPLOAD_FAILED", message: failure instanceof Error ? failure.message : "This photo could not be added." } });
    } finally { uploading.current.delete(id); }
  }
  function startUpload(id: string) {
    const existing = uploadTasks.current.get(id);
    if (existing) return existing;
    const task = upload(id);
    uploadTasks.current.set(id, task);
    void task.finally(() => uploadTasks.current.delete(id));
    return task;
  }
  function addPhotos(selected: FileList | null) {
    const before = current.current;
    if (!before || !selected || before.submitted) return;
    const additions = Array.from(selected).slice(0, Math.max(0, 6 - before.draft.photos.items.length)).map(file => {
      const clientId = crypto.randomUUID(); files.current.set(clientId, file);
      // Persisted so a queued/failed file survives reload for HP-05 recovery;
      // reauthorized and reuploaded on retry, never trusted as already staged.
      const key = recoveryKey.current;
      if (key) persistence.current = persistence.current.then(async () => {
        if (!await writeRecoveryFile(clientId, key, file)) setRecoveryUnavailable(true);
      });
      return { clientId, rowId: null, assetId: null, url: null, alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), order: 0, upload: "queued" as const, localFileKey: clientId };
    });
    dispatch({ type: "photos-changed", photos: [...before.draft.photos.items, ...additions].map((p, order) => ({ ...p, order })) });
    additions.forEach(photo => void startUpload(photo.clientId));
  }
  return {
    state, snapshot, loading, error, programs, dirty, dispatch, save, addPhotos, retryPhoto: startUpload, updatePhoto,
    retryLoad: () => setReload(x => x + 1), recoveryNotice, dismissRecoveryNotice: () => setRecoveryNotice(null),
    clearRecovery: clearRecoveryNow, discardUnsavedUploads, isDiscardingUnsaved: () => leaving.current, cleanupWarning, retryUnusedCleanup, removePhoto: (id: string) => {
      const before = current.current;
      if (!before) return;
      const photo = before.draft.photos.items.find(item => item.clientId === id);
      dispatch({ type: "photos-changed", photos: before.draft.photos.items.filter(item => item.clientId !== id).map((item, order) => ({ ...item, order })) });
      if (photo?.rowId === null && photo.assetId) void cleanupUploadedAsset(photo.assetId);
    }, recoveryUnavailable, recoveryOtherTab, recoveryConflict, discardingUnsaved, discardingRecovery,
    discardRecoveredDraft: async () => {
      if (recoveryDiscardBusy.current || recoveryOtherTab || !recoveryConflict) return;
      const stored = ownedRecord.current as HomepageRecoveryRecord;
      const key = recoveryKey.current;
      const run = generation.current;
      recoveryDiscardBusy.current = true; setDiscardingRecovery(true);
      try {
        // First make the browser recovery copy safe to restore after a partial
        // cleanup or reload: retired assets remain identifiable for retries,
        // but failed photos cannot be submitted as ready. The original local
        // file is retained so the person can reupload it if they restore.
        const assetIds = new Set(recoveryConflict.draft.photos.items
          .filter(photo => photo.rowId === null && photo.assetId)
          .map(photo => photo.assetId!));
        if (assetIds.size) {
          if (!key) { setRecoveryUnavailable(true); return; }
          const safeDraft = structuredClone(recoveryConflict.draft);
          safeDraft.photos.items = safeDraft.photos.items.map(photo => photo.rowId === null && photo.assetId ? {
            ...photo, upload: "failed" as const, url: null,
            error: { code: "RECOVERY_CLEANUP_PENDING", message: "This photo needs to be added again if you restore this draft." },
          } : photo);
          const safeRecord: HomepageRecoveryRecord = { ...stored, savedAt: new Date().toISOString(), draft: safeDraft };
          const writeResult = await persistence.current.then(() => writeRecoveryRecord(key, safeRecord, { expected: stored }));
          if (run !== generation.current) return;
          if (writeResult !== "written") {
            if (writeResult === "newer-record") setRecoveryOtherTab(true);
            else setRecoveryUnavailable(true);
            return;
          }
          ownedRecord.current = safeRecord;
          setRecoveryConflict({ ...recoveryConflict, draft: safeDraft });
        }
        const results = await Promise.all(Array.from(assetIds, cleanupUploadedAsset));
        if (!results.every(Boolean) || run !== generation.current) return;
        const expected = ownedRecord.current;
        if (!await clearRecoveryNow()) return;
        if (run !== generation.current) return;
        const remaining = key ? await readRecoveryRecord(key) : null;
        if (remaining === RECOVERY_UNAVAILABLE) { setRecoveryUnavailable(true); return; }
        if (remaining) {
          // A concurrent tab replaced our expected record. Its copy stays in
          // IndexedDB; keep the visible conflict and ask this tab to reload.
          ownedRecord.current = remaining;
          setRecoveryOtherTab(true);
          return;
        }
        if (expected) setRecoveryConflict(null);
      } finally {
        recoveryDiscardBusy.current = false;
        if (run === generation.current) setDiscardingRecovery(false);
      }
    },
    restoreRecoveredDraft: async () => {
      if (recoveryDiscardBusy.current || recoveryOtherTab || !recoveryConflict || recoveryConflict.reason === "DESIGN_CHANGED" || !current.current) return;
      const stored = ownedRecord.current as HomepageRecoveryRecord;
      const run = generation.current;
      const draft = structuredClone(current.current.draft);
      for (const section of ["hero", "story", "video"] as const) {
        for (const field of Object.keys(stored.draft[section])) {
          const before = stored.baseline[section] as Record<string, unknown>;
          const recovered = stored.draft[section] as Record<string, unknown>;
          if (JSON.stringify(before[field]) !== JSON.stringify(recovered[field])) (draft[section] as Record<string, unknown>)[field] = recovered[field];
        }
      }
      if (JSON.stringify(stored.baseline.photos) !== JSON.stringify(stored.draft.photos)) draft.photos = structuredClone(stored.draft.photos);
      for (const photo of draft.photos.items) {
        if (photo.upload !== "ready" && photo.localFileKey && recoveryKey.current) {
          const file = await readRecoveryFile(photo.localFileKey, recoveryKey.current);
          if (file === RECOVERY_UNAVAILABLE) setRecoveryUnavailable(true);
          else if (file) files.current.set(photo.clientId, file);
          photo.upload = "failed";
          photo.error = { code: "RECOVERY_INTERRUPTED", message: "This photo needs to be added again." };
        }
      }
      if (generation.current !== run || ownedRecord.current !== stored || !current.current) return;
      const next = { ...current.current, draft };
      current.current = next; setState(next); setRecoveryConflict(null); setRecoveryNotice("restored");
    },
  };
}
