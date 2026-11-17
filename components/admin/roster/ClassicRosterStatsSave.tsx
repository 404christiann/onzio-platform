"use client";

import { AdminSaveButton } from "@/components/admin/ui/AdminSaveButton";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useContext, useEffect, useRef } from "react";
import { RosterEditorStatsContext } from "./RosterEditorStatsContext";

export function ClassicRosterStatsSave({ dirty, onSave }: { dirty: boolean; onSave: () => Promise<boolean> }) {
  const save = useSaveState({ isDirty: dirty, onSave: async () => {
    if (!await onSave()) throw new Error("Season stats were not saved.");
  } });
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const latestSave = useRef({ dirty, state: save.state, save: save.save });
  latestSave.current = { dirty, state: save.state, save: save.save };
  async function attempt() {
    try {
      while (mounted.current && latestSave.current.state === "saving") {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      if (!mounted.current) return false;
      if (!latestSave.current.dirty) return true;
      await latestSave.current.save();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      return mounted.current && !latestSave.current.dirty;
    }
    catch { return false; }
  }
  const publish = useContext(RosterEditorStatsContext);
  const latest = useRef(attempt);
  latest.current = attempt;
  useEffect(() => {
    publish?.({ dirty, save: () => latest.current() });
  }, [dirty, publish]);
  useEffect(() => () => publish?.(null), [publish]);
  return <AdminSaveButton state={save.state} onSave={() => { void attempt(); }} />;
}
