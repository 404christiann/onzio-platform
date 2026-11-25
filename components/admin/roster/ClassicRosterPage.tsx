"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import type { Player, PlayerForm, Position } from "./roster-model";
import { emptyPlayer } from "./roster-model";
import { useClubId } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminAccordion } from "@/components/admin/ui/AdminAccordion";
import { AdminDialog, AdminDialogFooter } from "@/components/admin/ui/AdminDialog";
import { AdminSaveButton } from "@/components/admin/ui/AdminSaveButton";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { useAdminToast } from "@/components/admin/ui/AdminToast";
import { Shimmer, ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { Button } from "@/components/ui/button";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { createClient } from "@/lib/admin-client";
import { fetchActiveSeason } from "@/lib/queries";
import { getPlayerSeasonSeed } from "@/lib/player-season";
import { isRosterPlaceholderLogo, rosterImageForStorage } from "@/lib/roster-images";
import { playerAgeError } from "@/lib/roster-player-age";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { cn } from "@/lib/utils";
import styles from "./classic-roster.module.css";
import { RosterEditorStatsContext, type RosterStatsChanges } from "./RosterEditorStatsContext";

const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"] as const;
const ABBR = { Goalkeeper: "GK", Defender: "DF", Midfielder: "MF", Forward: "FW" } as const;
const TABS = [{ id: "players", label: "Players" }, { id: "staff", label: "Staff" }];
type PlayerFieldsProps = {
  form: PlayerForm;
  onChange: (form: PlayerForm) => void;
  photoFile: File | null;
  onPhotoChange: (file: File | null) => void;
  playerId?: string;
  uploading?: boolean;
  validation?: string;
  onPhotoPendingChange?: (pending: boolean) => void;
};
type Editor = { key: number; player: Player | null; opener: HTMLElement | null };
type Props = {
  StaffComponent: ComponentType<{ addRequest: number }>;
  PlayerFields: ComponentType<PlayerFieldsProps>;
};

function playerForm(player: Player): PlayerForm {
  return {
    number: player.number, name: player.name, caption: player.caption ?? "",
    nationality: player.nationality, position: player.position, height: player.height,
    weight: player.weight, hometown: player.hometown, age: player.age,
    school: player.school ?? "", previous_club: player.previous_club ?? "",
    photo_url: player.photo_url, bio: player.bio ?? "",
    pronunciation: player.pronunciation ?? "", foot: player.foot ?? "",
  };
}

function initials(name: string) {
  return name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase() || "?";
}

export default function ClassicRosterPage({ StaffComponent, PlayerFields }: Props) {
  const [tab, setTab] = useState("players");
  const [staffAdd, setStaffAdd] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMinimum, setLoadingMinimum] = useState(240);
  const keepInitialPlaceholder = useCallback((height: number) => setLoadingMinimum(Math.max(240, height)), []);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<"All" | Position>("All");
  const [status, setStatus] = useState("all");
  const [closed, setClosed] = useState<Set<Position>>(new Set());
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const editorKey = useRef(0);
  const guard = useUnsavedGuard();
  const toast = useAdminToast();
  const clubId = useClubId();
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityNotice = useRef<{ player: Player; previous: Player } | null>(null);

  const load = useCallback(async () => {
    const { data, error: problem } = await createClient().from("players").select("*").order("number");
    if (problem) setError(problem.message);
    else { setPlayers((data ?? []) as Player[]); setError(""); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (highlightTimer.current) clearTimeout(highlightTimer.current); }, []);

  function navigate(continuation: () => void, label: string) {
    guard({ kind: "switch", label, continue: continuation, opener: document.activeElement as HTMLElement });
  }

  function open(player: Player | null) {
    navigate(() => setEditor({ key: ++editorKey.current, player, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null }), player ? `Edit ${player.name}` : "Add player");
  }

  async function restoreVisibility(player: Player, active: boolean) {
    try {
      const { data: current, error: readError } = await createClient().from("players").select("*").eq("id", player.id).single();
      if (readError || !current) throw new Error(readError?.message ?? "This player is no longer available.");
      if (current.active !== player.active) { await load(); return; }
      if (active) await seedPlayer(player.id, current.position as Position, clubId);
      const { error: problem } = await createClient().from("players").update({ active }).eq("id", player.id);
      if (problem) throw new Error(problem.message);
      await load();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Player visibility could not be restored.");
    }
  }

  async function saved(player: Player, previous: Player | null, warning?: string) {
    await load();
    if (warning) setError(warning);
    setHighlighted(player.id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlighted(null), 1400);
    if (previous && previous.active !== player.active) visibilityNotice.current = { player, previous };
  }

  function closeEditor() {
    setEditor(null);
    const notice = visibilityNotice.current;
    visibilityNotice.current = null;
    if (notice) {
      const { player, previous } = notice;
      toast.showUndo({
        message: player.active
          ? `${player.name} is on the public roster again`
          : `${player.name} is hidden from the public roster`,
        onUndo: () => { void restoreVisibility(player, previous.active); },
      });
    }
  }

  const counts = useMemo(() => Object.fromEntries(POSITIONS.map(pos => [
    pos, players.filter(player => player.position === pos).length,
  ])) as Record<Position, number>, [players]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return players.filter(player =>
      (position === "All" || player.position === position) &&
      (status === "all" || (status === "active" ? player.active : !player.active)) &&
      (!query || player.name.toLowerCase().includes(query) || String(player.number).includes(query)),
    );
  }, [players, position, status, search]);
  const groups = POSITIONS.map(pos => ({ position: pos, players: filtered.filter(player => player.position === pos) }))
    .filter(group => group.players.length > 0);

  return (
    <AdminPage className="max-w-[1100px]">
      <AdminPageHeader title="Roster" description="Manage players and staff." actions={
        <Button className="h-11 w-full sm:h-10 sm:w-auto" onClick={() => tab === "players" ? open(null) : setStaffAdd(value => value + 1)}>
          <Plus size={16} aria-hidden="true" />{tab === "players" ? "Add player" : "Add staff"}
        </Button>
      } />
      <AdminTabs items={TABS} value={tab} onChange={next => navigate(() => setTab(next), next === "staff" ? "Staff" : "Players")} tabsId="classic-roster" label="Roster sections" />
      <div role="tabpanel" id={`classic-roster-panel-${tab}`} aria-labelledby={`classic-roster-tab-${tab}`} className="mt-5">
        {tab === "staff" ? <StaffComponent addRequest={staffAdd} /> : (
          <>
            <div className={styles.tools}>
              <label className={styles.search}>
                <Search size={16} aria-hidden="true" />
                <input type="search" className={ADMIN_INPUT_CLASS} aria-label="Search players by name or jersey number"
                  placeholder="Search name or jersey number" value={search} onChange={event => setSearch(event.target.value)} />
              </label>
              <span className="text-sm text-muted-foreground"><span className={styles.count}>{players.filter(player => player.active).length}</span> active · <span className={styles.count}>{players.filter(player => !player.active).length}</span> hidden</span>
            </div>
            <div className={styles.filters}>
              <div className={styles.segment} role="group" aria-label="Filter players by position">
                {(["All", ...POSITIONS] as const).map(pos => (
                  <button type="button" key={pos} className="admin-press" aria-pressed={position === pos} onClick={() => setPosition(pos)}>
                    {pos === "All" ? "All" : ABBR[pos]} <b className={styles.count}>{pos === "All" ? players.length : counts[pos]}</b>
                  </button>
                ))}
              </div>
              <div className={styles.segment} role="group" aria-label="Filter players by status">
                {[["all", "All"], ["active", "Active"], ["hidden", "Hidden"]].map(([value, label]) => (
                  <button type="button" key={value} className="admin-press" aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>
                ))}
              </div>
            </div>
            {error && <p role="alert" className="mb-4 text-sm text-destructive">{error} <button className="underline" onClick={() => { setLoading(true); void load(); }}>Try again</button></p>}
            <ShimmerRegion loading={loading} minHeight={loadingMinimum} loadingLabel="Loading players" skeleton={<RosterSkeleton players={players} loaded={!loading} onInitialHeight={keepInitialPlaceholder} />}>
              {groups.length ? (
                <div className="space-y-3" data-classic-roster-list="">
                  {groups.map(group => (
                    <AdminAccordion key={group.position} title={<>{group.position}s <span className="ml-2 text-sm font-normal text-muted-foreground">{group.players.length}</span></>}
                      open={!closed.has(group.position)}
                      onOpenChange={isOpen => setClosed(current => {
                        const next = new Set(current);
                        if (isOpen) next.delete(group.position); else next.add(group.position);
                        return next;
                      })}>
                      {group.players.map(player => (
                        <PlayerRow key={player.id} player={player} highlighted={highlighted === player.id} onEdit={() => open(player)} />
                      ))}
                    </AdminAccordion>
                  ))}
                </div>
              ) : (
                <AdminPanel className="py-10 text-center">
                  <h2 className="font-semibold">{players.length ? "No players match your search" : "No players yet"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{players.length ? "Try a different name, jersey number, position, or status." : "Add your first player to start building your roster."}</p>
                  {!players.length && <Button className="mt-4" onClick={() => open(null)}>Add player</Button>}
                </AdminPanel>
              )}
            </ShimmerRegion>
          </>
        )}
      </div>
      {editor && <PlayerEditor key={editor.key} original={editor.player} opener={editor.opener} PlayerFields={PlayerFields} onSaved={saved} onClose={closeEditor} />}
    </AdminPage>
  );
}

function PlayerRow({ player, highlighted, onEdit }: { player: Player; highlighted: boolean; onEdit: () => void }) {
  const photo = !isRosterPlaceholderLogo(player.photo_url) && Boolean(player.photo_url);
  return (
    <div className={cn(styles.row, !player.active && styles.hiddenRow, highlighted && styles.flash)} data-player-id={player.id}>
      <span className={styles.jersey}>{player.number}</span>
      <span className={styles.avatar}>
        {photo ? <ResilientNativeImage src={player.photo_url} alt={player.name + " player photo"} fallback={initials(player.name)} className={cn("size-full object-cover", !player.active && "grayscale")} /> : initials(player.name)}
      </span>
      <span className={styles.identity}>
        <span className={styles.name}>{player.name}{player.caption ? ` ${player.caption}` : ""}</span>
        <span className={styles.meta}>{ABBR[player.position]} · Age {player.age} · {player.nationality}</span>
      </span>
      <span className={styles.flags}>
        {!photo && <span className={styles.noPhoto}>No photo</span>}
        {!player.active && <span className={styles.hiddenFlag}>Hidden</span>}
      </span>
      <button type="button" className={styles.edit} aria-label={`Edit ${player.name}`} onClick={onEdit}><Pencil size={16} aria-hidden="true" /></button>
    </div>
  );
}

function RosterSkeleton({ players, loaded, onInitialHeight }: { players: Player[]; loaded: boolean; onInitialHeight: (height: number) => void }) {
  const [snapshot] = useState(() => ({ players, loaded }));
  const placeholder = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!snapshot.loaded && snapshot.players.length === 0 && placeholder.current) {
      onInitialHeight(placeholder.current.getBoundingClientRect().height);
    }
  }, [snapshot, onInitialHeight]);
  if (snapshot.loaded && snapshot.players.length === 0) return <AdminPanel className="py-10 text-center" aria-hidden="true"><Shimmer className="mx-auto h-6 w-32" /><Shimmer className="mx-auto mt-1 h-5 w-56 max-w-full" /><Shimmer className="mx-auto mt-4 h-9 w-28" /></AdminPanel>;
  return (
    <div ref={placeholder} className="space-y-3" aria-hidden="true">
      {POSITIONS.filter(pos => snapshot.players.length === 0 || snapshot.players.some(player => player.position === pos)).map(pos => (
        <AdminAccordion key={pos} title={<Shimmer className="h-5 w-32">{pos}s</Shimmer>} open onOpenChange={() => {}}>
          {Array.from({ length: Math.max(1, snapshot.players.filter(player => player.position === pos).length) }, (_, index) => (
            <div key={index} className={styles.row}>
              <Shimmer className="h-4 w-6" /><Shimmer className="size-10 rounded-full" />
              <span className={styles.identity}><Shimmer className="h-4 w-36 max-w-full" /><Shimmer className="mt-1 h-3 w-44 max-w-full" /></span>
              <Shimmer className="size-9 rounded-lg" />
            </div>
          ))}
        </AdminAccordion>
      ))}
    </div>
  );
}

async function seedPlayer(id: string, position: Position, clubId: string) {
  const season = await fetchActiveSeason(clubId);
  if (!season) throw new Error("A player cannot be activated until an active season is configured.");
  const { table, stats } = getPlayerSeasonSeed(position);
  const { error } = await createClient().from(table).upsert([{
    player_id: id, season_id: season.id, ...stats,
  }], { onConflict: "player_id,season_id", ignoreDuplicates: true });
  if (error) throw new Error(`Player was not activated because season stats could not be seeded: ${error.message}`);
}

function PlayerEditor({ original, opener, PlayerFields, onSaved, onClose }: {
  original: Player | null;
  opener: HTMLElement | null;
  PlayerFields: ComponentType<PlayerFieldsProps>;
  onSaved: (player: Player, previous: Player | null, warning?: string) => Promise<void>;
  onClose: () => void;
}) {
  const clubId = useClubId();
  const [persisted, setPersisted] = useState<Player | null>(original);
  const [form, setForm] = useState<PlayerForm>(() => original ? playerForm(original) : emptyPlayer());
  const [active, setActive] = useState(original?.active ?? true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPending, setPhotoPending] = useState(false);
  const photoPendingRef = useRef(false);
  const [pickerPending, setPickerPending] = useState(false);
  const pickerPendingRef = useRef(false);
  const mediaFieldset = useRef<HTMLFieldSetElement>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const initial = useRef(JSON.stringify({ form: original ? playerForm(original) : emptyPlayer(), active: original?.active ?? true }));
  const playerDirty = photo !== null || JSON.stringify({ form, active }) !== initial.current;
  const [statsChanges, setStatsChanges] = useState<RosterStatsChanges | null>(null);
  const dirty = playerDirty || Boolean(statsChanges?.dirty) || photoPending || pickerPending;
  const latestDirty = useRef(dirty);
  latestDirty.current = dirty;
  const inFlight = useRef(false);
  const activityVersion = useRef(0);
  const savedActivityVersion = useRef(0);
  const [activity, setActivity] = useState(0);
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
    const fieldset = mediaFieldset.current;
    if (!fieldset) return;
    const cancel = (event: Event) => pickerActivity(event, false);
    fieldset.addEventListener("cancel", cancel, true);
    return () => fieldset.removeEventListener("cancel", cancel, true);
  }, [pickerActivity]);

  async function persistPlayer() {
    if (!form.name.trim()) throw new Error("Enter the player's name.");
    if (!Number.isInteger(form.number) || form.number < 0 || form.number > 99) throw new Error("Use 0 to 99.");
    if (!form.nationality.trim()) throw new Error("Nationality is required.");
    if (!form.hometown.trim()) throw new Error("Hometown is required.");
    if (!form.height.trim()) throw new Error("Height is required.");
    if (!form.weight.trim()) throw new Error("Weight is required.");
    const ageError = playerAgeError(form.age);
    if (ageError) throw new Error(ageError);
      const supabase = createClient();
      let photoUrl = rosterImageForStorage(form.photo_url);
      if (photo) {
        const ext = photo.name.split(".").pop() ?? "jpg";
        const path = `players/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("roster-images").upload(path, photo, { upsert: true });
        if (uploadError) throw new Error(uploadError.message);
        photoUrl = supabase.storage.from("roster-images").getPublicUrl(path).data.publicUrl;
      }
      if (persisted && !persisted.active && active) await seedPlayer(persisted.id, form.position, clubId);
      const payload = {
        ...form, photo_url: photoUrl,
        caption: form.caption?.trim() || null,
        school: form.school?.trim() || null,
        previous_club: form.previous_club?.trim() || null,
        bio: form.bio?.trim() || null,
        pronunciation: form.pronunciation?.trim() || null,
        foot: form.foot?.trim() || null,
      };
      let id = persisted?.id;
      if (id) {
        const { error: saveError } = await supabase.from("players").update({
          ...payload, ...(active !== persisted?.active ? { active } : {}),
        }).eq("id", id);
        if (saveError) throw new Error(saveError.message);
        if (persisted?.photo_url !== photoUrl) await deleteStorageUrls("roster-images", [persisted?.photo_url], ["players/"]);
      } else {
        const { data, error: saveError } = await supabase.from("players").insert([{ ...payload, active }]).select("id").single();
        if (saveError) throw new Error(saveError.message);
        id = data!.id as string;
      }
      const next = { ...form, ...payload, id: id!, active } as Player;
      let seedError = "";
      if (!persisted) {
        try { await seedPlayer(id!, form.position, clubId); }
        catch (problem) { seedError = `Player saved, but season stats were not seeded: ${problem instanceof Error ? problem.message : "Unknown error"}`; }
      }
      setPersisted(next);
      const savedForm = playerForm(next);
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
      if (statsChanges?.dirty && !await statsChanges.save()) {
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
    const attemptActivity = activityVersion.current;
    try {
      await save.save();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (activityVersion.current !== attemptActivity || latestDirty.current || photoPendingRef.current || pickerPendingRef.current) {
        setError("New changes arrived while saving. Review them before leaving.");
        return false;
      }
      return !inFlight.current;
    }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Player could not be saved."); return false; }
  }
  const latestAttempt = useRef(attemptSave);
  latestAttempt.current = attemptSave;
  const requestNavigation = useUnsavedGuard({ dirty, edited: "player", onSave: () => latestAttempt.current() });
  const busy = saving || save.state === "saving";
  function close() {
    if (busy) return;
    requestNavigation({ kind: "switch", label: "Close player editor", continue: onClose, opener: document.activeElement as HTMLElement });
  }
  return (
    <AdminDialog open onClose={close} size="lg" busy={busy}
      finalFocus={() => opener?.isConnected ? opener : (persisted ? document.querySelector<HTMLButtonElement>('[data-player-id="' + persisted.id + '"] button') : null) ?? document.querySelector<HTMLInputElement>('input[aria-label="Search players by name or jersey number"]')}
      title={persisted ? `Edit ${form.name || "player"}` : "Add player"}
      footer={<AdminDialogFooter status={error ? <span role="alert" className="text-destructive">{error}</span> : dirty ? "Unsaved changes" : undefined}
        primary={<AdminSaveButton state={photoPending || pickerPending ? "clean" : save.state} onSave={() => { void attemptSave(); }} />}>
        <Button variant="outline" className="h-11 sm:h-10" disabled={busy} onClick={close}>Cancel</Button>
      </AdminDialogFooter>}>
      <fieldset ref={mediaFieldset} disabled={saving} className={styles.fields} onPointerDownCapture={noteActivity} onKeyDownCapture={noteActivity} onClickCapture={event => pickerActivity(event, true)} onChangeCapture={event => { noteActivity(); pickerActivity(event, false); }} onDropCapture={noteActivity}>
        <RosterEditorStatsContext.Provider value={setStatsChanges}>
        <PlayerFields form={form} onChange={next => { setForm(next); setError(""); }} photoFile={photo} onPhotoChange={file => { noteActivity(); setPhoto(file); }}
          playerId={persisted?.id} uploading={saving} validation={error} onPhotoPendingChange={photoPendingChanged} />
        </RosterEditorStatsContext.Provider>
        <section className="space-y-3 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Visibility</h3>
          <label htmlFor="classic-player-visible" className="flex min-h-11 items-center justify-between gap-4">
            <span>Show on the public roster</span>
            <AdminSwitch id="classic-player-visible" label="Show on the public roster" checked={active} disabled={saving} onCheckedChange={setActive} />
          </label>
        </section>
      </fieldset>
    </AdminDialog>
  );
}
