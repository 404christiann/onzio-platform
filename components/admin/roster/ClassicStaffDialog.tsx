"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminDialog, AdminDialogFooter, type AdminDialogProps } from "@/components/admin/ui/AdminDialog";
import { AdminSaveButton } from "@/components/admin/ui/AdminSaveButton";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { Button } from "@/components/ui/button";

export function ClassicStaffDialog({ title, snapshot, photo, saving, error, onSave, onClose, finalFocus, visibilityAction, children }: {
  title: string;
  snapshot: string;
  photo: File | null;
  saving: boolean;
  error: string | null;
  onSave: () => Promise<boolean>;
  onClose: () => void;
  finalFocus?: AdminDialogProps["finalFocus"];
  visibilityAction?: ReactNode;
  children: ReactNode;
}) {
  const [baseline, setBaseline] = useState(snapshot);
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  const [problem, setProblem] = useState("");
  const [pickerPending, setPickerPending] = useState(false);
  const pickerPendingRef = useRef(false);
  const mediaFieldset = useRef<HTMLFieldSetElement>(null);
  const dirty = snapshot !== baseline || photo !== null || pickerPending;
  const latestDirty = useRef(dirty);
  latestDirty.current = dirty;
  const activityVersion = useRef(0);
  const savedActivityVersion = useRef(0);
  const [activity, setActivity] = useState(0);
  const noteActivity = useCallback(() => {
    activityVersion.current += 1;
    setActivity(activityVersion.current);
  }, []);
  const pickerActivity = useCallback((event: { target: EventTarget | null }, pending: boolean) => {
    if (event.target instanceof HTMLInputElement && event.target.type === "file") {
      pickerPendingRef.current = pending;
      setPickerPending(pending);
      noteActivity();
    }
  }, [noteActivity]);
  useEffect(() => {
    const fieldset = mediaFieldset.current;
    if (!fieldset) return;
    const cancel = (event: Event) => pickerActivity(event, false);
    fieldset.addEventListener("cancel", cancel, true);
    return () => fieldset.removeEventListener("cancel", cancel, true);
  }, [pickerActivity]);
  const save = useSaveState({ isDirty: dirty, onSave: async () => {
    savedActivityVersion.current = activityVersion.current;
    if (!await onSave()) throw new Error("Staff changes were not saved. Review the highlighted message.");
    setBaseline(latestSnapshot.current);
    setProblem("");
  } });
  useEffect(() => {
    if (save.state !== "saved" || activity !== savedActivityVersion.current) return;
    const timer = setTimeout(onClose, 700);
    return () => clearTimeout(timer);
  }, [save.state, onClose, activity]);
  async function attempt() {
    if (save.state === "saving" || pickerPendingRef.current) return false;
    const attemptActivity = activityVersion.current;
    try {
      await save.save();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (activityVersion.current !== attemptActivity || latestDirty.current || pickerPendingRef.current) {
        setProblem("New changes arrived while saving. Review them before leaving.");
        return false;
      }
      return true;
    }
    catch (failure) { setProblem(failure instanceof Error ? failure.message : "Staff changes were not saved."); return false; }
  }
  const latestAttempt = useRef(attempt);
  latestAttempt.current = attempt;
  const navigate = useUnsavedGuard({ dirty, edited: "staff member", onSave: () => latestAttempt.current() });
  const busy = saving || save.state === "saving";
  function close() {
    if (!busy) navigate({ kind: "switch", label: "Close staff editor", continue: onClose, opener: document.activeElement as HTMLElement });
  }
  return (
    <AdminDialog open onClose={close} size="md" title={title} busy={busy} finalFocus={finalFocus}
      footer={<AdminDialogFooter status={error || problem ? <span role="alert" className="text-destructive">{error || problem}</span> : dirty ? "Unsaved changes" : undefined}
        destructive={visibilityAction} primary={<AdminSaveButton className="h-11" state={pickerPending ? "clean" : save.state} onSave={() => { void attempt(); }} />}>
        <Button variant="outline" className="h-11" disabled={busy} onClick={close}>Cancel</Button>
      </AdminDialogFooter>}>
      <section data-slot="admin-dialog-section" className="space-y-4">
        <h3 className="text-sm font-semibold">Staff details</h3>
        <fieldset ref={mediaFieldset} disabled={saving} className="min-w-0 border-0 p-0" onPointerDownCapture={noteActivity} onKeyDownCapture={noteActivity} onClickCapture={event => pickerActivity(event, true)} onChangeCapture={event => { noteActivity(); pickerActivity(event, false); }} onDropCapture={noteActivity}>{children}</fieldset>
      </section>
    </AdminDialog>
  );
}
