"use client";

import {
  IconCaretDown as AdminSelectChevron,
  ChevronDown,
  X,
  Search,
  Check
} from "@/components/admin/icons";
/* eslint-disable @next/next/no-img-element */

import { useClubContext } from "@/components/ClubContextProvider";
import { codeSiteAdminFor } from "@/lib/code-site-admin";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { type PlayerForm, type Position } from "@/components/admin/roster/roster-model";
import { ClassicRosterStatsSave } from "@/components/admin/roster/ClassicRosterStatsSave";
import { Shimmer, ShimmerRegion } from "@/components/admin/ui/Shimmer";
import rosterStyles from "@/components/admin/roster/classic-roster.module.css";
import { ClassicStaffDialog } from "@/components/admin/roster/ClassicStaffDialog";
import { AdminToastProvider } from "@/components/admin/ui/AdminToast";
import ClassicRosterPage from "@/components/admin/roster/ClassicRosterPage";
import RoseCityRosterPage from "@/components/admin/roster/rose-city/RoseCityRosterPage";
import { usesKitRoster } from "@/lib/admin-roster-variant";
import { AdminImageField } from "@/components/admin/ui/AdminImageField";
import { adminImageRules, fileUploadRules } from "@/components/admin/ui/adminImageFiles";
import guided from "@/components/admin/AdminGuided.module.css";
import {
  AdminPageToolbar,
  AdminPanel,
} from "@/components/admin/AdminPage";
import FileUpload from "@/components/admin/FileUpload";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/admin-client";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { getRosterImageSrc, isRosterPlaceholderLogo, rosterImageForStorage } from "@/lib/roster-images";
import { cn } from "@/lib/utils";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { NATIONALITIES } from "@/lib/nationalities";
import { saveSeasonTotals } from "@/lib/season-totals-save";
import { PLAYER_MAX_AGE, PLAYER_MIN_AGE } from "@/lib/roster-player-age";
import ResilientNativeImage from "@/components/ResilientNativeImage";

// ── Types ─────────────────────────────────────


type Season = {
  id: string;
  label: string;
  start_year: number;
  end_year: number;
  active: boolean;
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


type StaffForm  = Omit<Staff,  "id" | "active"> & { nationality: string; bio: string };


function emptyStaff(): StaffForm {
  return { initials: "", name: "", role: "", hometown: "", nationality: "", bio: "", photo_url: "" };
}

const POSITIONS: Position[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
const POSITION_ABBR: Record<Position, string> = {
  Goalkeeper: "GK",
  Defender: "DF",
  Midfielder: "MF",
  Forward: "FW",
};

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
  const club = useClubContext();
  // RC-ADMIN-4b-roster: Rose City's classic Roster is the editor-kit page; every other club keeps the classic editor.
  if (usesKitRoster(club.slug)) {
    return <AdminToastProvider><RoseCityRosterPage StaffComponent={StaffTab} /></AdminToastProvider>;
  }
  return (
    <AdminToastProvider><ClassicRosterPage StaffComponent={StaffTab} PlayerFields={PlayerFormFields} /></AdminToastProvider>
  );
}

type StatusFilter = "all" | "active" | "inactive";

function StaffTab({ addRequest }: { addRequest: number }) {
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
  const handledAddRequest = useRef(addRequest);
  const classicCreatedId = useRef<string | null>(null);
  const classicEditorFocus = useRef<{ opener: HTMLElement | null; staffId: string | null }>({ opener: null, staffId: null });
  const classicSearch = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery]       = useState("");
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>("all");

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


  function validateStaff(f: StaffForm): string | null {
    if (!f.name.trim())     return "Name is required.";
    if (!f.initials.trim()) return "Initials are required.";
    if (!f.role.trim())     return "Role is required.";
    if (!f.hometown.trim()) return "Hometown is required.";
    return null;
  }

  async function handleAdd() {
    const ve = validateStaff(addForm);
    if (ve) { setError(ve); return false; }
    setSaving(true); setError(null);
    try {
      const supabase = createClient();
      let photoUrl = rosterImageForStorage(addForm.photo_url);
      if (addPhoto) photoUrl = await uploadPhoto(addPhoto, "staff-images", "staff");

      const previousPhoto = classicCreatedId.current ? staff.find(person => person.id === classicCreatedId.current)?.photo_url : null;
      const payload = { ...addForm, photo_url: photoUrl, active: true };
      const result = classicCreatedId.current
        ? await supabase.from("staff").update(payload).eq("id", classicCreatedId.current)
        : await supabase.from("staff").insert([payload]).select("id").single();
      if (result.error) { setError(result.error.message); setSaving(false); return false; }
      if (previousPhoto && previousPhoto !== photoUrl) await deleteStorageUrls("staff-images", [previousPhoto], ["staff/"]);
      if (!classicCreatedId.current) classicCreatedId.current = result.data.id as string;
      setAddForm(current => ({ ...current, photo_url: photoUrl }));
      setAddPhoto(current => current === addPhoto ? null : current);
      await load();
      setSaving(false);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setSaving(false);
    return false;
  }

  function startEdit(s: Staff) {
    setEditingId(s.id);
    setEditPhoto(null);
    setEditForm({ initials: s.initials, name: s.name, role: s.role, hometown: s.hometown, nationality: s.nationality ?? "", bio: s.bio ?? "", photo_url: s.photo_url });
  }

  const openAddPanel = useCallback(() => {
    classicEditorFocus.current = { opener: document.activeElement instanceof HTMLElement ? document.activeElement : null, staffId: null };
    classicCreatedId.current = null;
    setEditingId(null);
    setAddForm(emptyStaff());
    setAddPhoto(null);
    setError(null);
    setAddOpen(true);
  }, []);

  useEffect(() => {
    if (handledAddRequest.current === addRequest) return;
    handledAddRequest.current = addRequest;
    openAddPanel();
  }, [addRequest, openAddPanel]);

  function openEditPanel(s: Staff, opener: HTMLElement) {
    classicEditorFocus.current = { opener, staffId: s.id };
    setAddOpen(false);
    setError(null);
    startEdit(s);
  }

  function closePanel() {
    setAddOpen(false);
    setEditingId(null);
    setError(null);
  }

  function restoreClassicFocus() {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.tabIndex >= 0 && !focused.closest('[data-slot="admin-dialog"], [inert]')) return false;
    const { opener, staffId } = classicEditorFocus.current;
    return opener?.isConnected ? opener
      : (staffId ? document.querySelector<HTMLElement>('[data-staff-id="' + staffId + '"]') : null) ?? classicSearch.current;
  }

  async function handleSaveEdit() {
    if (!editingId) return false;
    const ve = validateStaff(editForm);
    if (ve) { setError(ve); return false; }
    setSaving(true); setError(null);
    try {
      const supabase = createClient();
      let photoUrl = rosterImageForStorage(editForm.photo_url);
      const originalStaff = staff.find((staffMember) => staffMember.id === editingId);
      if (editPhoto) photoUrl = await uploadPhoto(editPhoto, "staff-images", "staff");

      const { error: e } = await supabase.from("staff").update({ ...editForm, photo_url: photoUrl }).eq("id", editingId);
      if (e) { setError(e.message); setSaving(false); return false; }
      if (originalStaff?.photo_url !== photoUrl) {
        await deleteStorageUrls("staff-images", [originalStaff?.photo_url], ["staff/"]);
      }
      setEditForm(current => ({ ...current, photo_url: photoUrl }));
      setEditPhoto(current => current === editPhoto ? null : current);
      await load();
      setSaving(false);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setSaving(false);
    return false;
  }

  // Returns whether the toggle succeeded — mirrors PlayersTab's toggleActive
  // so the panel's Deactivate/Activate button knows whether it's safe to
  // close the panel.
  async function toggleActive(s: Staff): Promise<boolean> {
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
      return false;
    }
    await load();
    setSaving(false);
    return true;
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return staff.filter((s) => {
      if (statusFilter === "active" && !s.active) return false;
      if (statusFilter === "inactive" && s.active) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        s.initials.toLowerCase().includes(q)
      );
    });
  }, [staff, searchQuery, statusFilter]);

  const panelOpen = addOpen || editingId !== null;
  const panelKey = addOpen ? "add" : (editingId ?? "closed");
  const panelForm = editingId ? editForm : addForm;
  const panelPhoto = editingId ? editPhoto : addPhoto;
  const panelOnChange = editingId ? setEditForm : setAddForm;
  const panelOnPhotoChange = editingId ? setEditPhoto : setAddPhoto;
  // The full record behind the open edit panel, so the panel's footer
  // Deactivate/Activate button can read its current `active` state.
  const editingStaff = editingId ? staff.find((s) => s.id === editingId) ?? null : null;

  async function handlePanelToggleActive() {
    if (!editingStaff) return;
    const ok = await toggleActive(editingStaff);
    if (ok) closePanel();
  }

  return (
    <div>
      {/* Toolbar */}
      <AdminPageToolbar className="mb-6 flex-col items-stretch gap-4 sm:flex-col sm:items-stretch sm:justify-start">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-60">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              ref={classicSearch}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or role"
              aria-label="Search staff by name or role"
              className={cn(ADMIN_INPUT_CLASS, "pl-9")}
            />
          </div>
          <div className="flex flex-none items-center">
            <p className="whitespace-nowrap font-body text-sm text-muted-foreground">
              {staff.filter(s => s.active).length} active · {staff.filter(s => !s.active).length} inactive
            </p>
          </div>
        </div>

        <div className="flex flex-none items-center gap-2.5 self-start">
          <span className="whitespace-nowrap font-body text-sm text-muted-foreground">Showing</span>
          <NativeSelect chevronIcon={AdminSelectChevron}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter staff by status"
            className="min-h-11 w-auto min-w-[9.5rem] rounded-xl py-2 text-base"
          >
            <NativeSelectOption value="all">All staff</NativeSelectOption>
            <NativeSelectOption value="active">Active only</NativeSelectOption>
            <NativeSelectOption value="inactive">Inactive only</NativeSelectOption>
          </NativeSelect>
        </div>
      </AdminPageToolbar>

      {error && !panelOpen && (
        <p className="font-body text-sm mb-4 text-destructive">Error: {error}</p>
      )}

      {/* Staff list */}
      {loading ? (
        <RosterListSkeleton label="Loading staff" rows={3} />
      ) : filtered.length === 0 ? (
        <AdminPanel className="flex flex-col items-center gap-1 py-10 text-center">
          <p className="font-body text-sm font-semibold text-foreground">No staff match your search</p>
          <p className="font-body text-sm text-muted-foreground">Try a different name, role, or status.</p>
        </AdminPanel>
      ) : (
        <div className={cn("flex flex-col overflow-hidden rounded-xl border border-border", guided.listGroup)}>
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
            <span className="font-body text-sm font-semibold text-foreground">Staff</span>
            <span className="font-body text-xs text-muted-foreground">{filtered.length}</span>
            <span className="ml-auto font-body text-xs text-muted-foreground">Sorted by name</span>
          </div>
          {filtered.map((s, index) => {
            const isEditing = editingId === s.id;
            return (
              <div
                key={s.id}
                data-staff-id={s.id}
                role="button"
                tabIndex={0}
                onClick={(event) => openEditPanel(s, event.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditPanel(s, e.currentTarget); }
                }}
                className={cn(
                  "flex min-h-[72px] cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  index > 0 && "border-t border-border/40",
                  s.active ? "bg-card hover:bg-accent/40" : "bg-background opacity-60 hover:opacity-80",
                  isEditing && "bg-accent/50 ring-1 ring-inset ring-primary/40",
                )}>
                <div className="relative size-10 flex-none overflow-hidden rounded-full bg-muted">
                  <ResilientNativeImage
                    src={getRosterImageSrc(s.photo_url, clubLogoUrl)}
                    alt={s.name}
                    fallbackVariant="person"
                    className={`w-full h-full ${isRosterPlaceholderLogo(s.photo_url) ? "object-contain" : "object-cover"}`}
                  />
                </div>
                <span className="min-w-0 flex-1 break-words font-body text-[15px] font-semibold leading-5 text-foreground">
                  {s.name}
                  <span className="mt-1 block text-sm font-normal text-muted-foreground sm:hidden">{s.role}</span>
                </span>
                <span className="hidden w-44 flex-none truncate font-body text-xs text-muted-foreground sm:block">
                  {s.role}
                </span>
                {s.active ? (
                  <span className="inline-flex flex-none items-center gap-1.5 font-body text-xs font-medium text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                    <span className="hidden sm:inline">Active</span>
                  </span>
                ) : (
                  <span className="inline-flex flex-none rounded bg-muted/60 px-1.5 py-0.5 font-body text-xs font-medium text-muted-foreground">
                    Inactive
                  </span>
                )}
                <span
                  className={cn(
                    "w-14 flex-none text-right font-body text-sm font-medium",
                    isEditing ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {isEditing ? "Editing" : "Edit"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {panelOpen ? (
        <ClassicStaffDialog key={panelKey}
          title={editingId ? 'Edit ' + (editForm.name || 'staff member') : classicCreatedId.current ? 'Edit ' + (addForm.name || 'staff member') : 'Add staff member'}
          snapshot={JSON.stringify(panelForm)} photo={panelPhoto} saving={saving} error={error}
          onSave={async () => Boolean(await (editingId ? handleSaveEdit() : handleAdd()))} onClose={closePanel} finalFocus={restoreClassicFocus}
          visibilityAction={editingStaff ? (
            <button type="button" className="admin-press min-h-11 rounded-lg border border-border px-4 text-sm" disabled={saving} onClick={handlePanelToggleActive}>
              {editingStaff.active ? "Deactivate" : "Activate"}
            </button>
          ) : undefined}>
          <StaffFormFields form={panelForm} onChange={panelOnChange} photoFile={panelPhoto} onPhotoChange={panelOnPhotoChange} />
        </ClassicStaffDialog>
      ) : null}
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
  const [error, setError]             = useState<string | null>(null);
  const [statsDirty, setStatsDirty] = useState(false);
  const statsVersion = useRef(0);
  const [inSeason, setInSeason]       = useState(false);

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

  // ADMIN-RE-11c: the totals as visitors see them (match stats added up plus what
  // was added by hand). Saving keeps what is typed as the part added by hand.
  async function loadStats(seasonId: string) {
    statsVersion.current += 1;
    const supabase = createClient();
    const table = isGK ? "goalkeeper_season_totals" : "player_season_totals";
    const { data, error: statsError } = await supabase
      .from(table)
      .select(Object.keys(defaultStats).join(","))
      .eq("player_id", playerId)
      .eq("season_id", seasonId)
      .maybeSingle();
    if (statsError) {
      setError(statsError.message);
      setStats({ ...defaultStats });
      setInSeason(false);
      return;
    }
    setStats(data ? { ...defaultStats, ...(data as Record<string, number>) } : { ...defaultStats });
    setInSeason(Boolean(data));
    setStatsDirty(false);
  }

  useEffect(() => { loadSeasons(); }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSeasonChange(seasonId: string) {
    setSelectedId(seasonId);
    setLoading(true);
    await loadStats(seasonId);
    setLoading(false);
  }

  function setStat(key: string, value: number) {
    statsVersion.current += 1;
    setStats((s) => ({ ...s, [key]: value }));
    setStatsDirty(true);
  }

  async function handleSave() {
    setError(null);
    let ok = false;
    const submittedVersion = statsVersion.current;
    try {
      const problem = await saveSeasonTotals(createClient(), selectedId, [
        { playerId, name: "This player", keeper: isGK, typed: stats, inSeason },
      ]);
      if (problem) { setError(problem); } else { if (statsVersion.current === submittedVersion) { setInSeason(true); setStatsDirty(false); } ok = true; }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Season stats were not saved.");
    }
    return ok;
  }

  const statsContent = (
<>
          <div className={cn("grid grid-cols-1 gap-2 mb-3 sm:grid-cols-2", rosterStyles.statsGrid)}>
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
            <ClassicRosterStatsSave key={selectedId} dirty={statsDirty} onSave={handleSave} />
          </div>
        </>
  );

  return (
    <div>
      <div className="mb-3 h-px bg-border" />
      <div className="flex items-center justify-between mb-3">
        <label className="font-body text-sm font-medium text-muted-foreground">
          Season Stats
        </label>
        {/* Season picker */}
        <NativeSelect chevronIcon={AdminSelectChevron}
          value={selectedId}
          onChange={(e) => handleSeasonChange(e.target.value)}
          aria-label="Player season stats season"
          className="min-h-11 px-3 py-2 pr-8 text-base min-w-[160px]"
        >
          {seasons.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.label}{s.active ? " (Active)" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {error && <p className="font-body text-xs mb-2 text-destructive">{error}</p>}

      <div className={rosterStyles.statsSlot} data-field-count={isGK ? 7 : 10}>
        <ShimmerRegion loading={loading} minHeight="var(--classic-roster-stats-height)" loadingLabel="Loading season stats"
          skeleton={<div inert aria-hidden="true" className={rosterStyles.statsSkeleton}>
            <div className={cn("grid grid-cols-1 gap-2 mb-3 sm:grid-cols-2", rosterStyles.statsGrid)}>
              {Object.keys(defaultStats).map(field => <Shimmer key={field}><StatField label="Season statistic" field={"skeleton-" + field} stats={defaultStats} onChange={() => {}} /></Shimmer>)}
            </div>
            <Shimmer className="h-11 w-[150px] sm:h-[38px]" />
          </div>}>
          {statsContent}
        </ShimmerRegion>
      </div>
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
      <label htmlFor={`roster-stat-${field}`} className="mb-2 block font-body text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={`roster-stat-${field}`}
        type="number"
        min={0}
        value={String(stats[field] ?? 0)}
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
    <section className={cn("space-y-4", guided.formSection)} aria-labelledby="action-photos-heading">
      <FormSectionHeading id="action-photos-heading" title="Action photos" />

      {error && <p className="font-body text-xs mb-2 text-destructive">{error}</p>}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {photos.map((photo, index) => (
            <div key={photo.id} className="group relative aspect-square min-w-0">
            <ResilientNativeImage
              src={photo.url}
                alt={`Action photo ${index + 1}`}
              fallbackVariant="person"
              className="w-full h-full rounded-lg border border-border object-cover"
            />
            <button
              type="button"
              onClick={() => void handleDelete(photo)}
                className="absolute -right-2 -top-2 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Delete action photo ${index + 1}`}
            >
                <span className="flex size-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-transform group-hover:scale-105">
                  <X width="8" height="8" aria-hidden="true" />
                </span>
            </button>
          </div>
          ))}
        </div>
      )}

      <FileUpload
        label="Add action photos"
        {...fileUploadRules("photo")}
        multiple
        onUpload={(files) => void handleUpload(files)}
        uploading={uploading}
        density="compact"
      />
    </section>
  );
}

// ── Player form fields ────────────────────────

function PlayerFormFields({
  form, onChange, photoFile, onPhotoChange, playerId, uploading = false, validation = "", onPhotoPendingChange,
}: {
  form: PlayerForm;
  onChange: (f: PlayerForm) => void;
  photoFile: File | null;
  onPhotoChange: (f: File | null) => void;
  playerId?: string;
  uploading?: boolean;
  validation?: string;
  onPhotoPendingChange?: (pending: boolean) => void;
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
  const hidesInlineSeasonStats =
    codeSiteAdminFor(club)?.roster.showInlineSeasonStats === false;
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
    <div className="space-y-8">
      <section data-slot="admin-dialog-section" className={cn("space-y-4", guided.formSection)} aria-labelledby="basic-information-heading">
        <div>
          <FormSectionHeading id="basic-information-heading" title="Photo and basics" />
          <p className="mt-1.5 font-body text-xs text-muted-foreground">Required fields are marked with *.</p>
        </div>

        {/* Photo picker — deferred: the File is stored locally and uploaded at save time. */}
        <AdminImageField
          label="Player photo"
          previewUrl={previewIsClubLogo ? null : preview}
          initials={form.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase() || "?"}
          size={72}
          shape="circle"
          {...adminImageRules("photo")}
          uploading={uploading}
          onPendingChange={onPhotoPendingChange}
          onUpload={async files => { onPhotoChange(files[0]); return true; }}
          onRemove={() => { onPhotoChange(null); onChange({ ...form, photo_url: "" }); }}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlayerField id="player-name" label="Name" required>
            <input id="player-name" type="text" required aria-invalid={validation === "Enter the player's name." || undefined} aria-describedby={validation === "Enter the player's name." ? "player-name-error" : undefined} placeholder="e.g. Christian Alcala" value={form.name}
              onChange={(e) => set("name", e.target.value)} className={ADMIN_INPUT_CLASS} />
            {validation === "Enter the player's name." && <p id="player-name-error" className="mt-1 text-sm text-destructive">{validation}</p>}
          </PlayerField>
          <PlayerField id="player-number" label="Jersey number" required>
            <input id="player-number" type="number" required aria-invalid={validation === "Use 0 to 99." || undefined} aria-describedby={validation === "Use 0 to 99." ? "player-number-error" : undefined} min={0} max={99} value={String(Number.isNaN(form.number) ? "" : form.number)}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(e) => set("number", e.target.value === "" ? NaN : Number(e.target.value))} className={ADMIN_INPUT_CLASS} />
            {validation === "Use 0 to 99." && <p id="player-number-error" className="mt-1 text-sm text-destructive">{validation}</p>}
          </PlayerField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlayerField id="player-position" label="Position" required>
            <div id="player-position" role="group" aria-label="Player position" className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1">
              {POSITIONS.map(position => (
                <button key={position} type="button" aria-pressed={form.position === position}
                  onClick={() => set("position", position)}
                  className={cn("admin-press min-h-11 flex-1 rounded-md px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", form.position === position ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
                  {POSITION_ABBR[position]}
                </button>
              ))}
            </div>
          </PlayerField>
          <PlayerField id="player-nationality" label="Nationality" required>
            <NationalitySelect
              id="player-nationality"
              value={form.nationality}
              onChange={(v) => set("nationality", v)}
            />
          </PlayerField>
        </div>
        <PlayerField id="player-pronunciation" label="Pronunciation">
          <input id="player-pronunciation" type="text" placeholder='e.g. "duh-MORE-ee-uh"' value={form.pronunciation ?? ""}
            onChange={(e) => set("pronunciation", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </PlayerField>
      </section>

      <section data-slot="admin-dialog-section" className={cn("space-y-4", guided.formSection)} aria-labelledby="player-details-heading">
        <FormSectionHeading id="player-details-heading" title="Player details" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlayerField id="player-height" label="Height" required>
            <input id="player-height" type="text" required placeholder={"e.g. 5'10\""} value={form.height}
              onChange={(e) => set("height", e.target.value)} className={ADMIN_INPUT_CLASS} />
          </PlayerField>
          <PlayerField id="player-weight" label="Weight" required>
            <input id="player-weight" type="text" required placeholder="e.g. 165 lbs" value={form.weight}
              onChange={(e) => set("weight", e.target.value)} className={ADMIN_INPUT_CLASS} />
          </PlayerField>
          <PlayerField id="player-age" label="Age" required>
            <input id="player-age" type="number" required min={PLAYER_MIN_AGE} max={PLAYER_MAX_AGE} value={String(form.age || "")}
              aria-describedby="player-age-help"
              onChange={(e) => set("age", Number(e.target.value))} className={ADMIN_INPUT_CLASS} />
            <p id="player-age-help" className="mt-1 text-xs text-muted-foreground">
              {PLAYER_MIN_AGE} to {PLAYER_MAX_AGE}. Players under {PLAYER_MIN_AGE} aren&rsquo;t supported yet.
            </p>
          </PlayerField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlayerField id="player-hometown" label="Hometown" required>
            <input id="player-hometown" type="text" required placeholder="e.g. Portland, OR" value={form.hometown}
              onChange={(e) => set("hometown", e.target.value)} className={ADMIN_INPUT_CLASS} />
          </PlayerField>
          <PlayerField id="player-foot" label="Preferred foot">
            <NativeSelect chevronIcon={AdminSelectChevron} id="player-foot" value={form.foot ?? ""} onChange={(e) => set("foot", e.target.value)}>
              <NativeSelectOption value="">Select a foot</NativeSelectOption>
              <NativeSelectOption value="Right">Right</NativeSelectOption>
              <NativeSelectOption value="Left">Left</NativeSelectOption>
              <NativeSelectOption value="Both">Both</NativeSelectOption>
            </NativeSelect>
          </PlayerField>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={form.caption === "(C)"}
          onClick={() => set("caption", form.caption === "(C)" ? "" : "(C)")}
          className="flex min-h-11 w-full items-center justify-between gap-4 rounded-lg border border-border bg-background px-3.5 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            <span className="block font-body text-sm font-semibold text-foreground">Captain</span>
            <span className="mt-0.5 block font-body text-xs text-muted-foreground">Show (C) next to this player&apos;s name.</span>
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              form.caption === "(C)" ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform",
                form.caption === "(C)" ? "translate-x-5" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
      </section>

      <section data-slot="admin-dialog-section" className={cn("space-y-4", guided.formSection)} aria-labelledby="player-background-heading">
        <FormSectionHeading id="player-background-heading" title="Background" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlayerField id="player-school" label="School">
            <input id="player-school" type="text" placeholder="e.g. University of Portland" value={form.school ?? ""}
              onChange={(e) => set("school", e.target.value)} className={ADMIN_INPUT_CLASS} />
          </PlayerField>
          <PlayerField id="player-previous-club" label="Previous club">
            <input id="player-previous-club" type="text" placeholder="e.g. Portland FC" value={form.previous_club ?? ""}
              onChange={(e) => set("previous_club", e.target.value)} className={ADMIN_INPUT_CLASS} />
          </PlayerField>
        </div>
        <PlayerField id="player-bio" label="Bio">
          <Textarea
            id="player-bio"
            placeholder="Short player bio…"
            value={form.bio ?? ""}
            onChange={(e) => set("bio", e.target.value)}
            rows={3}
          />
        </PlayerField>
      </section>

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
        {...fileUploadRules("photo")}
        onUpload={(files) => onPhotoChange(files?.[0] ?? null)}
        previewUrl={previewIsClubLogo ? null : preview}
        onRemove={previewIsClubLogo ? undefined : () => {
          onPhotoChange(null);
          onChange({ ...form, photo_url: "" });
        }}
      />

      {/* Fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="staff-initials" label="Initials" required>
          <input id="staff-initials" type="text" placeholder="e.g. JS" maxLength={3} value={form.initials}
            onChange={(e) => set("initials", e.target.value.toUpperCase())} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field id="staff-name" label="Name" required>
          <input id="staff-name" type="text" placeholder="e.g. John Smith" value={form.name}
            onChange={(e) => set("name", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="staff-role" label="Role" required>
          <input id="staff-role" type="text" placeholder="e.g. Head Coach" value={form.role}
            onChange={(e) => set("role", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
        <Field id="staff-hometown" label="Hometown" required>
          <input id="staff-hometown" type="text" placeholder="e.g. Portland, OR" value={form.hometown}
            onChange={(e) => set("hometown", e.target.value)} className={ADMIN_INPUT_CLASS} />
        </Field>
      </div>
      <Field id="staff-nationality" label="Nationality">
        <NationalitySelect id="staff-nationality" value={form.nationality} onChange={(v) => set("nationality", v)} />
      </Field>
      <Field id="staff-bio" label="Bio (optional)">
        <Textarea
          id="staff-bio"
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

function NationalitySelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
}) {
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
        id={id}
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
        <ChevronDown
          width="16"
          height="16"

          aria-hidden="true"
          className={cn(
            "ml-auto flex-shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
         />
      </button>

      {/* Dropdown. The search row and the option list are flex siblings inside
          a clipped, height-capped panel, so the search header stays pinned
          while only the options scroll. */}
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 flex max-h-64 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          {/* Search header */}
          <div className="flex-shrink-0 border-b border-border bg-card p-2">
            <div className="flex items-center gap-2 rounded-lg border border-input bg-input/30 px-2.5 py-2 focus-within:border-ring focus-within:bg-input/50">
              <Search
                width="14"
                height="14"

                aria-hidden="true"
                className="flex-shrink-0 text-muted-foreground"
               />
              <input
                autoFocus
                type="text"
                aria-label="Search nationalities"
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
                      "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                      isSelected ? "bg-primary/10" : "hover:bg-accent",
                    )}
                  >
                    <span className="text-lg leading-none">{n.flag}</span>
                    <span className="truncate font-body text-sm text-foreground">{n.label}</span>
                    {isSelected && (
                      <Check
                        width="16"
                        height="16"

                        aria-hidden="true"
                        className="ml-auto flex-shrink-0 text-primary"
                       />
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

function PlayerField({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block font-body text-sm font-semibold text-foreground">
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function Field({ id, label, required, children }: { id: string; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={ADMIN_LABEL_CLASS}>
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

/** Quiet sentence-case heading for the player editor's task-based sections. */
function FormSectionHeading({ id, title }: { id?: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h3 id={id} className="font-body text-base font-semibold normal-case text-foreground">
        {title}
      </h3>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}
