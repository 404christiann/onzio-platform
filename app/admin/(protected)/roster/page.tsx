/* eslint-disable @next/next/no-img-element */
"use client";

import { useClubContext, useClubId } from "@/components/ClubContextProvider";

import { useEffect, useState, useRef } from "react";
import AdminLoading, { AdminLoadingDots } from "@/components/admin/AdminLoading";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import FileUpload from "@/components/admin/FileUpload";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fetchActiveSeason } from "@/lib/queries";
import { getPlayerSeasonSeed } from "@/lib/player-season";
import { createClient } from "@/lib/admin-client";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { getRosterImageSrc, isRosterPlaceholderLogo, rosterImageForStorage } from "@/lib/roster-images";
import { cn } from "@/lib/utils";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { NATIONALITIES } from "@/lib/nationalities";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import {
  SlidingPanel,
  type SlidingPanelDirection,
} from "@/components/ui/sliding-panel";

// ── Types ─────────────────────────────────────

type Position = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

type Season = {
  id: string;
  label: string;
  start_year: number;
  end_year: number;
  active: boolean;
};

type Player = {
  id: string;
  number: number;
  name: string;
  caption: string | null;
  nationality: string;
  position: Position;
  height: string;
  weight: string;
  hometown: string;
  age: number;
  school: string | null;
  previous_club: string | null;
  photo_url: string;
  active: boolean;
  bio: string | null;
  pronunciation: string | null;
  foot: string | null;
};

type Staff = {
  id: string;
  initials: string;
  name: string;
  role: string;
  hometown: string;
  nationality: string;
  bio: string | null;
  photo_url: string;
  active: boolean;
};

type PlayerForm = Omit<Player, "id" | "active">;
type StaffForm  = Omit<Staff,  "id" | "active"> & { nationality: string; bio: string };

function emptyPlayer(): PlayerForm {
  return {
    number: 0, name: "", caption: "", nationality: "", position: "Midfielder",
    height: "", weight: "", hometown: "", age: 0,
    school: "", previous_club: "", photo_url: "",
    bio: "", pronunciation: "", foot: "",
  };
}
function emptyStaff(): StaffForm {
  return { initials: "", name: "", role: "", hometown: "", nationality: "", bio: "", photo_url: "" };
}

const POSITIONS: Position[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

// ── Photo upload helper ───────────────────────

async function uploadPhoto(file: File, bucket: string, folder: string): Promise<string> {
  const supabase = createClient();
  const ext  = file.name.split(".").pop() ?? "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}


// ── Main component ────────────────────────────

type RosterTab = "players" | "staff";

const ROSTER_TAB_ORDER: RosterTab[] = ["players", "staff"];

export default function RosterPage() {
  const [tab, setTab] = useState<RosterTab>("players");
  const [tabDirection, setTabDirection] = useState<SlidingPanelDirection>(1);
  const selectTab = (next: RosterTab) => {
    setTab((current) => {
      if (next === current) return current;
      setTabDirection(
        ROSTER_TAB_ORDER.indexOf(next) > ROSTER_TAB_ORDER.indexOf(current)
          ? 1
          : -1,
      );
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="font-display font-black uppercase text-foreground leading-none"
          style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
        >
          Roster
        </h1>
        <p className="font-body text-sm mt-1 text-muted-foreground">
          Manage players and staff.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-8 flex gap-1 rounded-lg bg-card p-1">
        {ROSTER_TAB_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => selectTab(t)}
            className={`font-display flex-1 rounded-md px-3 py-3 text-xs uppercase tracking-widest transition-colors ${
              tab === t ? "bg-foreground text-background" : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <SlidingPanel activeKey={tab} direction={tabDirection}>
        {tab === "players" ? <PlayersTab /> : <StaffTab />}
      </SlidingPanel>
    </div>
  );
}

// ── Players tab ───────────────────────────────

function PlayersTab() {
  const clubId = useClubId();
  const [players, setPlayers]     = useState<Player[]>([]);
  const [loading, setLoading]     = useState(true);
  const [addOpen, setAddOpen]     = useState(false);
  const [addForm, setAddForm]     = useState<PlayerForm>(emptyPlayer());
  const [addPhoto, setAddPhoto]   = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<PlayerForm>(emptyPlayer());
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  async function load() {
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("players")
      .select("*")
      .order("number");
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    setPlayers((data ?? []) as Player[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 3000); }

  function validatePlayer(f: PlayerForm): string | null {
    if (!f.name.trim())        return "Name is required.";
    if (!f.position)           return "Position is required.";
    if (!f.nationality.trim()) return "Nationality is required.";
    if (!f.hometown.trim())    return "Hometown is required.";
    if (!f.height.trim())      return "Height is required.";
    if (!f.weight.trim())      return "Weight is required.";
    if (f.number <= 0)         return "Jersey number must be greater than 0.";
    if (f.age <= 0)            return "Age must be greater than 0.";
    return null;
  }

  async function handleAdd() {
    const ve = validatePlayer(addForm);
    if (ve) { setError(ve); return; }
    setSaving(true); setError(null);
    try {
      const supabase = createClient();
      let photoUrl = rosterImageForStorage(addForm.photo_url);
      if (addPhoto) photoUrl = await uploadPhoto(addPhoto, "roster-images", "players");

      const { data: insertedPlayer, error: e } = await supabase.from("players").insert([{
        ...addForm,
        photo_url: photoUrl,
        caption:       addForm.caption?.trim()       || null,
        school:        addForm.school?.trim()        || null,
        previous_club: addForm.previous_club?.trim() || null,
        bio:           addForm.bio?.trim()           || null,
        pronunciation: addForm.pronunciation?.trim() || null,
        foot:          addForm.foot?.trim()          || null,
        active: true,
      }]).select("id").single();
      if (e) { setError(e.message); setSaving(false); return; }

      let seedError: string | null = null;
      try {
        const activeSeason = await fetchActiveSeason(clubId);
        if (!activeSeason) {
          seedError = "Player saved, but no active season exists for stat seeding.";
        } else if (insertedPlayer) {
          const { table, stats: zeroStats } = getPlayerSeasonSeed(addForm.position);
          const { error: statSeedError } = await supabase.from(table).insert([{
            player_id: insertedPlayer.id,
            season_id: activeSeason.id,
            ...zeroStats,
          }]);
          if (statSeedError) seedError = `Player saved, but season stats were not seeded: ${statSeedError.message}`;
        }
      } catch (seedFailure) {
        seedError = `Player saved, but season stats were not seeded: ${seedFailure instanceof Error ? seedFailure.message : "Unknown error"}`;
      }

      setAddForm(emptyPlayer()); setAddPhoto(null); setAddOpen(false);
      await load(); flash();
      if (seedError) setError(seedError);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setSaving(false);
  }

  function startEdit(p: Player) {
    setEditingId(p.id);
    setEditPhoto(null);
    setEditForm({
      number: p.number, name: p.name, caption: p.caption ?? "",
      nationality: p.nationality, position: p.position,
      height: p.height, weight: p.weight, hometown: p.hometown,
      age: p.age, school: p.school ?? "", previous_club: p.previous_club ?? "",
      photo_url: p.photo_url,
      bio: p.bio ?? "", pronunciation: p.pronunciation ?? "", foot: p.foot ?? "",
    });
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const ve = validatePlayer(editForm);
    if (ve) { setError(ve); return; }
    setSaving(true); setError(null);
    try {
      const supabase = createClient();
      let photoUrl = rosterImageForStorage(editForm.photo_url);
      const originalPlayer = players.find((player) => player.id === editingId);
      if (editPhoto) photoUrl = await uploadPhoto(editPhoto, "roster-images", "players");

      const { error: e } = await supabase.from("players").update({
        ...editForm,
        photo_url: photoUrl,
        caption:       editForm.caption?.trim()       || null,
        school:        editForm.school?.trim()        || null,
        previous_club: editForm.previous_club?.trim() || null,
        bio:           editForm.bio?.trim()           || null,
        pronunciation: editForm.pronunciation?.trim() || null,
        foot:          editForm.foot?.trim()          || null,
      }).eq("id", editingId);
      if (e) { setError(e.message); setSaving(false); return; }
      if (originalPlayer?.photo_url !== photoUrl) {
        await deleteStorageUrls("roster-images", [originalPlayer?.photo_url], ["players/"]);
      }
      setEditingId(null); setEditPhoto(null);
      await load(); flash();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setSaving(false);
  }

  async function toggleActive(p: Player) {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    if (!p.active) {
      try {
        const activeSeason = await fetchActiveSeason(clubId);
        if (!activeSeason) {
          setError("A player cannot be activated until an active season is configured.");
          setSaving(false);
          return;
        }

        const { table, stats } = getPlayerSeasonSeed(p.position);
        const { error: seedError } = await supabase.from(table).upsert([{
          player_id: p.id,
          season_id: activeSeason.id,
          ...stats,
        }], {
          onConflict: "player_id,season_id",
          ignoreDuplicates: true,
        });
        if (seedError) {
          setError(`Player was not activated because season stats could not be seeded: ${seedError.message}`);
          setSaving(false);
          return;
        }
      } catch (activationError) {
        setError(activationError instanceof Error ? activationError.message : "Player activation failed");
        setSaving(false);
        return;
      }
    }

    const { error: toggleError } = await supabase
      .from("players")
      .update({ active: !p.active })
      .eq("id", p.id);
    if (toggleError) {
      setError(toggleError.message);
      setSaving(false);
      return;
    }
    await load();
    flash();
    setSaving(false);
  }

  const sorted = [...players].sort((a, b) => a.number - b.number);

  return (
    <div>
      <AdminSaveFeedback saving={saving} saved={saved} />
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <p className="font-body text-sm text-muted-foreground">
          {players.filter(p => p.active).length} active · {players.filter(p => !p.active).length} inactive
        </p>
        <button
          onClick={() => { setAddOpen(o => !o); setAddForm(emptyPlayer()); setAddPhoto(null); setError(null); }}
          className="px-6 py-2.5 rounded-lg font-display font-black uppercase tracking-widest bg-brand text-brand-foreground hover:bg-brand/90"
          style={{ fontSize: "1.1rem" }}
        >
          {addOpen ? "Cancel" : "+ Add Player"}
        </button>
      </div>

      {error  && <p className="font-body text-sm mb-4 text-destructive">Error: {error}</p>}

      {/* Add form */}
      {addOpen && (
        <div className="rounded-xl border border-brand/25 bg-card p-5 mb-6">
          <p className="font-display font-black uppercase text-xs tracking-widest mb-4 text-muted-foreground">New Player</p>
          <PlayerFormFields form={addForm} onChange={setAddForm} photoFile={addPhoto} onPhotoChange={setAddPhoto} />
          <div className="mt-4">
            <button onClick={handleAdd} disabled={saving}
              className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest bg-brand text-brand-foreground text-xs hover:bg-brand/90 disabled:opacity-60">
              {saving && <AdminLoadingDots className="mr-2" />}
              {saving ? "Saving…" : "Save Player"}
            </button>
          </div>
        </div>
      )}

      {/* Player list grouped by position */}
      {loading ? (
        <RosterListSkeleton label="Loading players" />
      ) : (
        <div className="flex flex-col gap-3">
          {POSITIONS.map((pos) => {
            const group = sorted.filter((p) => p.position === pos);
            if (group.length === 0) return null;
            return (
              <PlayerPositionGroup
                key={pos}
                pos={pos}
                group={group}
                editingId={editingId}
                editForm={editForm}
                editPhoto={editPhoto}
                saving={saving}
                setEditForm={setEditForm}
                setEditPhoto={setEditPhoto}
                startEdit={(p) => { startEdit(p); setError(null); }}
                handleSaveEdit={handleSaveEdit}
                cancelEdit={() => { setEditingId(null); setError(null); }}
                toggleActive={toggleActive}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Player position group (collapsible) ───────

function PlayerPositionGroup({
  pos, group, editingId, editForm, editPhoto, saving,
  setEditForm, setEditPhoto, startEdit, handleSaveEdit, cancelEdit, toggleActive,
}: {
  pos: string;
  group: Player[];
  editingId: string | null;
  editForm: PlayerForm;
  editPhoto: File | null;
  saving: boolean;
  setEditForm: (f: PlayerForm) => void;
  setEditPhoto: (f: File | null) => void;
  startEdit: (p: Player) => void;
  handleSaveEdit: () => void;
  cancelEdit: () => void;
  toggleActive: (p: Player) => void;
}) {
  const [open, setOpen] = useState(true);
  const { clubLogoUrl } = useClubBranding();

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      {/* Position header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-card px-4 py-3 transition-colors hover:bg-accent/60"
      >
        <span className="font-display font-black uppercase tracking-widest text-foreground/90" style={{ fontSize: "1.15rem" }}>
          {pos}s{" "}
          <span className="font-normal text-muted-foreground/60">{group.length}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          className="text-muted-foreground/60"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease" }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Animated content */}
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.25s ease" }}>
        <div style={{ overflow: "hidden" }}>
          <div className="flex flex-col">
            {group.map((p) => {
              const isEditing = editingId === p.id;
              return (
                <div key={p.id}
                  className={cn("border-t border-border/40", isEditing && "border border-brand/30")}>
                  {isEditing ? (
                    <div className="bg-card p-5">
                      <PlayerFormFields form={editForm} onChange={setEditForm} photoFile={editPhoto} onPhotoChange={setEditPhoto} playerId={p.id} />
                      <div className="mt-4 flex gap-3">
                        <button onClick={handleSaveEdit} disabled={saving}
                          className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest bg-brand text-brand-foreground text-xs hover:bg-brand/90 disabled:opacity-60">
                          {saving && <AdminLoadingDots className="mr-2" />}
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button onClick={cancelEdit}
                          className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-xs border border-border bg-card text-muted-foreground hover:bg-accent">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 transition-colors",
                        p.active ? "bg-card hover:bg-accent/40" : "bg-background opacity-50 hover:opacity-75",
                      )}>
                      {/* Photo + Info */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="relative w-20 h-20 rounded-full overflow-hidden flex-shrink-0 bg-muted">
                          <ResilientNativeImage
                            src={getRosterImageSrc(p.photo_url, clubLogoUrl)}
                            alt={p.name}
                            fallbackVariant="person"
                            className={`w-full h-full ${isRosterPlaceholderLogo(p.photo_url) ? "object-contain" : "object-cover"}`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display font-black text-foreground" style={{ fontSize: "1.25rem" }}>#{p.number} {p.name}</span>
                            {!p.active && (
                              <span className="font-display uppercase px-2 py-0.5 rounded bg-muted/60 text-muted-foreground"
                                style={{ fontSize: "0.65rem", letterSpacing: "0.08em" }}>
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="font-body text-muted-foreground" style={{ fontSize: "1rem" }}>
                            {p.nationality}
                          </p>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => startEdit(p)}
                          className="flex-1 sm:flex-none px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest border border-border bg-muted/40 text-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                          style={{ fontSize: "0.95rem" }}>
                          Edit
                        </button>
                        <button onClick={() => toggleActive(p)} disabled={saving}
                          className={cn(
                            "flex-1 sm:flex-none px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest border transition-colors",
                            p.active
                              ? "border-destructive/20 bg-destructive/10 text-destructive/80 hover:bg-destructive/20"
                              : "border-success/20 bg-success/10 text-success/80 hover:bg-success/20",
                          )}
                          style={{ fontSize: "0.95rem" }}>
                          {p.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Staff tab ─────────────────────────────────

function StaffTab() {
  const { clubLogoUrl } = useClubBranding();
  const [staff, setStaff]         = useState<Staff[]>([]);
  const [loading, setLoading]     = useState(true);
  const [addOpen, setAddOpen]     = useState(false);
  const [addForm, setAddForm]     = useState<StaffForm>(emptyStaff());
  const [addPhoto, setAddPhoto]   = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<StaffForm>(emptyStaff());
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  async function load() {
    const supabase = createClient();
    const { data, error: loadError } = await supabase.from("staff").select("*").order("name");
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    setStaff((data ?? []) as Staff[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 3000); }

  function validateStaff(f: StaffForm): string | null {
    if (!f.name.trim())     return "Name is required.";
    if (!f.initials.trim()) return "Initials are required.";
    if (!f.role.trim())     return "Role is required.";
    if (!f.hometown.trim()) return "Hometown is required.";
    return null;
  }

  async function handleAdd() {
    const ve = validateStaff(addForm);
    if (ve) { setError(ve); return; }
    setSaving(true); setError(null);
    try {
      const supabase = createClient();
      let photoUrl = rosterImageForStorage(addForm.photo_url);
      if (addPhoto) photoUrl = await uploadPhoto(addPhoto, "staff-images", "staff");

      const { error: e } = await supabase.from("staff").insert([{ ...addForm, photo_url: photoUrl, active: true }]);
      if (e) { setError(e.message); setSaving(false); return; }
      setAddForm(emptyStaff()); setAddPhoto(null); setAddOpen(false);
      await load(); flash();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setSaving(false);
  }

  function startEdit(s: Staff) {
    setEditingId(s.id);
    setEditPhoto(null);
    setEditForm({ initials: s.initials, name: s.name, role: s.role, hometown: s.hometown, nationality: s.nationality ?? "", bio: s.bio ?? "", photo_url: s.photo_url });
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const ve = validateStaff(editForm);
    if (ve) { setError(ve); return; }
    setSaving(true); setError(null);
    try {
      const supabase = createClient();
      let photoUrl = rosterImageForStorage(editForm.photo_url);
      const originalStaff = staff.find((staffMember) => staffMember.id === editingId);
      if (editPhoto) photoUrl = await uploadPhoto(editPhoto, "staff-images", "staff");

      const { error: e } = await supabase.from("staff").update({ ...editForm, photo_url: photoUrl }).eq("id", editingId);
      if (e) { setError(e.message); setSaving(false); return; }
      if (originalStaff?.photo_url !== photoUrl) {
        await deleteStorageUrls("staff-images", [originalStaff?.photo_url], ["staff/"]);
      }
      setEditingId(null); setEditPhoto(null);
      await load(); flash();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setSaving(false);
  }

  async function toggleActive(s: Staff) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: toggleError } = await supabase
      .from("staff")
      .update({ active: !s.active })
      .eq("id", s.id);
    if (toggleError) {
      setError(toggleError.message);
      setSaving(false);
      return;
    }
    await load();
    flash();
    setSaving(false);
  }

  return (
    <div>
      <AdminSaveFeedback saving={saving} saved={saved} />
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <p className="font-body text-sm text-muted-foreground">
          {staff.filter(s => s.active).length} active · {staff.filter(s => !s.active).length} inactive
        </p>
        <button
          onClick={() => { setAddOpen(o => !o); setAddForm(emptyStaff()); setAddPhoto(null); setError(null); }}
          className="px-6 py-2.5 rounded-lg font-display font-black uppercase tracking-widest bg-brand text-brand-foreground hover:bg-brand/90"
          style={{ fontSize: "1.1rem" }}>
          {addOpen ? "Cancel" : "+ Add Staff"}
        </button>
      </div>

      {error && <p className="font-body text-sm mb-4 text-destructive">Error: {error}</p>}

      {/* Add form */}
      {addOpen && (
        <div className="rounded-xl border border-brand/25 bg-card p-5 mb-6">
          <p className="font-display font-black uppercase text-xs tracking-widest mb-4 text-muted-foreground">New Staff Member</p>
          <StaffFormFields form={addForm} onChange={setAddForm} photoFile={addPhoto} onPhotoChange={setAddPhoto} />
          <div className="mt-4">
            <button onClick={handleAdd} disabled={saving}
              className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest bg-brand text-brand-foreground text-xs hover:bg-brand/90 disabled:opacity-60">
              {saving && <AdminLoadingDots className="mr-2" />}
              {saving ? "Saving…" : "Save Staff Member"}
            </button>
          </div>
        </div>
      )}

      {/* Staff list */}
      {loading ? (
        <RosterListSkeleton label="Loading staff" rows={3} />
      ) : (
        <div className="flex flex-col gap-3">
          {staff.map((s) => {
            const isEditing = editingId === s.id;
            return (
              <div key={s.id}
                className={cn("rounded-xl overflow-hidden border", isEditing ? "border-brand/30" : "border-border")}>
                {isEditing ? (
                  <div className="bg-card p-5">
                    <StaffFormFields form={editForm} onChange={setEditForm} photoFile={editPhoto} onPhotoChange={setEditPhoto} />
                    <div className="mt-4 flex gap-3">
                      <button onClick={handleSaveEdit} disabled={saving}
                        className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest bg-brand text-brand-foreground text-xs hover:bg-brand/90 disabled:opacity-60">
                        {saving && <AdminLoadingDots className="mr-2" />}
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => { setEditingId(null); setError(null); }}
                        className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-xs border border-border bg-card text-muted-foreground hover:bg-accent">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 transition-colors",
                      s.active ? "bg-card hover:bg-accent/40" : "bg-background opacity-50 hover:opacity-75",
                    )}>
                    {/* Photo + Info */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="relative w-20 h-20 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-muted">
                        <ResilientNativeImage
                          src={getRosterImageSrc(s.photo_url, clubLogoUrl)}
                          alt={s.name}
                          fallbackVariant="person"
                          className={`w-full h-full ${isRosterPlaceholderLogo(s.photo_url) ? "object-contain" : "object-cover"}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-black text-foreground" style={{ fontSize: "1.25rem" }}>{s.name}</span>
                          {!s.active && (
                            <span className="font-display uppercase px-2 py-0.5 rounded bg-muted/60 text-muted-foreground"
                              style={{ fontSize: "0.65rem", letterSpacing: "0.08em" }}>
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="font-body text-muted-foreground" style={{ fontSize: "1rem" }}>{s.role}</p>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => { startEdit(s); setError(null); }}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest border border-border bg-muted/40 text-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                        style={{ fontSize: "0.95rem" }}>
                        Edit
                      </button>
                      <button onClick={() => toggleActive(s)} disabled={saving}
                        className={cn(
                          "flex-1 sm:flex-none px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest border transition-colors",
                          s.active
                            ? "border-destructive/20 bg-destructive/10 text-destructive/80 hover:bg-destructive/20"
                            : "border-success/20 bg-success/10 text-success/80 hover:bg-success/20",
                        )}
                        style={{ fontSize: "0.95rem" }}>
                        {s.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── Season Stats Panel ────────────────────────

function SeasonStatsPanel({ playerId, position }: { playerId: string; position: Position }) {
  const isGK = position === "Goalkeeper";

  const [seasons, setSeasons]         = useState<Season[]>([]);
  const [selectedId, setSelectedId]   = useState<string>("");
  const [stats, setStats]             = useState<Record<string, number>>({});
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const defaultStats: Record<string, number> = isGK
    ? { goals_against: 0, saves: 0, clean_sheets: 0, starts: 0, yellow: 0, red: 0, mins: 0 }
    : { goals: 0, assists: 0, tackles: 0, starts: 0, yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, fouls_suffered: 0 };

  async function loadSeasons() {
    const supabase = createClient();
    const { data, error: seasonsError } = await supabase.from("seasons").select("*").order("start_year", { ascending: false });
    if (seasonsError) {
      setError(seasonsError.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Season[];
    setSeasons(list);
    const active = list.find((s) => s.active) ?? list[0];
    if (active) { setSelectedId(active.id); await loadStats(active.id); }
    setLoading(false);
  }

  async function loadStats(seasonId: string) {
    const supabase = createClient();
    const table = isGK ? "goalkeeper_season_stats" : "player_season_stats";
    const { data, error: statsError } = await supabase
      .from(table)
      .select("*")
      .eq("player_id", playerId)
      .eq("season_id", seasonId)
      .maybeSingle();
    if (statsError) {
      setError(statsError.message);
      setStats({ ...defaultStats });
      return;
    }
    setStats(data ? { ...data } : { ...defaultStats });
  }

  useEffect(() => { loadSeasons(); }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSeasonChange(seasonId: string) {
    setSelectedId(seasonId);
    setLoading(true);
    await loadStats(seasonId);
    setLoading(false);
  }

  function setStat(key: string, value: number) {
    setStats((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    setSaving(true); setError(null);
    const supabase = createClient();
    const table = isGK ? "goalkeeper_season_stats" : "player_season_stats";
    const payload = { ...stats, player_id: playerId, season_id: selectedId };
    const { error: e } = await supabase.from(table).upsert([payload], { onConflict: "player_id,season_id" });
    if (e) { setError(e.message); } else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  }

  return (
    <div>
      <AdminSaveFeedback
        saving={saving}
        saved={saved}
        savingLabel="Saving season stats…"
        successLabel="Season stats saved"
      />
      <div className="mb-3 h-px bg-border" />
      <div className="flex items-center justify-between mb-3">
        <label className="font-display text-xs tracking-widest uppercase text-muted-foreground">
          Season Stats
        </label>
        {/* Season picker */}
        <NativeSelect
          value={selectedId}
          onChange={(e) => handleSeasonChange(e.target.value)}
          className="px-2 py-1 pr-8 text-xs"
        >
          {seasons.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.label}{s.active ? " (Active)" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {error && <p className="font-body text-xs mb-2 text-destructive">{error}</p>}

      {loading ? (
        <AdminLoading className="font-display text-xs tracking-widest uppercase" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {isGK ? (
              <>
                <StatField label="Goals Against" field="goals_against" stats={stats} onChange={setStat} />
                <StatField label="Saves"         field="saves"         stats={stats} onChange={setStat} />
                <StatField label="Clean Sheets"  field="clean_sheets"  stats={stats} onChange={setStat} />
                <StatField label="Starts"        field="starts"        stats={stats} onChange={setStat} />
                <StatField label="Yellow Cards"  field="yellow"        stats={stats} onChange={setStat} />
                <StatField label="Red Cards"     field="red"           stats={stats} onChange={setStat} />
                <StatField label="Minutes"       field="mins"          stats={stats} onChange={setStat} />
              </>
            ) : (
              <>
                <StatField label="Goals"          field="goals"          stats={stats} onChange={setStat} />
                <StatField label="Assists"        field="assists"        stats={stats} onChange={setStat} />
                <StatField label="Tackles"        field="tackles"        stats={stats} onChange={setStat} />
                <StatField label="Offsides"       field="offsides"       stats={stats} onChange={setStat} />
                <StatField label="Fouls"          field="fouls"          stats={stats} onChange={setStat} />
                <StatField label="Fouls Suffered" field="fouls_suffered" stats={stats} onChange={setStat} />
                <StatField label="Starts"         field="starts"         stats={stats} onChange={setStat} />
                <StatField label="Yellow Cards"   field="yellow"         stats={stats} onChange={setStat} />
                <StatField label="Red Cards"      field="red"            stats={stats} onChange={setStat} />
                <StatField label="Minutes"        field="mins"           stats={stats} onChange={setStat} />
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg font-display font-black uppercase tracking-widest bg-brand text-brand-foreground text-xs hover:bg-brand/90 disabled:opacity-60"
            >
              {saving && <AdminLoadingDots className="mr-2" />}
              {saving ? "Saving…" : "Save Stats"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StatField({
  label, field, stats, onChange,
}: {
  label: string;
  field: string;
  stats: Record<string, number>;
  onChange: (key: string, value: number) => void;
}) {
  return (
    <div>
      <label className="block font-display text-xs tracking-widest uppercase mb-1 text-muted-foreground" style={{ fontSize: "0.6rem" }}>
        {label}
      </label>
      <input
        type="number"
        min={0}
        value={stats[field] ?? 0}
        onChange={(e) => onChange(field, Number(e.target.value))}
        className={ADMIN_INPUT_CLASS}
      />
    </div>
  );
}

// ── Action Photos Panel ───────────────────────

type ActionPhoto = { id: string; url: string; sort_order: number };

function ActionPhotosPanel({ playerId }: { playerId: string }) {
  const [photos, setPhotos]     = useState<ActionPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function loadPhotos() {
    const supabase = createClient();
    const { data, error: photosError } = await supabase
      .from("player_photos")
      .select("id, url, sort_order")
      .eq("player_id", playerId)
      .order("sort_order", { ascending: true });
    if (photosError) {
      setError(photosError.message);
      return;
    }
    setPhotos((data ?? []) as ActionPhoto[]);
  }

  useEffect(() => { loadPhotos(); }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true); setError(null);
    try {
      const supabase = createClient();
      const nextOrder = photos.length > 0 ? Math.max(...photos.map(p => p.sort_order)) + 1 : 0;
      for (let i = 0; i < files.length; i++) {
        const url = await uploadPhoto(files[i], "player-action-photos", "action");
        const { error: e } = await supabase.from("player_photos").insert([{
          player_id: playerId,
          url,
          sort_order: nextOrder + i,
        }]);
        if (e) throw new Error(e.message);
      }
      await loadPhotos();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setUploading(false);
  }

  async function handleDelete(photo: ActionPhoto) {
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from("player_photos").delete().eq("id", photo.id);
      if (deleteError) throw new Error(deleteError.message);
      await deleteStorageUrls("player-action-photos", [photo.url], ["action/"]);
      await loadPhotos();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete photo");
    }
  }

  return (
    <div>
      <div className="mb-3 h-px bg-border" />
      <label className="block font-display text-xs tracking-widest uppercase mb-3 text-muted-foreground">
        Action Photos
      </label>

      {error && <p className="font-body text-xs mb-2 text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2 mb-3">
        {photos.map((photo) => (
          <div key={photo.id} className="relative group" style={{ width: 72, height: 72 }}>
            <ResilientNativeImage
              src={photo.url}
              alt="Action photo"
              fallbackVariant="person"
              className="w-full h-full rounded-lg border border-border object-cover"
            />
            <button
              type="button"
              onClick={() => void handleDelete(photo)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Delete photo"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))}

      </div>

      <FileUpload
        label="Add action photos"
        accept="image/*"
        multiple
        onUpload={(files) => void handleUpload(files)}
        uploading={uploading}
      />
    </div>
  );
}

// ── Player form fields ────────────────────────

function PlayerFormFields({
  form, onChange, photoFile, onPhotoChange, playerId,
}: {
  form: PlayerForm;
  onChange: (f: PlayerForm) => void;
  photoFile: File | null;
  onPhotoChange: (f: File | null) => void;
  playerId?: string;
  position?: Position;
}) {
  const { clubLogoUrl } = useClubBranding();
  const club = useClubContext();
  // The inline panel and the dedicated /admin/season-stats tab write the same
  // player_season_stats / goalkeeper_season_stats rows, so academy@1 admins had
  // two places to edit one number. The season-stats tab is the single entry
  // point for this template; every other template keeps the inline panel.
  // Nothing else depends on it: the panel only renders for an already-saved
  // player and never seeds rows as a side effect of creating one.
  // editorial@1 has the same dedicated season-stats entry point, so the inline
  // redundancy is hidden there too.
  const hidesInlineSeasonStats =
    club.presentationTemplateKey === "academy@1" ||
    club.presentationTemplateKey === "editorial@1";
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photoFile]);

  const preview = photoPreview ?? getRosterImageSrc(form.photo_url, clubLogoUrl);
  const previewIsClubLogo = !photoFile && isRosterPlaceholderLogo(form.photo_url);

  function set(field: string, value: string | number) {
    onChange({ ...form, [field]: value });
  }

  return (
    <div className="space-y-4">
      {/* Photo picker — deferred: the File is stored locally and uploaded at save time. */}
      <FileUpload
        label="Upload player photo"
        accept="image/*"
        onUpload={(files) => onPhotoChange(files?.[0] ?? null)}
        previewUrl={previewIsClubLogo ? null : preview}
        onRemove={previewIsClubLogo ? undefined : () => {
          onPhotoChange(null);
          onChange({ ...form, photo_url: "" });
        }}
      />

      {/* Fields grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name" required>
          <input type="text" placeholder="e.g. Christian Alcala" value={form.name}
            onChange={(e) => set("name", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Jersey #" required>
          <input type="number" min={1} value={form.number || ""}
            onChange={(e) => set("number", Number(e.target.value))} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Position" required>
          <NativeSelect value={form.position} onChange={(e) => set("position", e.target.value)}>
            {POSITIONS.map(p => <NativeSelectOption key={p} value={p}>{p}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field label="Nationality" required>
          <NationalitySelect
            value={form.nationality}
            onChange={(v) => set("nationality", v)}
          />
        </Field>
        <Field label="Hometown" required>
          <input type="text" placeholder="e.g. Portland, OR" value={form.hometown}
            onChange={(e) => set("hometown", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Age" required>
          <input type="number" min={1} value={form.age || ""}
            onChange={(e) => set("age", Number(e.target.value))} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Height" required>
          <input type="text" placeholder={"e.g. 5'10\""} value={form.height}
            onChange={(e) => set("height", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Weight" required>
          <input type="text" placeholder="e.g. 165 lbs" value={form.weight}
            onChange={(e) => set("weight", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="School (optional)">
          <input type="text" placeholder="e.g. University of Portland" value={form.school ?? ""}
            onChange={(e) => set("school", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Previous Club (optional)">
          <input type="text" placeholder="e.g. Portland FC" value={form.previous_club ?? ""}
            onChange={(e) => set("previous_club", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Captain">
          <button
            type="button"
            onClick={() => set("caption", form.caption === "(C)" ? "" : "(C)")}
            className={`flex w-full items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
              form.caption === "(C)"
                ? "border-brand/50 bg-brand/15"
                : "border-border bg-background"
            }`}
          >
            <span
              className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 ${
                form.caption === "(C)"
                  ? "border-brand bg-brand"
                  : "border-border bg-transparent"
              }`}
            >
              {form.caption === "(C)" && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span className={`font-body text-sm ${form.caption === "(C)" ? "text-foreground" : "text-muted-foreground"}`}>
              {form.caption === "(C)" ? "Captain — displays (C) next to name" : "Not a captain"}
            </span>
          </button>
        </Field>
        <Field label="Pronunciation (optional)">
          <input type="text" placeholder='e.g. "duh-MORE-ee-uh"' value={form.pronunciation ?? ""}
            onChange={(e) => set("pronunciation", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Preferred Foot (optional)">
          <NativeSelect value={form.foot ?? ""} onChange={(e) => set("foot", e.target.value)}>
            <NativeSelectOption value="">— Select —</NativeSelectOption>
            <NativeSelectOption value="Right">Right</NativeSelectOption>
            <NativeSelectOption value="Left">Left</NativeSelectOption>
            <NativeSelectOption value="Both">Both</NativeSelectOption>
          </NativeSelect>
        </Field>
      </div>
      <Field label="Bio (optional)">
        <Textarea
          placeholder="Short player bio…"
          value={form.bio ?? ""}
          onChange={(e) => set("bio", e.target.value)}
          rows={3}
        />
      </Field>

      {/* Season stats — only shown when editing an existing player, and only
          for templates that do not route this to the Season Stats tab */}
      {playerId && !hidesInlineSeasonStats && (
        <SeasonStatsPanel playerId={playerId} position={form.position} />
      )}

      {/* Action photos — only shown when editing an existing player */}
      {playerId && <ActionPhotosPanel playerId={playerId} />}
    </div>
  );
}

// ── Staff form fields ─────────────────────────

function StaffFormFields({
  form, onChange, photoFile, onPhotoChange,
}: {
  form: StaffForm;
  onChange: (f: StaffForm) => void;
  photoFile: File | null;
  onPhotoChange: (f: File | null) => void;
}) {
  const { clubLogoUrl } = useClubBranding();
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photoFile]);

  // Same fallback-to-club-logo behavior as players (lib/roster-images), rather
  // than showing initials when no photo is set — a staff member with no photo
  // should read the same way an empty player slot already does.
  const preview = photoPreview ?? getRosterImageSrc(form.photo_url, clubLogoUrl);
  const previewIsClubLogo = !photoFile && isRosterPlaceholderLogo(form.photo_url);

  function set(field: string, value: string) {
    onChange({ ...form, [field]: value });
  }

  return (
    <div className="space-y-4">
      {/* Photo picker — deferred: the File is stored locally and uploaded at save time. */}
      <FileUpload
        label="Upload staff photo"
        accept="image/*"
        onUpload={(files) => onPhotoChange(files?.[0] ?? null)}
        previewUrl={previewIsClubLogo ? null : preview}
        onRemove={previewIsClubLogo ? undefined : () => {
          onPhotoChange(null);
          onChange({ ...form, photo_url: "" });
        }}
      />

      {/* Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name" required>
          <input type="text" placeholder="e.g. John Smith" value={form.name}
            onChange={(e) => set("name", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Initials" required>
          <input type="text" placeholder="e.g. JS" maxLength={3} value={form.initials}
            onChange={(e) => set("initials", e.target.value.toUpperCase())} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Role" required>
          <input type="text" placeholder="e.g. Head Coach" value={form.role}
            onChange={(e) => set("role", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Hometown" required>
          <input type="text" placeholder="e.g. Portland, OR" value={form.hometown}
            onChange={(e) => set("hometown", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field label="Nationality">
          <NationalitySelect value={form.nationality} onChange={(v) => set("nationality", v)} />
        </Field>
      </div>
      <Field label="Bio (optional)">
        <Textarea
          placeholder="Short bio about this staff member…"
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          rows={3}
        />
      </Field>
    </div>
  );
}

// ── Nationality dropdown ──────────────────────

function NationalitySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = NATIONALITIES.find((n) => n.label === value) ?? (value ? { flag: "🏳️", label: value } : null);
  const filtered = NATIONALITIES.filter((n) =>
    n.label.toLowerCase().includes(search.toLowerCase()) ||
    n.flag.includes(search)
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          ADMIN_INPUT_CLASS,
          "flex items-center gap-2.5 text-left",
          open && "border-ring bg-input/50",
        )}
      >
        {selected ? (
          <>
            <span className="text-lg leading-none">{selected.flag}</span>
            <span className="truncate font-body text-sm text-foreground">{selected.label}</span>
          </>
        ) : (
          <span className="font-body text-sm text-muted-foreground/60">Select nationality…</span>
        )}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={cn(
            "ml-auto flex-shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown. The search row and the option list are flex siblings inside
          a clipped, height-capped panel, so the search header stays pinned
          while only the options scroll. */}
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 flex max-h-64 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/40">
          {/* Search header */}
          <div className="flex-shrink-0 border-b border-border bg-card p-2">
            <div className="flex items-center gap-2 rounded-lg border border-input bg-input/30 px-2.5 py-2 focus-within:border-ring focus-within:bg-input/50">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="flex-shrink-0 text-muted-foreground"
              >
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                autoFocus
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full min-w-0 border-none bg-transparent font-body text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {/* Options */}
          <div role="listbox" className="overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2.5 py-3 text-center font-body text-xs text-muted-foreground">
                No results
              </p>
            ) : (
              filtered.map((n) => {
                const isSelected = value === n.label;
                return (
                  <button
                    key={n.label}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onChange(n.label); setOpen(false); setSearch(""); }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      isSelected ? "bg-brand/10" : "hover:bg-accent",
                    )}
                  >
                    <span className="text-lg leading-none">{n.flag}</span>
                    <span className="truncate font-body text-sm text-foreground">{n.label}</span>
                    {isSelected && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                        className="ml-auto flex-shrink-0 text-brand"
                      >
                        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared UI ─────────────────────────────────

/**
 * Placeholder rows for the Players and Staff lists while they load. Mirrors
 * the real row shape below — round photo, name + meta lines, and the pair of
 * row actions — so the list does not reflow when the data arrives. The
 * `aria-label` carries the surface-specific loading message, since the
 * skeleton itself has no readable text.
 */
function RosterListSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Skeleton className="h-20 w-20 flex-shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex flex-shrink-0 gap-3">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={ADMIN_LABEL_CLASS}>
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
