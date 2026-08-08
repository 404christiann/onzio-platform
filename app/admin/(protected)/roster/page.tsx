/* eslint-disable @next/next/no-img-element */
"use client";

import { useClubContext, useClubId } from "@/components/ClubContextProvider";

import { useEffect, useState, useRef } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { fetchActiveSeason } from "@/lib/queries";
import { getPlayerSeasonSeed } from "@/lib/player-season";
import { createClient } from "@/lib/admin-client";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { getRosterImageSrc, isRosterPlaceholderLogo, rosterImageForStorage } from "@/lib/roster-images";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import ResilientNativeImage from "@/components/ResilientNativeImage";
// ── Nationalities ─────────────────────────────

const NATIONALITIES = [
  // Americas
  { flag: "🇺🇸", label: "American" },
  { flag: "🇦🇷", label: "Argentine" },
  { flag: "🇧🇿", label: "Belizean" },
  { flag: "🇧🇴", label: "Bolivian" },
  { flag: "🇧🇷", label: "Brazilian" },
  { flag: "🇨🇦", label: "Canadian" },
  { flag: "🇨🇱", label: "Chilean" },
  { flag: "🇨🇴", label: "Colombian" },
  { flag: "🇨🇷", label: "Costa Rican" },
  { flag: "🇨🇺", label: "Cuban" },
  { flag: "🇩🇴", label: "Dominican" },
  { flag: "🇪🇨", label: "Ecuadorian" },
  { flag: "🇬🇹", label: "Guatemalan" },
  { flag: "🇭🇹", label: "Haitian" },
  { flag: "🇭🇳", label: "Honduran" },
  { flag: "🇯🇲", label: "Jamaican" },
  { flag: "🇲🇽", label: "Mexican" },
  { flag: "🇳🇮", label: "Nicaraguan" },
  { flag: "🇵🇦", label: "Panamanian" },
  { flag: "🇵🇾", label: "Paraguayan" },
  { flag: "🇵🇪", label: "Peruvian" },
  { flag: "🇵🇷", label: "Puerto Rican" },
  { flag: "🇸🇻", label: "Salvadoran" },
  { flag: "🇹🇹", label: "Trinidadian" },
  { flag: "🇺🇾", label: "Uruguayan" },
  { flag: "🇻🇪", label: "Venezuelan" },
  // Africa
  { flag: "🇩🇿", label: "Algerian" },
  { flag: "🇦🇴", label: "Angolan" },
  { flag: "🇨🇲", label: "Cameroonian" },
  { flag: "🇨🇩", label: "Congolese" },
  { flag: "🇪🇬", label: "Egyptian" },
  { flag: "🇪🇹", label: "Ethiopian" },
  { flag: "🇬🇭", label: "Ghanaian" },
  { flag: "🇬🇳", label: "Guinean" },
  { flag: "🇨🇮", label: "Ivorian" },
  { flag: "🇰🇪", label: "Kenyan" },
  { flag: "🇱🇷", label: "Liberian" },
  { flag: "🇲🇱", label: "Malian" },
  { flag: "🇲🇦", label: "Moroccan" },
  { flag: "🇳🇬", label: "Nigerian" },
  { flag: "🇷🇼", label: "Rwandan" },
  { flag: "🇸🇳", label: "Senegalese" },
  { flag: "🇸🇱", label: "Sierra Leonean" },
  { flag: "🇿🇦", label: "South African" },
  { flag: "🇹🇿", label: "Tanzanian" },
  { flag: "🇹🇬", label: "Togolese" },
  { flag: "🇺🇬", label: "Ugandan" },
  { flag: "🇿🇼", label: "Zimbabwean" },
  // Europe
  { flag: "🇦🇹", label: "Austrian" },
  { flag: "🇧🇪", label: "Belgian" },
  { flag: "🇬🇧", label: "British" },
  { flag: "🇭🇷", label: "Croatian" },
  { flag: "🇩🇰", label: "Danish" },
  { flag: "🇳🇱", label: "Dutch" },
  { flag: "🇫🇷", label: "French" },
  { flag: "🇩🇪", label: "German" },
  { flag: "🇬🇷", label: "Greek" },
  { flag: "🇮🇪", label: "Irish" },
  { flag: "🇮🇹", label: "Italian" },
  { flag: "🇳🇴", label: "Norwegian" },
  { flag: "🇵🇱", label: "Polish" },
  { flag: "🇵🇹", label: "Portuguese" },
  { flag: "🇷🇴", label: "Romanian" },
  { flag: "🇷🇸", label: "Serbian" },
  { flag: "🇪🇸", label: "Spanish" },
  { flag: "🇸🇪", label: "Swedish" },
  { flag: "🇨🇭", label: "Swiss" },
  { flag: "🇹🇷", label: "Turkish" },
  { flag: "🇺🇦", label: "Ukrainian" },
  // Asia / Pacific
  { flag: "🇦🇺", label: "Australian" },
  { flag: "🇨🇳", label: "Chinese" },
  { flag: "🇵🇭", label: "Filipino" },
  { flag: "🇮🇳", label: "Indian" },
  { flag: "🇮🇩", label: "Indonesian" },
  { flag: "🇯🇵", label: "Japanese" },
  { flag: "🇰🇷", label: "South Korean" },
].sort((a, b) => a.label.localeCompare(b.label));

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

export default function RosterPage() {
  const [tab, setTab] = useState<"players" | "staff">("players");

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="font-display font-black uppercase text-white leading-none"
          style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
        >
          Roster
        </h1>
        <p className="font-body text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
          Manage players and staff.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {(["players", "staff"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-6 py-2.5 rounded-lg font-display font-black uppercase tracking-widest transition-all"
            style={{
              fontSize: "1.1rem",
              backgroundColor: tab === t ? "#dc2626" : "#1a1a1a",
              color: tab === t ? "white" : "rgba(255,255,255,0.4)",
              border: `1px solid ${tab === t ? "#dc2626" : "rgba(255,255,255,0.07)"}`,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "players" ? <PlayersTab /> : <StaffTab />}
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
        <p className="font-body text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
          {players.filter(p => p.active).length} active · {players.filter(p => !p.active).length} inactive
        </p>
        <button
          onClick={() => { setAddOpen(o => !o); setAddForm(emptyPlayer()); setAddPhoto(null); setError(null); }}
          className="px-6 py-2.5 rounded-lg font-display font-black uppercase tracking-widest text-white"
          style={{ backgroundColor: "#dc2626", fontSize: "1.1rem" }}
        >
          {addOpen ? "Cancel" : "+ Add Player"}
        </button>
      </div>

      {error  && <p className="font-body text-sm mb-4" style={{ color: "#dc2626" }}>Error: {error}</p>}

      {/* Add form */}
      {addOpen && (
        <div className="rounded-xl p-5 mb-6" style={{ backgroundColor: "#161616", border: "1px solid rgba(220,38,38,0.25)" }}>
          <p className="font-display font-black uppercase text-xs tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>New Player</p>
          <PlayerFormFields form={addForm} onChange={setAddForm} photoFile={addPhoto} onPhotoChange={setAddPhoto} />
          <div className="mt-4">
            <button onClick={handleAdd} disabled={saving}
              className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-white text-xs"
              style={{ backgroundColor: "#dc2626", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save Player"}
            </button>
          </div>
        </div>
      )}

      {/* Player list grouped by position */}
      {loading ? (
        <p className="font-display text-sm tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</p>
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
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
      {/* Position header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: "#161616" }}
      >
        <span className="font-display font-black uppercase tracking-widest" style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.9)" }}>
          {pos}s{" "}
          <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400 }}>{group.length}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          style={{ color: "rgba(255,255,255,0.3)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease" }}>
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
                  style={{ borderTop: "1px solid rgba(255,255,255,0.04)", ...(isEditing ? { border: "1px solid rgba(220,38,38,0.3)" } : {}) }}>
                  {isEditing ? (
                    <div className="p-5" style={{ backgroundColor: "#161616" }}>
                      <PlayerFormFields form={editForm} onChange={setEditForm} photoFile={editPhoto} onPhotoChange={setEditPhoto} playerId={p.id} />
                      <div className="mt-4 flex gap-3">
                        <button onClick={handleSaveEdit} disabled={saving}
                          className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-white text-xs"
                          style={{ backgroundColor: "#dc2626", opacity: saving ? 0.6 : 1 }}>
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button onClick={cancelEdit}
                          className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-xs"
                          style={{ backgroundColor: "#222", color: "rgba(255,255,255,0.5)" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4"
                      style={{ backgroundColor: p.active ? "#111111" : "#0d0d0d", opacity: p.active ? 1 : 0.5 }}>
                      {/* Photo + Info */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0"
                          style={{ backgroundColor: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <ResilientNativeImage
                            src={getRosterImageSrc(p.photo_url, clubLogoUrl)}
                            alt={p.name}
                            fallbackVariant="person"
                            className={`w-full h-full ${isRosterPlaceholderLogo(p.photo_url) ? "object-contain" : "object-cover"}`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display font-black text-white" style={{ fontSize: "1.25rem" }}>#{p.number} {p.name}</span>
                            {!p.active && (
                              <span className="font-display uppercase px-2 py-0.5 rounded"
                                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", fontSize: "0.65rem", letterSpacing: "0.08em" }}>
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="font-body" style={{ fontSize: "1rem", color: "rgba(255,255,255,0.3)" }}>
                            {p.nationality}
                          </p>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => startEdit(p)}
                          className="flex-1 sm:flex-none px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest"
                          style={{ fontSize: "0.95rem", backgroundColor: "#1e1e1e", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
                          Edit
                        </button>
                        <button onClick={() => toggleActive(p)} disabled={saving}
                          className="flex-1 sm:flex-none px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest"
                          style={{
                            fontSize: "0.95rem",
                            backgroundColor: p.active ? "rgba(220,38,38,0.1)" : "rgba(34,197,94,0.1)",
                            border: `1px solid ${p.active ? "rgba(220,38,38,0.2)" : "rgba(34,197,94,0.2)"}`,
                            color: p.active ? "rgba(220,38,38,0.8)" : "rgba(34,197,94,0.8)",
                          }}>
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
      let photoUrl = addForm.photo_url;
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
      let photoUrl = editForm.photo_url;
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
        <p className="font-body text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
          {staff.filter(s => s.active).length} active · {staff.filter(s => !s.active).length} inactive
        </p>
        <button
          onClick={() => { setAddOpen(o => !o); setAddForm(emptyStaff()); setAddPhoto(null); setError(null); }}
          className="px-6 py-2.5 rounded-lg font-display font-black uppercase tracking-widest text-white"
          style={{ backgroundColor: "#dc2626", fontSize: "1.1rem" }}>
          {addOpen ? "Cancel" : "+ Add Staff"}
        </button>
      </div>

      {error && <p className="font-body text-sm mb-4" style={{ color: "#dc2626" }}>Error: {error}</p>}

      {/* Add form */}
      {addOpen && (
        <div className="rounded-xl p-5 mb-6" style={{ backgroundColor: "#161616", border: "1px solid rgba(220,38,38,0.25)" }}>
          <p className="font-display font-black uppercase text-xs tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>New Staff Member</p>
          <StaffFormFields form={addForm} onChange={setAddForm} photoFile={addPhoto} onPhotoChange={setAddPhoto} />
          <div className="mt-4">
            <button onClick={handleAdd} disabled={saving}
              className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-white text-xs"
              style={{ backgroundColor: "#dc2626", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save Staff Member"}
            </button>
          </div>
        </div>
      )}

      {/* Staff list */}
      {loading ? (
        <p className="font-display text-sm tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {staff.map((s) => {
            const isEditing = editingId === s.id;
            return (
              <div key={s.id} className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${isEditing ? "rgba(220,38,38,0.3)" : "rgba(255,255,255,0.07)"}` }}>
                {isEditing ? (
                  <div className="p-5" style={{ backgroundColor: "#161616" }}>
                    <StaffFormFields form={editForm} onChange={setEditForm} photoFile={editPhoto} onPhotoChange={setEditPhoto} />
                    <div className="mt-4 flex gap-3">
                      <button onClick={handleSaveEdit} disabled={saving}
                        className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-white text-xs"
                        style={{ backgroundColor: "#dc2626", opacity: saving ? 0.6 : 1 }}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => { setEditingId(null); setError(null); }}
                        className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-xs"
                        style={{ backgroundColor: "#222", color: "rgba(255,255,255,0.5)" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4"
                    style={{ backgroundColor: s.active ? "#111111" : "#0d0d0d", opacity: s.active ? 1 : 0.5 }}>
                    {/* Photo + Info */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}>
                        {s.photo_url
                          ? <ResilientNativeImage src={s.photo_url} alt={s.name} fallbackVariant="person" className="w-full h-full object-cover" />
                          : <span className="font-display font-black text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>{s.initials}</span>
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-black text-white" style={{ fontSize: "1.25rem" }}>{s.name}</span>
                          {!s.active && (
                            <span className="font-display uppercase px-2 py-0.5 rounded"
                              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", fontSize: "0.65rem", letterSpacing: "0.08em" }}>
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="font-body" style={{ fontSize: "1rem", color: "rgba(255,255,255,0.3)" }}>{s.role}</p>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => { startEdit(s); setError(null); }}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest"
                        style={{ fontSize: "0.95rem", backgroundColor: "#1e1e1e", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
                        Edit
                      </button>
                      <button onClick={() => toggleActive(s)} disabled={saving}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest"
                        style={{
                          fontSize: "0.95rem",
                          backgroundColor: s.active ? "rgba(220,38,38,0.1)" : "rgba(34,197,94,0.1)",
                          border: `1px solid ${s.active ? "rgba(220,38,38,0.2)" : "rgba(34,197,94,0.2)"}`,
                          color: s.active ? "rgba(220,38,38,0.8)" : "rgba(34,197,94,0.8)",
                        }}>
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
      <div className="mb-3" style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)" }} />
      <div className="flex items-center justify-between mb-3">
        <label className="font-display text-xs tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
          Season Stats
        </label>
        {/* Season picker */}
        <select
          value={selectedId}
          onChange={(e) => handleSeasonChange(e.target.value)}
          style={{ ...inputStyle, width: "auto", fontSize: "0.75rem", padding: "4px 8px" }}
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}{s.active ? " (Active)" : ""}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="font-body text-xs mb-2" style={{ color: "#dc2626" }}>{error}</p>}

      {loading ? (
        <p className="font-display text-xs tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</p>
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
              className="px-5 py-2 rounded-lg font-display font-black uppercase tracking-widest text-white text-xs"
              style={{ backgroundColor: "#dc2626", opacity: saving ? 0.6 : 1 }}
            >
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
      <label className="block font-display text-xs tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.6rem" }}>
        {label}
      </label>
      <input
        type="number"
        min={0}
        value={stats[field] ?? 0}
        onChange={(e) => onChange(field, Number(e.target.value))}
        style={{ ...inputStyle, padding: "6px 10px" }}
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
  const fileRef                 = useRef<HTMLInputElement>(null);

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
      <div className="mb-3" style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)" }} />
      <label className="block font-display text-xs tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
        Action Photos
      </label>

      {error && <p className="font-body text-xs mb-2" style={{ color: "#dc2626" }}>{error}</p>}

      <div className="flex flex-wrap gap-2 mb-3">
        {photos.map((photo) => (
          <div key={photo.id} className="relative group" style={{ width: 72, height: 72 }}>
            <ResilientNativeImage
              src={photo.url}
              alt="Action photo"
              fallbackVariant="person"
              className="w-full h-full object-cover rounded-lg"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            />
            <button
              type="button"
              onClick={() => void handleDelete(photo)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: "#dc2626" }}
              aria-label="Delete photo"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))}

        {/* Upload button */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center justify-center rounded-lg transition-colors"
          style={{
            width: 72, height: 72,
            border: "1px dashed rgba(255,255,255,0.15)",
            backgroundColor: uploading ? "rgba(255,255,255,0.03)" : "transparent",
            color: "rgba(255,255,255,0.3)",
            cursor: uploading ? "not-allowed" : "pointer",
          }}
          aria-label="Add action photo"
        >
          {uploading ? (
            <span className="font-display text-xs tracking-widest uppercase" style={{ fontSize: "0.6rem" }}>…</span>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 4 }}>
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="font-display uppercase" style={{ fontSize: "0.55rem", letterSpacing: "0.08em" }}>Add</span>
            </>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>
      {photos.length === 0 && !uploading && (
        <p className="font-body text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
          No action photos yet. Click + to upload.
        </p>
      )}
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
  const fileRef = useRef<HTMLInputElement>(null);
  const { clubLogoUrl } = useClubBranding();
  const club = useClubContext();
  // The inline panel and the dedicated /admin/season-stats tab write the same
  // player_season_stats / goalkeeper_season_stats rows, so academy@1 admins had
  // two places to edit one number. The season-stats tab is the single entry
  // point for this template; every other template keeps the inline panel.
  // Nothing else depends on it: the panel only renders for an already-saved
  // player and never seeds rows as a side effect of creating one.
  const hidesInlineSeasonStats =
    club.presentationTemplateKey === "academy@1";
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
      {/* Photo picker */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
          style={{ backgroundColor: "#0e0e0e", border: "1px solid rgba(255,255,255,0.08)" }}>
          <ResilientNativeImage
            src={preview}
            alt="preview"
            fallbackVariant="person"
            className={`w-full h-full ${previewIsClubLogo ? "object-contain" : "object-cover"}`}
          />
        </div>
        <div>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest text-xs"
            style={{ backgroundColor: "#1e1e1e", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
            {preview ? "Change Photo" : "Upload Photo"}
          </button>
          {photoFile && (
            <p className="font-body text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>{photoFile.name}</p>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)} />
        </div>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name" required>
          <input type="text" placeholder="e.g. Christian Alcala" value={form.name}
            onChange={(e) => set("name", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Jersey #" required>
          <input type="number" min={1} value={form.number || ""}
            onChange={(e) => set("number", Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="Position" required>
          <select value={form.position} onChange={(e) => set("position", e.target.value)} style={inputStyle}>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Nationality" required>
          <NationalitySelect
            value={form.nationality}
            onChange={(v) => set("nationality", v)}
          />
        </Field>
        <Field label="Hometown" required>
          <input type="text" placeholder="e.g. Portland, OR" value={form.hometown}
            onChange={(e) => set("hometown", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Age" required>
          <input type="number" min={1} value={form.age || ""}
            onChange={(e) => set("age", Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="Height" required>
          <input type="text" placeholder={"e.g. 5'10\""} value={form.height}
            onChange={(e) => set("height", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Weight" required>
          <input type="text" placeholder="e.g. 165 lbs" value={form.weight}
            onChange={(e) => set("weight", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="School (optional)">
          <input type="text" placeholder="e.g. University of Portland" value={form.school ?? ""}
            onChange={(e) => set("school", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Previous Club (optional)">
          <input type="text" placeholder="e.g. Portland FC" value={form.previous_club ?? ""}
            onChange={(e) => set("previous_club", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Captain">
          <button
            type="button"
            onClick={() => set("caption", form.caption === "(C)" ? "" : "(C)")}
            className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
            style={{
              backgroundColor: form.caption === "(C)" ? "rgba(220,38,38,0.15)" : "#0e0e0e",
              border: `1px solid ${form.caption === "(C)" ? "rgba(220,38,38,0.5)" : "rgba(255,255,255,0.08)"}`,
              width: "100%",
            }}
          >
            <span
              className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: form.caption === "(C)" ? "#dc2626" : "transparent",
                border: `2px solid ${form.caption === "(C)" ? "#dc2626" : "rgba(255,255,255,0.2)"}`,
              }}
            >
              {form.caption === "(C)" && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span className="font-body text-sm" style={{ color: form.caption === "(C)" ? "white" : "rgba(255,255,255,0.4)" }}>
              {form.caption === "(C)" ? "Captain — displays (C) next to name" : "Not a captain"}
            </span>
          </button>
        </Field>
        <Field label="Pronunciation (optional)">
          <input type="text" placeholder='e.g. "duh-MORE-ee-uh"' value={form.pronunciation ?? ""}
            onChange={(e) => set("pronunciation", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Preferred Foot (optional)">
          <select value={form.foot ?? ""} onChange={(e) => set("foot", e.target.value)} style={inputStyle}>
            <option value="">— Select —</option>
            <option value="Right">Right</option>
            <option value="Left">Left</option>
            <option value="Both">Both</option>
          </select>
        </Field>
      </div>
      <Field label="Bio (optional)">
        <textarea
          placeholder="Short player bio…"
          value={form.bio ?? ""}
          onChange={(e) => set("bio", e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
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
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = photoFile ? URL.createObjectURL(photoFile) : form.photo_url || null;

  function set(field: string, value: string) {
    onChange({ ...form, [field]: value });
  }

  return (
    <div className="space-y-4">
      {/* Photo picker */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
          style={{ backgroundColor: "#0e0e0e", border: "1px solid rgba(255,255,255,0.08)" }}>
          {preview
            ? <ResilientNativeImage src={preview} alt="preview" fallbackVariant="person" className="w-full h-full object-cover" />
            : <span className="font-display font-black text-lg" style={{ color: "rgba(255,255,255,0.2)" }}>
                {form.initials || "?"}
              </span>
          }
        </div>
        <div>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest text-xs"
            style={{ backgroundColor: "#1e1e1e", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
            {preview ? "Change Photo" : "Upload Photo"}
          </button>
          {photoFile && (
            <p className="font-body text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>{photoFile.name}</p>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)} />
        </div>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name" required>
          <input type="text" placeholder="e.g. John Smith" value={form.name}
            onChange={(e) => set("name", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Initials" required>
          <input type="text" placeholder="e.g. JS" maxLength={3} value={form.initials}
            onChange={(e) => set("initials", e.target.value.toUpperCase())} style={inputStyle} />
        </Field>
        <Field label="Role" required>
          <input type="text" placeholder="e.g. Head Coach" value={form.role}
            onChange={(e) => set("role", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Hometown" required>
          <input type="text" placeholder="e.g. Portland, OR" value={form.hometown}
            onChange={(e) => set("hometown", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Nationality">
          <NationalitySelect value={form.nationality} onChange={(v) => set("nationality", v)} />
        </Field>
      </div>
      <Field label="Bio (optional)">
        <textarea
          placeholder="Short bio about this staff member…"
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
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
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="w-full flex items-center gap-3 text-left"
        style={{ ...inputStyle, cursor: "pointer" }}
      >
        {selected ? (
          <>
            <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>{selected.flag}</span>
            <span className="font-body text-sm text-white">{selected.label}</span>
          </>
        ) : (
          <span className="font-body text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Select nationality…</span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: "auto", color: "rgba(255,255,255,0.3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            backgroundColor: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            zIndex: 50,
            maxHeight: 240,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Search */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <input
              autoFocus
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full font-body text-sm text-white outline-none"
              style={{ backgroundColor: "transparent", border: "none" }}
            />
          </div>

          {/* Options */}
          <div style={{ overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <p className="font-body text-xs px-3 py-3" style={{ color: "rgba(255,255,255,0.3)" }}>No results</p>
            ) : (
              filtered.map((n) => (
                <button
                  key={n.label}
                  type="button"
                  onClick={() => { onChange(n.label); setOpen(false); setSearch(""); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
                  style={{
                    backgroundColor: value === n.label ? "rgba(220,38,38,0.15)" : "transparent",
                    border: "none",
                  }}
                  onMouseEnter={(e) => { if (value !== n.label) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = value === n.label ? "rgba(220,38,38,0.15)" : "transparent"; }}
                >
                  <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>{n.flag}</span>
                  <span className="font-body text-sm text-white">{n.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared UI ─────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-display text-xs tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
        {label}{required && <span style={{ color: "#dc2626", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "#0e0e0e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "white",
  fontSize: "0.875rem",
  fontFamily: "inherit",
  outline: "none",
  colorScheme: "dark",
};
