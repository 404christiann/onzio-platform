"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { useClubId } from "@/components/ClubContextProvider";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { EditorDialog, PageSaveButton, derivePageSaveState, type EditorDialogFocusRequest, type EditorDialogSection } from "@/components/admin/ui/editor-kit";
import { createClient } from "@/lib/admin-client";
import { getRosterImageSrc, isRosterPlaceholderLogo } from "@/lib/roster-images";
import { emptyPlayer, type Player, type PlayerForm } from "../roster-model";
import { RosterActionPhotos } from "./RosterActionPhotos";
import { PlayerBackgroundFields, PlayerBasicsFields, PlayerDetailsFields, PlayerVisibilityFields, type PlayerSectionId } from "./RosterPlayerFields";
import { RosterStatsSection } from "./RosterStatsSection";
import { FIELD_SECTION, firstProblemField, playerToForm, validatePlayer } from "./rose-city-roster-model";
import { persistPlayerRow } from "./rose-city-roster-save";
import { useRosterSeasonStats } from "./useRosterSeasonStats";
import styles from "./rose-city-roster.module.css";

export type PlayerDialogProps = {
  original: Player | null;
  open: boolean;
  activeId: string | null;
  onActiveChange: (id: PlayerSectionId) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  /** From useEditorDialog().focusRequest: the field a preview click asked for, focused once its section shows. */
  focusRequest?: EditorDialogFocusRequest | null;
  onSaved: (player: Player, previous: Player | null, warning?: string) => Promise<void>;
  onClose: () => void;
};

/** Keeps the classic editor's file-picker bookkeeping: a chosen or cancelled file counts as activity, and an open picker blocks Save. */
function ActivityFieldset({ saving, onActivity, onPicker, children }: {
  saving: boolean;
  onActivity: () => void;
  onPicker: (event: { target: EventTarget | null }, pending: boolean) => void;
  children: ReactNode;
}) {
  const node = useRef<HTMLFieldSetElement | null>(null);
  useEffect(() => {
    const fieldset = node.current;
    if (!fieldset) return;
    const cancel = (event: Event) => onPicker(event, false);
    fieldset.addEventListener("cancel", cancel, true);
    return () => fieldset.removeEventListener("cancel", cancel, true);
  }, [onPicker]);
  return (
    <fieldset ref={node} disabled={saving} className={styles.fields} onPointerDownCapture={onActivity} onKeyDownCapture={onActivity}
      onClickCapture={event => onPicker(event, true)} onChangeCapture={event => { onActivity(); onPicker(event, false); }} onDropCapture={onActivity}>
      {children}
    </fieldset>
  );
}

/**
 * Add or edit one player in the kit dialog. It saves this player only, with its own Save: the same writes as the
 * classic editor's player dialog (rose-city-roster-save.ts), in the same order. Season stats and Save player go
 * together; action photos still write straight away.
 */
export function RoseCityPlayerDialog({ original, open, activeId, onActiveChange, returnFocusRef, focusRequest, onSaved, onClose }: PlayerDialogProps) {
  const clubId = useClubId();
  const { clubLogoUrl } = useClubBranding();
  const [persisted, setPersisted] = useState<Player | null>(original);
  const [form, setForm] = useState<PlayerForm>(() => original ? playerToForm(original) : emptyPlayer());
  const [active, setActive] = useState(original?.active ?? true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoPending, setPhotoPending] = useState(false);
  const photoPendingRef = useRef(false);
  const [pickerPending, setPickerPending] = useState(false);
  const pickerPendingRef = useRef(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const initial = useRef(JSON.stringify({ form: original ? playerToForm(original) : emptyPlayer(), active: original?.active ?? true }));
  const playerDirty = photo !== null || JSON.stringify({ form, active }) !== initial.current;
  const stats = useRosterSeasonStats({ playerId: persisted?.id, keeper: form.position === "Goalkeeper" });
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const dirty = playerDirty || stats.dirty || photoPending || pickerPending;
  const latestDirty = useRef(dirty);
  latestDirty.current = dirty;
  const inFlight = useRef(false);
  const activityVersion = useRef(0);
  const savedActivityVersion = useRef(0);
  const [activity, setActivity] = useState(0);
  const problems = useMemo(() => checked ? validatePlayer(form) : {}, [checked, form]);

  const noteActivity = useCallback(() => {
    activityVersion.current += 1;
    setActivity(activityVersion.current);
  }, []);
  const photoPendingChanged = useCallback((pending: boolean) => {
    photoPendingRef.current = pending;
    setPhotoPending(pending);
    if (pending) noteActivity();
  }, [noteActivity]);
  const pickerActivity = useCallback((event: { target: EventTarget | null }, pending: boolean) => {
    if (event.target instanceof HTMLInputElement && event.target.type === "file") {
      pickerPendingRef.current = pending;
      setPickerPending(pending);
      noteActivity();
    }
  }, [noteActivity]);

  useEffect(() => {
    if (!photo) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const shownPhoto = photoPreview ?? (isRosterPlaceholderLogo(form.photo_url) ? null : getRosterImageSrc(form.photo_url, clubLogoUrl));

  async function persistPlayer() {
    const { next, seedError } = await persistPlayerRow({ client: createClient(), clubId, persisted, form, active, photo });
    setPersisted(next);
    const savedForm = playerToForm(next);
    setForm(savedForm);
    setPhoto(current => current === photo ? null : current);
    initial.current = JSON.stringify({ form: savedForm, active });
    await onSaved(next, persisted, seedError);
    if (seedError) setError(seedError);
  }

  async function persist() {
    if (inFlight.current) throw new Error("A save is already in progress.");
    inFlight.current = true;
    savedActivityVersion.current = activityVersion.current;
    setSaving(true);
    setError("");
    try {
      if (playerDirty) await persistPlayer();
      if (statsRef.current.dirty && !await statsRef.current.save()) {
        throw new Error("Player details were kept, but season stats were not saved. Review the stats message and try again.");
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const save = useSaveState({ isDirty: dirty, onSave: persist });
  useEffect(() => {
    if (save.state !== "saved" || activity !== savedActivityVersion.current) return;
    const timer = setTimeout(onClose, 700);
    return () => clearTimeout(timer);
  }, [save.state, onClose, activity]);

  async function attemptSave() {
    if (save.state === "saving") return false;
    if (photoPendingRef.current || pickerPendingRef.current) {
      setError("Finish choosing and checking the photo before saving.");
      return false;
    }
    const firstField = firstProblemField(validatePlayer(form));
    if (playerDirty && firstField) {
      setChecked(true);
      setFailed(false);
      setError("Fix the highlighted fields before saving.");
      onActiveChange(FIELD_SECTION[firstField]);
      return false;
    }
    const attemptActivity = activityVersion.current;
    try {
      setFailed(false);
      await save.save();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (activityVersion.current !== attemptActivity || latestDirty.current || photoPendingRef.current || pickerPendingRef.current) {
        setError("New changes arrived while saving. Review them before leaving.");
        return false;
      }
      return !inFlight.current;
    } catch (problem) {
      setFailed(true);
      setError(problem instanceof Error ? problem.message : "Player could not be saved.");
      return false;
    }
  }
  const latestAttempt = useRef(attemptSave);
  latestAttempt.current = attemptSave;
  const requestNavigation = useUnsavedGuard({ dirty, edited: "player", onSave: () => latestAttempt.current() });
  const busy = saving || save.state === "saving";
  function close() {
    if (busy) return;
    requestNavigation({ kind: "switch", label: "Close player editor", continue: onClose, opener: document.activeElement as HTMLElement });
  }

  const change = (next: PlayerForm) => { setForm(next); setError(""); setFailed(false); };
  const sectionHasProblem = (id: PlayerSectionId) => Object.keys(problems).some(field => FIELD_SECTION[field as keyof typeof FIELD_SECTION] === id);
  const sections: EditorDialogSection[] = [
    { id: "basics", title: "Photo and basics", summary: sectionHasProblem("basics") ? "Needs attention" : [form.name.trim(), Number.isFinite(form.number) ? `#${form.number}` : ""].filter(Boolean).join(" · ") || "Photo, name, number, position" },
    { id: "details", title: "Player details", summary: sectionHasProblem("details") ? "Needs attention" : "Height, weight, age, hometown" },
    { id: "background", title: "Background", summary: "School, previous club, bio" },
    ...(persisted ? [
      { id: "stats", title: "Season stats", summary: "Totals for the season" },
      { id: "photos", title: "Action photos", summary: "Photos for the player profile" },
    ] : []),
    { id: "visibility", title: "Visibility", summary: active ? "Shown on the public roster" : "Hidden from the public roster" },
  ];

  function renderSection(id: string): ReactNode {
    const body = (() => {
      switch (id as PlayerSectionId) {
        case "basics": return <PlayerBasicsFields playerId={persisted?.id} form={form} onChange={change} problems={problems} photoPreview={shownPhoto} uploading={saving}
          onPhotoChange={file => { noteActivity(); setPhoto(file); setError(""); setFailed(false); }} onPhotoPendingChange={photoPendingChanged} />;
        case "details": return <PlayerDetailsFields playerId={persisted?.id} form={form} onChange={change} problems={problems} />;
        case "background": return <PlayerBackgroundFields playerId={persisted?.id} form={form} onChange={change} />;
        case "stats": return persisted ? <RosterStatsSection playerId={persisted.id} keeper={form.position === "Goalkeeper"} state={stats} /> : null;
        case "photos": return persisted ? <RosterActionPhotos playerId={persisted.id} /> : null;
        case "visibility": return <PlayerVisibilityFields playerId={persisted?.id} active={active} disabled={saving} onChange={next => { setActive(next); setError(""); setFailed(false); }} />;
        default: return null;
      }
    })();
    return <ActivityFieldset saving={saving} onActivity={noteActivity} onPicker={pickerActivity}>{body}</ActivityFieldset>;
  }

  const pageState = derivePageSaveState(photoPending || pickerPending ? "clean" : save.state, failed && error ? "error" : null);
  const footer = (
    <div className={styles.footerBar}>
      <p className={styles.status} data-tone={error ? "error" : undefined} role={error ? "alert" : "status"}>
        {error || (dirty ? "Unsaved changes" : "Saves this player only.")}
      </p>
      <div className={styles.actions}>
        <button type="button" className={`admin-press ${styles.cancel}`} disabled={busy} onClick={close}>Cancel</button>
        <PageSaveButton state={pageState} saveLabel="Save player" onSave={() => { void attemptSave(); }} />
      </div>
    </div>
  );

  return (
    <EditorDialog open={open} onClose={close} title={persisted ? `Edit ${form.name.trim() || "player"}` : "Add player"}
      sections={sections} activeId={activeId} onActiveChange={id => onActiveChange(id as PlayerSectionId)} renderSection={renderSection}
      returnFocusRef={returnFocusRef} focusRequest={focusRequest} footer={footer} />
  );
}
