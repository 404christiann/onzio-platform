"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/admin-client";
import { buildHomepageSaveRequest, type HomepageEditorSnapshot } from "./adapter";
import { resolveHomepageBindings, resolveHomepageCapabilities, type HomepageBindingIdentity } from "./capabilities";
import { createHomepageEditorState, getDirtyHomepageSections, reduceHomepageEditor, type HomepageEditorAction, type HomepageEditorState, type HomepagePhoto, type PieceId } from "./model";
import { currentHomepageBinding, homepageSaveFailureSettlesOperation, overlayHomepageRecovery, parseHomepageRecoveryRecord, resolveHomepageRecovery, type HomepageRecoveryResult } from "./recovery";
import { RECOVERY_UNAVAILABLE, clearRecoveryRecord, readRecoveryFile, readRecoveryRecord, recoveryStorageKey, writeRecoveryFile, writeRecoveryRecord } from "./recovery-storage";

type ErrorInfo = { code: string; message: string };
type RecoveryNotice = "restored" | "reconciled" | null;

function recoveryContent(value: HomepageEditorState): string {
  return JSON.stringify([value.baseline, value.draft, value.submitted, value.baseRevision, value.designRevision]);
}

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
  const editorBinding = useRef<HomepageBindingIdentity | null>(null);
  const retainedState = useRef<string | null>(null);
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
  const cancelPendingPersistence = useCallback(() => {
    if (persistTimeout.current) { clearTimeout(persistTimeout.current); persistTimeout.current = null; }
  }, []);
  const clearRecoveryNow = useCallback((): Promise<boolean> => {
    cancelPendingPersistence();
    const key = recoveryKey.current;
    const run = generation.current;
    const pending = persistence.current.then(async () => {
      if (run !== generation.current || key !== recoveryKey.current) return false;
      const source = ownedRecord.current;
      if (key && !await clearRecoveryRecord(key, source, Array.from(files.current.keys()))) {
        setRecoveryUnavailable(true);
        return false;
      }
      if (run !== generation.current || ownedRecord.current !== source) return false;
      ownedRecord.current = null;
      retainedState.current = null;
      return true;
    });
    persistence.current = pending.then(() => undefined);
    return pending;
  }, [cancelPendingPersistence]);
  const persistState = useCallback((value: HomepageEditorState): Promise<void> => {
    const key = recoveryKey.current;
    if (!key) return Promise.resolve();
    const binding = editorBinding.current;
    if (!binding) { setRecoveryUnavailable(true); return Promise.resolve(); }
    const run = generation.current;
    const content = recoveryContent(value);
    const record = {
      schemaVersion: 2, binding, scope: { origin: window.location.origin, userId: recoveryUserId.current, clubId },
      savedAt: new Date().toISOString(), baseRevision: value.baseRevision,
      designRevision: value.designRevision, baseline: value.baseline, draft: value.draft, submitted: value.submitted,
    };
    const pending = persistence.current.then(async () => {
      if (run !== generation.current || key !== recoveryKey.current) return;
      if (content === retainedState.current) return;
      const expected = ownedRecord.current;
      const result = await writeRecoveryRecord(key, record, { expected });
      if (run !== generation.current || ownedRecord.current !== expected) return;
      if (result === "written") { ownedRecord.current = record; retainedState.current = content; setRecoveryOtherTab(false); }
      else if (result === "newer-record") setRecoveryOtherTab(true);
      else setRecoveryUnavailable(true);
    });
    persistence.current = pending;
    return pending;
  }, [clubId]);
  const dispatch = useCallback((action: HomepageEditorAction) => {
    if (!current.current || recoveryDiscardBusy.current) return;
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
      if (current.current?.submitted || recoveryConflict) {
        cancelPendingPersistence();
        await persistence.current;
        if (run !== generation.current || saveInFlight()) return false;
        readyToNavigate = true;
        return true;
      }
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

  async function hydrateRecoveredDraft(draft: HomepageEditorState["draft"], key: string, run: number) {
    const working = structuredClone(draft);
    for (const photo of working.photos.items) {
      if (photo.upload === "ready") continue;
      if (photo.localFileKey) {
        const file = await readRecoveryFile(photo.localFileKey, key);
        if (run !== generation.current || key !== recoveryKey.current) return null;
        if (file === RECOVERY_UNAVAILABLE) setRecoveryUnavailable(true);
        else if (file) files.current.set(photo.clientId, file);
      }
      photo.upload = "failed";
      photo.error ??= { code: "RECOVERY_INTERRUPTED", message: "This photo needs to be added again." };
    }
    return working;
  }

  useEffect(() => {
    const controller = new AbortController();
    const run = ++generation.current;
    current.current = null; editorBinding.current = null; retainedState.current = null;
    cancelPendingPersistence();
    setState(null); setSnapshot(null); setLoading(true); setError(null); setRecoveryNotice(null); setRecoveryConflict(null); setRecoveryUnavailable(false); setRecoveryOtherTab(false); ownedRecord.current = null;
    files.current.clear(); uploading.current.clear(); busy.current = false; leaving.current = false; setDiscardingUnsaved(false); recoveryDiscardBusy.current = false; setDiscardingRecovery(false); recoveryKey.current = null;
    async function load() {
      try {
        const response = await fetch("/api/admin/homepage", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "We could not load your homepage.");
        let data = body as HomepageEditorSnapshot;
        let next: HomepageEditorState | undefined;
        if (generation.current !== run) return;
        try {
          const { data: authData } = await createClient().auth.getUser();
          if (generation.current !== run) return;
          const userId = authData.user?.id;
          if (userId) {
            const key = recoveryStorageKey(clubId, userId);
            recoveryKey.current = key; recoveryUserId.current = userId;
            const record = await readRecoveryRecord(key);
            if (generation.current !== run) return;
            if (record === RECOVERY_UNAVAILABLE) setRecoveryUnavailable(true);
            else ownedRecord.current = record;
            const scope = { origin: window.location.origin, userId, clubId };
            const decide = (operation: "unchecked" | "not-committed" | "committed" | "unresolved" = "unchecked") => resolveHomepageRecovery({
              record, scope, serverRevision: data.revision, designRevision: data.designRevision,
              design: data.design, now: new Date().toISOString(), operation,
            });
            let result = decide();
            if (generation.current !== run) return;
            if (result.kind === "reconcile") {
              const receiptResponse = await fetch(`/api/admin/homepage?operationId=${encodeURIComponent(result.operationId)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
              if (!receiptResponse.ok) throw new Error("Could not check the last save.");
              data = await receiptResponse.json() as HomepageEditorSnapshot;
              if (generation.current !== run) return;
              result = decide(data.operation?.status ?? "unresolved");
            }
            const capabilities = resolveHomepageCapabilities(data.design);
            const bindings = resolveHomepageBindings({ capabilities });
            next = createHomepageEditorState({ content: data.content, revision: data.revision, designRevision: data.designRevision, editableSections: capabilities.editableSections, allowedPieces: Object.keys(bindings.elements) });
            if (result.kind === "unresolved" || result.kind === "reconcile") throw new Error("Could not check the last save.");
            if (result.kind === "conflict") setRecoveryConflict(result);
            else if (result.kind === "committed") {
              if (!await clearRecoveryRecord(key, record)) setRecoveryUnavailable(true);
              else {
                const remaining = await readRecoveryRecord(key);
                if (generation.current !== run) return;
                if (remaining === RECOVERY_UNAVAILABLE) setRecoveryUnavailable(true);
                else if (remaining) setRecoveryOtherTab(true);
                else ownedRecord.current = null;
              }
            } else if (result.kind === "restore") {
              const stored = parseHomepageRecoveryRecord(record);
              if (!stored) throw new Error("Could not read the recovered draft.");
              const draft = await hydrateRecoveredDraft(result.draft, key, run);
              if (!draft || generation.current !== run) return;
              next = { ...next, baseline: stored.baseline, baseRevision: stored.baseRevision, designRevision: stored.designRevision,
                draft, submitted: stored.submitted, ...(stored.submitted ? { save: "failed" as const } : {}) };
              if (getDirtyHomepageSections(next).length) setRecoveryNotice("restored");
            } else if (record !== RECOVERY_UNAVAILABLE) {
              await clearRecoveryRecord(key, record);
              if (generation.current !== run) return;
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
        const capabilities = resolveHomepageCapabilities(data.design);
        next ??= createHomepageEditorState({ content: data.content, revision: data.revision, designRevision: data.designRevision,
          editableSections: capabilities.editableSections, allowedPieces: Object.keys(resolveHomepageBindings({ capabilities }).elements) });
        editorBinding.current = currentHomepageBinding(data.design);
        retainedState.current = recoveryContent(next);
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
  }, [clubId, reload, cancelPendingPersistence]);

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
    if (!recoveryKey.current || !current.current || recoveryConflict) return;
    persistTimeout.current = setTimeout(() => {
      persistTimeout.current = null;
      const value = current.current;
      if (!value || recoveryDiscardBusy.current) return;
      if (getDirtyHomepageSections(value).length === 0 && !value.submitted) { void clearRecoveryNow(); return; }
      void persistState(value);
    }, 500);
    return cancelPendingPersistence;
  }, [state?.draft, state?.submitted, state?.baseRevision, dirty.length, clubId, recoveryConflict, cancelPendingPersistence, clearRecoveryNow, persistState]);

  async function save(): Promise<boolean> {
    const before = current.current;
    if (!before || !snapshot || busy.current || leaving.current || recoveryDiscardBusy.current || recoveryConflict) return false;
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
      if (run !== generation.current) return false;
      const response = await fetch("/api/admin/homepage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (run !== generation.current) return false;
      if (!response.ok) {
        const failure = data.error ?? { code: "SAVE_FAILED", message: "We could not confirm your save. Your changes are still here." };
        dispatch({ type: "save-failed", ...failure });
        if (homepageSaveFailureSettlesOperation(failure.code)) dispatch({ type: "save-reconciled-not-committed" });
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
    if (!file || uploading.current.has(id) || current.current?.submitted || recoveryDiscardBusy.current || recoveryConflict) return;
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
    if (!before || !selected || before.submitted || recoveryDiscardBusy.current || recoveryConflict) return;
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
      if (!before || before.submitted || recoveryDiscardBusy.current || recoveryConflict) return;
      const photo = before.draft.photos.items.find(item => item.clientId === id);
      dispatch({ type: "photos-changed", photos: before.draft.photos.items.filter(item => item.clientId !== id).map((item, order) => ({ ...item, order })) });
      if (photo?.rowId === null && photo.assetId) void cleanupUploadedAsset(photo.assetId);
    }, recoveryUnavailable, recoveryOtherTab, recoveryConflict, discardingUnsaved, discardingRecovery,
    discardRecoveredDraft: async () => {
      if (recoveryDiscardBusy.current || recoveryOtherTab || !recoveryConflict) return;
      const source = ownedRecord.current;
      const stored = parseHomepageRecoveryRecord(source);
      if (!stored) return;
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
          const safeRecord = { ...stored, draft: safeDraft };
          cancelPendingPersistence();
          const pending = persistence.current.then(() => run === generation.current && ownedRecord.current === source
            ? writeRecoveryRecord(key, safeRecord, { expected: source }) : "newer-record" as const);
          persistence.current = pending.then(() => undefined);
          const writeResult = await pending;
          if (run !== generation.current || ownedRecord.current !== source) return;
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
        if (run !== generation.current) return;
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
        if (run === generation.current) { recoveryDiscardBusy.current = false; setDiscardingRecovery(false); }
      }
    },
    restoreRecoveredDraft: async (): Promise<boolean> => {
      if (recoveryDiscardBusy.current || recoveryOtherTab || !recoveryConflict || recoveryConflict.allowedAction !== "apply" || !current.current || !snapshot) return false;
      const source = ownedRecord.current;
      const stored = parseHomepageRecoveryRecord(source);
      const key = recoveryKey.current;
      const binding = editorBinding.current;
      if (!stored || !key || !binding) return false;
      const before = current.current;
      const run = generation.current;
      recoveryDiscardBusy.current = true;
      cancelPendingPersistence();
      try {
        const overlaid = overlayHomepageRecovery({ record: stored, current: before.draft,
          bindings: resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(snapshot.design) }) });
        if (!overlaid) return false;
        const draft = await hydrateRecoveredDraft(overlaid, key, run);
        if (!draft || run !== generation.current || ownedRecord.current !== source || current.current !== before) return false;
        const next = { ...before, draft, submitted: null, save: "idle" as const, saveError: null };
        const record = { schemaVersion: 2, binding, scope: stored.scope, savedAt: new Date().toISOString(),
          baseRevision: next.baseRevision, designRevision: next.designRevision, baseline: next.baseline, draft, submitted: null };
        const pending = persistence.current.then(() => run === generation.current && ownedRecord.current === source && current.current === before
          ? writeRecoveryRecord(key, record, { expected: source }) : "newer-record" as const);
        persistence.current = pending.then(() => undefined);
        const result = await pending;
        if (run !== generation.current || ownedRecord.current !== source || current.current !== before) return false;
        if (result !== "written") {
          if (result === "newer-record") setRecoveryOtherTab(true);
          else setRecoveryUnavailable(true);
          return false;
        }
        ownedRecord.current = record; retainedState.current = recoveryContent(next);
        current.current = next; setState(next); setRecoveryConflict(null); setRecoveryNotice("restored");
        return true;
      } finally { if (run === generation.current) recoveryDiscardBusy.current = false; }
    },
  };
}
