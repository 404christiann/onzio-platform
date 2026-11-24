"use client";

import { useEffect, useState } from "react";

import { currentAdminTab, trackAdminEvent, type AdminSaveFailureReason } from "@/lib/admin-analytics";
import { ADMIN_MOTION_DURATIONS } from "@/lib/admin-motion";
import { ContractError } from "@/lib/contract-error";

export type SaveState = "clean" | "dirty" | "saving" | "saved";

type SavePhase = "idle" | "saving" | "saved";
type SaveAction = () => Promise<void>;
type Timer = ReturnType<typeof setTimeout>;

type Lifecycle =
  | { phase: "idle" }
  | { phase: "saving"; timer?: Timer }
  | { phase: "saved"; timer: Timer };

export function createSaveLifecycle(publish: (phase: SavePhase) => void) {
  let current: Lifecycle = { phase: "idle" };

  function cancel() {
    if (current.phase !== "idle") clearTimeout(current.timer);
    current = { phase: "idle" };
  }

  function reset() {
    cancel();
    publish("idle");
  }

  function dismissSaved() {
    if (current.phase === "saved") reset();
  }

  async function save(onSave: SaveAction) {
    if (current.phase === "saving") return;

    cancel();
    const attempt: Extract<Lifecycle, { phase: "saving" }> = { phase: "saving" };
    current = attempt;
    const earliestFinish = performance.now() + ADMIN_MOTION_DURATIONS.savingMinimum;
    publish("saving");

    function finish(next: "idle" | "saved") {
      if (current !== attempt) return;

      function complete() {
        current = next === "saved"
          ? { phase: "saved", timer: setTimeout(dismissSaved, ADMIN_MOTION_DURATIONS.savedShown) }
          : { phase: "idle" };
        publish(next);
      }

      const remaining = Math.ceil(earliestFinish - performance.now());
      if (remaining > 0) attempt.timer = setTimeout(complete, remaining);
      else complete();
    }

    try {
      await onSave();
      finish("saved");
    } catch (error) {
      finish("idle");
      throw error;
    }
  }

  return { save, dismissSaved, reset, cancel };
}

/** Buckets a thrown save error into a fixed reason. The message never leaves. */
export function classifySaveFailure(error: unknown): AdminSaveFailureReason {
  if (error instanceof ContractError) {
    if (/CONFLICT|STALE|MISMATCH/.test(error.code)) return "conflict";
    if (/INVALID|REQUIRED|TOO_LARGE|UNSUPPORTED|CORRUPT|EXCEEDED/.test(error.code)) return "validation";
    return "server";
  }
  if (error instanceof TypeError) return "network";
  return "unknown";
}

/**
 * Update the caller's persisted snapshot on success so isDirty compares the
 * current draft with what actually saved. An eligible save() resolves or
 * rejects with the persistence result. Clean drafts and duplicate calls
 * resolve without starting a write. The display can outlast the promise.
 */
export function useSaveState({
  isDirty,
  onSave,
  analyticsEditor,
}: {
  isDirty: boolean;
  onSave: SaveAction;
  /** Static editor label for analytics. Defaults to the current admin tab id. */
  analyticsEditor?: string;
}): { state: SaveState; save: () => Promise<void> } {
  const [phase, setPhase] = useState<SavePhase>("idle");
  const [lifecycle] = useState(() => createSaveLifecycle(setPhase));

  useEffect(() => {
    lifecycle.reset();
    return lifecycle.cancel;
  }, [lifecycle]);
  useEffect(() => {
    if (isDirty && phase === "saved") lifecycle.dismissSaved();
  }, [isDirty, phase, lifecycle]);

  return {
    state: phase === "saving" ? "saving" : isDirty ? "dirty" : phase === "saved" ? "saved" : "clean",
    async save() {
      if (!isDirty) return;
      await lifecycle.save(async () => {
        const editor = analyticsEditor ?? currentAdminTab();
        try {
          await onSave();
        } catch (error) {
          trackAdminEvent("admin_content_save_failed", { editor, reason: classifySaveFailure(error) });
          throw error;
        }
        trackAdminEvent("admin_content_saved", { editor });
      });
    },
  };
}
