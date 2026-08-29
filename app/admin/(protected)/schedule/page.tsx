"use client";

import Image from "@/components/ResilientImage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminFullPageLoader from "@/components/admin/AdminFullPageLoader";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminPage, AdminPageHeader, AdminPageToolbar, AdminPanel } from "@/components/admin/AdminPage";
import { AdminSidePanel } from "@/components/admin/AdminSidePanel";
import SeasonSelect from "@/components/admin/SeasonSelect";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import OpponentCrest from "@/components/OpponentCrest";
import { useClubContext } from "@/components/ClubContextProvider";
import type { DBSeason } from "@/lib/db-types";
import { createClient } from "@/lib/admin-client";
import { useSeasons } from "@/lib/use-seasons";
import { carrySponsorFromLatestMatch } from "@/lib/match-sponsor";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverPositioner,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SlidingPanelDirection } from "@/components/ui/sliding-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedLoading } from "@/lib/use-delayed-loading";

// ── Types ─────────────────────────────────────

type Match = {
  id: string;
  date: string;
  time: string;
  opponent: string;
  opponent_short_name: string | null;
  opponent_logo_url: string | null;
  competition: string | null;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  sponsor_link: string | null;
  home: boolean;
  venue: string;
  address: string | null;
  city: string | null;
  state: string | null;
  rose_city_score: number | null;
  opponent_score: number | null;
  season_id: string;
};

type FormState = Omit<Match, "id">;

type ResultFilter = "all" | "home" | "away" | "missing";

/** Lightweight placeholder shown for fast loads, before (if ever) escalating
 * to AdminFullPageLoader. Loosely mirrors the loaded layout: a couple of
 * month-group cards, each with a few match-row placeholders. */
function ScheduleListSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading schedule">
      {Array.from({ length: 2 }, (_, groupIndex) => (
        <div key={groupIndex} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-4 py-2.5">
            <Skeleton className="h-3.5 w-24" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }, (_, rowIndex) => (
              <div key={rowIndex} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-32 max-w-full" />
                </div>
                <Skeleton className="h-8 w-16 flex-shrink-0 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function emptyForm(seasonId = ""): FormState {
  return {
    date: "", time: "", opponent: "", opponent_short_name: null, opponent_logo_url: null, competition: "",
    sponsor_name: null, sponsor_logo_url: null, sponsor_link: null,
    home: true, venue: "", address: "", city: "", state: "",
    rose_city_score: null, opponent_score: null, season_id: seasonId,
  };
}

function normalizeScore(value: number | null): number | null {
  return value === null || Number.isNaN(value) ? null : value;
}

function parseDateInput(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MONTH_GROUP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-03-15" -> "March 2026". Parsed as UTC so the label never shifts a
 * day relative to the plain date string stored on the match. Falls back to
 * a literal "Undated" bucket for a match saved without a date. */
function monthGroupKey(dateValue: string): string {
  if (!dateValue) return "Undated";
  const parsed = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "Undated";
  return MONTH_GROUP_FORMATTER.format(parsed);
}

function hasResult(match: Pick<Match, "rose_city_score" | "opponent_score">): boolean {
  return match.rose_city_score !== null && match.opponent_score !== null;
}

const WEEKDAY_SHORT_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", { day: "2-digit", timeZone: "UTC" });
const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

function parseUtcDate(dateValue: string): Date | null {
  if (!dateValue) return null;
  const parsed = new Date(`${dateValue}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "2026-03-14" -> "Sat 14". Used in the row list, where the month is
 * already established by the group header above it. */
function formatRowDate(dateValue: string): string {
  const parsed = parseUtcDate(dateValue);
  if (!parsed) return "No date";
  return `${WEEKDAY_SHORT_FORMATTER.format(parsed)} ${DAY_FORMATTER.format(parsed)}`;
}

/** "2026-03-14" -> "Sat 14 Mar". Used in the edit panel, which has no
 * surrounding month context of its own. */
function formatShortDate(dateValue: string): string {
  const parsed = parseUtcDate(dateValue);
  if (!parsed) return "No date";
  return `${WEEKDAY_SHORT_FORMATTER.format(parsed)} ${DAY_FORMATTER.format(parsed)} ${MONTH_SHORT_FORMATTER.format(parsed)}`;
}

/** "18:00" -> "6:00 PM" */
function formatTime12h(timeValue: string): string {
  if (!timeValue) return "";
  const [hourStr, minStr] = timeValue.split(":");
  const minutes = parseInt(minStr ?? "0", 10);
  let hours = parseInt(hourStr ?? "", 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return timeValue;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

async function uploadPhoto(file: File, bucket: string, folder: string): Promise<string> {
  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function deleteUnusedMatchImageUrls({
  bucket,
  urls,
  column,
  allowedPrefixes,
}: {
  bucket: string;
  urls: Array<string | null | undefined>;
  column: "opponent_logo_url" | "sponsor_logo_url";
  allowedPrefixes: string[];
}) {
  const supabase = createClient();
  const unusedUrls: string[] = [];

  for (const url of urls) {
    if (!url) continue;
    const { count, error } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq(column, url);
    if (error) throw new Error(error.message);
    if ((count ?? 0) === 0) unusedUrls.push(url);
  }

  await deleteStorageUrls(bucket, unusedUrls, allowedPrefixes);
}

// ── Main component ────────────────────────────

export default function SchedulePage() {
  const club = useClubContext();
  // See MatchForm: academy@1 never renders match sponsors, so the fields are
  // hidden and nothing is copied forward into a new match for that template.
  // editorial@1's EditorialScheduleMatchCard/EditorialNextMatch also render no
  // sponsor data, so the same applies there.
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const isEditorial = club.presentationTemplateKey === "editorial@1";
  const hidesMatchSponsorFields = isAcademy || isEditorial;
  const carrySponsor = useCallback(
    (list: Match[], seasonId: string) =>
      hidesMatchSponsorFields ? {} : carrySponsorFromLatestMatch(list, seasonId),
    [hidesMatchSponsorFields],
  );
  const {
    seasons,
    selectedSeasonId,
    setSelectedSeasonId,
    loading: seasonsLoading,
  } = useSeasons();
  const [matches, setMatches]       = useState<Match[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<FormState>(emptyForm());
  const [addOpen, setAddOpen]       = useState(false);
  const [addForm, setAddForm]       = useState<FormState>(emptyForm());
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [saved, setSaved]           = useState(false);

  // Panel state: the side panel is open whenever `addOpen` or `editingId` is
  // set. `panelDirection` drives the SlidingPanel content-swap animation —
  // 1 opens/advances, -1 retargets backward — same convention as Roster's
  // AdminSidePanel pilot.
  const [panelDirection, setPanelDirection] = useState<SlidingPanelDirection>(1);

  // Search + result filter: pure client-side derived state, same pattern as
  // Roster's search/status filters — the season's matches are already loaded
  // in full, so no new query is needed.
  const [searchQuery, setSearchQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  // ── Load ────────────────────────────────────

  async function load() {
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("matches")
      .select("id, date, time, opponent, opponent_short_name, opponent_logo_url, competition, sponsor_name, sponsor_logo_url, sponsor_link, home, venue, address, city, state, rose_city_score, opponent_score, season_id")
      .order("date")
      .order("time");
    if (loadError) setError(loadError.message);
    setMatches((data ?? []) as Match[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setEditingId(null);
    setAddForm({
      ...emptyForm(selectedSeasonId),
      ...carrySponsor(matches, selectedSeasonId),
    });
  }, [carrySponsor, matches, selectedSeasonId]);

  // Fast (local/typical) loads should only ever show the lightweight
  // skeleton below; the full-page overlay is reserved for genuinely slow
  // loads. See lib/use-delayed-loading.ts.
  const showFullLoader = useDelayedLoading(loading || seasonsLoading, 400);

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  // ── Add ─────────────────────────────────────

  function validate(form: FormState): string | null {
    if (!form.season_id) return "Season is required.";
    if (!form.date)     return "Date is required.";
    if (!form.time)     return "Time is required.";
    if (!form.opponent.trim()) return "Opponent is required.";
    if (!form.venue.trim())    return "Venue is required.";
    const roseCityScore = form.rose_city_score;
    const opponentScore = form.opponent_score;
    const hasRoseCityScore = roseCityScore !== null;
    const hasOpponentScore = opponentScore !== null;
    if (hasRoseCityScore !== hasOpponentScore) {
      return "Enter both scores, or leave both blank.";
    }
    if (
      (roseCityScore !== null && (!Number.isInteger(roseCityScore) || roseCityScore < 0)) ||
      (opponentScore !== null && (!Number.isInteger(opponentScore) || opponentScore < 0))
    ) {
      return "Scores must be whole numbers of 0 or higher.";
    }
    if (form.sponsor_logo_url && !form.sponsor_name?.trim()) {
      return "Sponsor name is required when a sponsor logo is uploaded.";
    }
    if (form.sponsor_link?.trim()) {
      try {
        const sponsorUrl = new URL(form.sponsor_link);
        if (!['http:', 'https:'].includes(sponsorUrl.protocol)) throw new Error();
      } catch {
        return "Sponsor website link must be a valid http or https address.";
      }
    }
    return null;
  }

  async function handleAdd() {
    const validationError = validate(addForm);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.from("matches").insert([{
      ...addForm,
      address: addForm.address?.trim() || null,
      city: addForm.city?.trim() || null,
      state: addForm.state?.trim() || null,
      rose_city_score: normalizeScore(addForm.rose_city_score),
      opponent_score: normalizeScore(addForm.opponent_score),
      opponent_short_name: addForm.opponent_short_name?.trim() || null,
      competition: addForm.competition?.trim() || null,
      sponsor_name: addForm.sponsor_name?.trim() || null,
      sponsor_logo_url: addForm.sponsor_logo_url?.trim() || null,
      sponsor_link: addForm.sponsor_link?.trim() || null,
    }]);
    if (e) { setError(e.message); setSaving(false); return; }
    setAddForm({
      ...emptyForm(selectedSeasonId),
      ...carrySponsor(matches, selectedSeasonId),
    });
    setAddOpen(false);
    await load();
    flash();
    setSaving(false);
  }

  // ── Edit ────────────────────────────────────

  function startEdit(m: Match) {
    setEditingId(m.id);
    setEditForm({
      date: m.date, time: m.time, opponent: m.opponent,
      opponent_short_name: m.opponent_short_name,
      opponent_logo_url: m.opponent_logo_url, competition: m.competition ?? "",
      sponsor_name: m.sponsor_name, sponsor_logo_url: m.sponsor_logo_url,
      sponsor_link: m.sponsor_link,
      home: m.home, venue: m.venue, address: m.address ?? "",
      city: m.city ?? "", state: m.state ?? "",
      rose_city_score: m.rose_city_score, opponent_score: m.opponent_score,
      season_id: m.season_id,
    });
  }

  // Panel key for the currently-open row/form, in the same chronological
  // order the rows render in (independent of the month grouping). Used only
  // to pick a slide direction when the panel retargets from one match
  // straight to another without closing.
  function panelIndex(key: string | null): number {
    if (key === null) return -1;
    return sorted.findIndex((m) => m.id === key);
  }

  function openAddPanel() {
    setPanelDirection(1);
    setEditingId(null);
    setAddForm({
      ...emptyForm(selectedSeasonId),
      ...carrySponsor(matches, selectedSeasonId),
    });
    setError(null);
    setAddOpen(true);
  }

  function openEditPanel(m: Match) {
    const fromIndex = addOpen ? -1 : panelIndex(editingId);
    const toIndex = panelIndex(m.id);
    setPanelDirection(fromIndex === -1 ? 1 : toIndex >= fromIndex ? 1 : -1);
    setAddOpen(false);
    setError(null);
    startEdit(m);
  }

  function closePanel() {
    setAddOpen(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const validationError = validate(editForm);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const originalMatch = matches.find((match) => match.id === editingId);
    const { error: e } = await supabase.from("matches").update({
      ...editForm,
      address: editForm.address?.trim() || null,
      city: editForm.city?.trim() || null,
      state: editForm.state?.trim() || null,
      rose_city_score: normalizeScore(editForm.rose_city_score),
      opponent_score: normalizeScore(editForm.opponent_score),
      opponent_short_name: editForm.opponent_short_name?.trim() || null,
      competition: editForm.competition?.trim() || null,
      sponsor_name: editForm.sponsor_name?.trim() || null,
      sponsor_logo_url: editForm.sponsor_logo_url?.trim() || null,
      sponsor_link: editForm.sponsor_link?.trim() || null,
    }).eq("id", editingId);
    if (e) { setError(e.message); setSaving(false); return; }
    await deleteUnusedMatchImageUrls({
      bucket: "opponent-logos",
      urls: [
        originalMatch?.opponent_logo_url !== editForm.opponent_logo_url
          ? originalMatch?.opponent_logo_url
          : null,
      ],
      column: "opponent_logo_url",
      allowedPrefixes: ["match-opponents/"],
    });
    await deleteUnusedMatchImageUrls({
      bucket: "sponsors",
      urls: [
        originalMatch?.sponsor_logo_url !== editForm.sponsor_logo_url
          ? originalMatch?.sponsor_logo_url
          : null,
      ],
      column: "sponsor_logo_url",
      allowedPrefixes: ["match-sponsors/"],
    });
    setEditingId(null);
    await load();
    flash();
    setSaving(false);
  }

  // ── Delete ──────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.from("matches").delete().eq("id", id);
    if (e) { setError(e.message); setDeletingId(null); return; }
    setMatches((prev) => prev.filter((m) => m.id !== id));
    setDeletingId(null);
    if (editingId === id) closePanel();
  }

  // ── Render ───────────────────────────────────

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId);
  const sorted = matches.filter((match) => match.season_id === selectedSeasonId).sort((a, b) => {
    const keyA = `${a.date}T${a.time ?? "00:00"}`;
    const keyB = `${b.date}T${b.time ?? "00:00"}`;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  // Counts for the filter chips reflect the whole season, independent of
  // the search box — same convention as the mockup's "All 18 / Home 9 /
  // Away 9 / Result missing 4" chip labels.
  const resultFilterCounts = useMemo(
    () => ({
      all: sorted.length,
      home: sorted.filter((m) => m.home).length,
      away: sorted.filter((m) => !m.home).length,
      missing: sorted.filter((m) => !hasResult(m)).length,
    }),
    [sorted],
  );

  const resultFiltered = useMemo(() => {
    if (resultFilter === "home") return sorted.filter((m) => m.home);
    if (resultFilter === "away") return sorted.filter((m) => !m.home);
    if (resultFilter === "missing") return sorted.filter((m) => !hasResult(m));
    return sorted;
  }, [sorted, resultFilter]);

  // Search is pure client-side derived state — the season's matches are
  // already loaded in full, so no new query is needed.
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return resultFiltered;
    return resultFiltered.filter(
      (m) => m.opponent.toLowerCase().includes(q) || m.venue.toLowerCase().includes(q),
    );
  }, [resultFiltered, searchQuery]);

  // Group the (already chronologically sorted) list by month. Map preserves
  // insertion order, so the groups themselves come out in date order too —
  // matches stay sorted within each month exactly as they were in the flat
  // list.
  const monthGroups = useMemo(() => {
    const groups = new Map<string, Match[]>();
    for (const m of filtered) {
      const key = monthGroupKey(m.date);
      const group = groups.get(key);
      if (group) group.push(m);
      else groups.set(key, [m]);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const panelOpen = addOpen || editingId !== null;
  const panelKey = addOpen ? "add" : (editingId ?? "closed");
  const panelForm = editingId ? editForm : addForm;
  const panelOnChange = editingId ? setEditForm : setAddForm;

  return (
    <AdminPage className="max-w-4xl">
      <AdminSaveFeedback saving={saving} saved={saved} />

      <AdminPageHeader
        title="Schedule"
        description="Add, edit, or remove matches."
        actions={<div className="flex flex-wrap items-end gap-3">
          <SeasonSelect
            seasons={seasons}
            value={selectedSeasonId}
            onChange={setSelectedSeasonId}
            label="View Season"
            disabled={seasonsLoading || saving}
          />
          <button
            onClick={openAddPanel}
            disabled={!selectedSeasonId}
            className="flex-shrink-0 rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground transition-opacity hover:bg-primary/90 disabled:opacity-50"
          >
            + Add Match
          </button>
        </div>}
      />

      {/* Global feedback */}
      {error && !panelOpen && (
        <p className="font-body text-sm mb-4 text-destructive">
          Error: {error}
        </p>
      )}

      {/* Search + result filter */}
      <AdminPageToolbar className="flex-col items-stretch gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search opponent or venue…"
            aria-label="Search matches by opponent or venue"
            className={cn(ADMIN_INPUT_CLASS, "pl-9")}
          />
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="group"
            aria-label="Filter matches by result"
            className="flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/60 p-1"
          >
            {([
              ["all", `All ${resultFilterCounts.all}`],
              ["home", `Home ${resultFilterCounts.home}`],
              ["away", `Away ${resultFilterCounts.away}`],
              ["missing", `Result missing ${resultFilterCounts.missing}`],
            ] as [ResultFilter, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setResultFilter(value)}
                aria-pressed={resultFilter === value}
                className={cn(
                  "min-h-9 flex-none rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  resultFilter === value
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="whitespace-nowrap font-body text-sm text-muted-foreground">
            Sorted by date
          </p>
        </div>
      </AdminPageToolbar>

      {/* Match list, grouped by month */}
      {loading || seasonsLoading || showFullLoader ? (
        showFullLoader ? (
          <AdminFullPageLoader label="Loading schedule" />
        ) : (
          <ScheduleListSkeleton />
        )
      ) : filtered.length === 0 ? (
        <AdminPanel className="flex flex-col items-center gap-1 py-10 text-center">
          <p className="font-body text-sm font-semibold text-foreground">
            {sorted.length === 0
              ? "No matches yet"
              : resultFilter === "missing"
                ? "No matches are missing a result"
                : "No matches match your search and filters"}
          </p>
          <p className="font-body text-sm text-muted-foreground">
            {sorted.length === 0
              ? `Add a match for ${selectedSeason?.label ?? "the selected season"} to get started.`
              : resultFilter === "missing"
                ? "Every match this season already has a result."
                : "Try a different search term or filter."}
          </p>
        </AdminPanel>
      ) : (
        <div className="flex flex-col gap-4">
          {monthGroups.map(([month, monthMatches]) => (
            <div key={month} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
                <span className="font-display text-xs font-black uppercase tracking-widest text-foreground">
                  {month}
                </span>
                <span className="font-body text-xs text-muted-foreground">
                  {monthMatches.length} {monthMatches.length === 1 ? "match" : "matches"}
                </span>
              </div>
              <div className="divide-y divide-border">
                {monthMatches.map((m) => {
                  const isEditing = editingId === m.id;
                  const venueLine = [m.venue, m.city, m.state].filter(Boolean).join(", ") +
                    (m.address ? ` · ${m.address}` : "");
                  const subtitle = (
                    <>
                      {/* Competition */}
                      {m.competition && (
                        <p className="truncate font-body text-xs text-muted-foreground">{m.competition}</p>
                      )}

                      {!hidesMatchSponsorFields && m.sponsor_logo_url && (
                        <p className="truncate font-body text-xs text-muted-foreground">
                          Presented by {m.sponsor_name || "match sponsor"}
                        </p>
                      )}
                    </>
                  );

                  const editButton = (
                    <button
                      onClick={() => openEditPanel(m)}
                      className={cn(
                        "flex-none rounded-lg px-3 py-1.5 font-body text-xs font-medium transition-colors",
                        isEditing
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card text-foreground hover:bg-accent",
                      )}
                    >
                      {isEditing ? "Editing" : "Edit"}
                    </button>
                  );
                  const resultLabel = hasResult(m) ? (
                    <span className="font-display text-sm font-semibold tabular-nums text-foreground">
                      <span aria-hidden="true">{m.rose_city_score} – {m.opponent_score}</span>
                      <span className="sr-only">
                        Result: {club.name} {m.rose_city_score} - {m.opponent_score} {m.opponent}
                      </span>
                    </span>
                  ) : (
                    <span className="font-body text-xs text-warning">No result yet</span>
                  );

                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "transition-colors",
                        isEditing ? "border-l-4 border-l-primary bg-primary/5" : "hover:bg-accent/40",
                      )}
                    >
                      {/* Mobile: stacked card */}
                      <div className="flex items-center gap-3 px-4 py-3 sm:hidden">
                        <OpponentCrest name={m.opponent} logoUrl={m.opponent_logo_url} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-display text-sm font-black uppercase text-foreground">
                              {m.home ? "vs" : "@"} {m.opponent}
                            </span>
                            <span
                              className={cn(
                                "flex-none rounded px-1.5 py-0.5 font-display text-[0.65rem] font-bold uppercase tracking-wider",
                                m.home ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                              )}
                            >
                              {m.home ? "Home" : "Away"}
                            </span>
                          </div>
                          <p className="font-body text-xs text-muted-foreground">
                            {formatRowDate(m.date)} · {formatTime12h(m.time)}
                          </p>
                          {subtitle}
                          <p className="truncate font-body text-xs text-muted-foreground">{venueLine}</p>
                          <div className="mt-1">{resultLabel}</div>
                        </div>
                        {editButton}
                      </div>

                      {/* Desktop: table row — date/time, crest, opponent, result, venue, actions */}
                      <div className="hidden grid-cols-[5.5rem_2.5rem_minmax(0,1.9fr)_7rem_minmax(0,1fr)_6rem] items-center gap-4 px-4 py-3 sm:grid">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("font-display text-sm font-semibold", isEditing ? "text-primary" : "text-foreground")}>
                            {formatRowDate(m.date)}
                          </span>
                          <span className="font-body text-xs text-muted-foreground">{formatTime12h(m.time)}</span>
                        </div>
                        <OpponentCrest name={m.opponent} logoUrl={m.opponent_logo_url} size={34} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-display text-sm font-black uppercase text-foreground">
                              {m.home ? "vs" : "@"} {m.opponent}
                            </span>
                            <span
                              className={cn(
                                "flex-none rounded px-1.5 py-0.5 font-display text-[0.65rem] font-bold uppercase tracking-wider",
                                m.home ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                              )}
                            >
                              {m.home ? "Home" : "Away"}
                            </span>
                          </div>
                          {subtitle}
                        </div>
                        <div>{resultLabel}</div>
                        <div className="min-w-0">
                          <span className="block truncate font-body text-xs text-muted-foreground">{venueLine}</span>
                        </div>
                        <div className="flex justify-end">{editButton}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminSidePanel
        open={panelOpen}
        onClose={closePanel}
        title={editingId ? `${editForm.home ? "vs" : "@"} ${editForm.opponent || "Opponent"}` : "New Match"}
        description={
          editingId
            ? [formatShortDate(editForm.date), formatTime12h(editForm.time)].filter(Boolean).join(" · ") || "No date"
            : "Add a match to the schedule."
        }
        activeKey={panelKey}
        direction={panelDirection}
      >
        <MatchForm
          form={panelForm}
          onChange={panelOnChange}
          seasons={seasons}
          cleanupDraftUploads={!editingId}
        />
        {error && <p className="mt-4 font-body text-sm text-destructive">Error: {error}</p>}
        <div className="mt-4 flex items-center gap-3">
          {editingId && (
            <button
              onClick={() => handleDelete(editingId)}
              disabled={deletingId === editingId}
              className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2 font-display text-xs font-black uppercase tracking-widest text-destructive/80 hover:bg-destructive/20 disabled:cursor-not-allowed disabled:text-destructive/40 disabled:hover:bg-destructive/10"
            >
              {deletingId === editingId ? "Deleting…" : "Delete"}
            </button>
          )}
          <div className="ml-auto flex gap-3">
            <button
              onClick={closePanel}
              className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-xs border border-border bg-card text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={editingId ? handleSaveEdit : handleAdd}
              disabled={saving}
              className="rounded-lg bg-primary px-6 py-2 font-display text-xs font-black uppercase tracking-widest text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <AdminLoadingDots className="mr-2" />}
              {saving ? "Saving…" : editingId ? "Save" : "Save Match"}
            </button>
          </div>
        </div>
      </AdminSidePanel>
    </AdminPage>
  );
}

// ── Reusable form ─────────────────────────────

function MatchForm({
  form,
  onChange,
  seasons,
  cleanupDraftUploads = false,
}: {
  form: Omit<Match, "id">;
  onChange: (f: Omit<Match, "id">) => void;
  seasons: DBSeason[];
  cleanupDraftUploads?: boolean;
}) {
  const club = useClubContext();
  // academy@1 renders fixtures through AcademyNextMatch and AcademyFixtureRow,
  // neither of which reads sponsor_name, sponsor_logo_url, or sponsor_link, so
  // anything entered here could never appear on this club's site. Same
  // dead-admin-surface removal as DCFC-D130. The columns, the upload/cleanup
  // logic, and every other template's editor are untouched — clubhouse@1 still
  // renders these through NextMatchCard.
  // editorial@1's EditorialScheduleMatchCard and EditorialNextMatch also never
  // read sponsor_name, sponsor_logo_url, or sponsor_link, so the same applies
  // there.
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const isEditorial = club.presentationTemplateKey === "editorial@1";
  const hidesMatchSponsorFields = isAcademy || isEditorial;

  function set(field: string, value: string | boolean | number | null) {
    onChange({ ...form, [field]: value });
  }

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  function setScore(field: "rose_city_score" | "opponent_score", value: string) {
    set(field, value === "" ? null : Number(value));
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* ── Fixture ── */}
      <SectionHeader title="Fixture" />

      <Field label="Season" required>
        <NativeSelect
          value={form.season_id}
          onChange={(e) => set("season_id", e.target.value)}
          required
        >
          <NativeSelectOption value="">— Select a season —</NativeSelectOption>
          {seasons.map((season) => (
            <NativeSelectOption key={season.id} value={season.id}>
              {season.label}{season.active ? " (Active)" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Date" required>
        <div>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger
              render={<Button variant="outline" />}
              className="w-full justify-between font-normal"
            >
              {parseDateInput(form.date)?.toLocaleDateString() ?? "Select date"}
              <ChevronDownIcon className="size-4 opacity-50" />
            </PopoverTrigger>
            <PopoverPositioner align="start">
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={parseDateInput(form.date)}
                  captionLayout="dropdown"
                  onSelect={(date) => {
                    if (date) set("date", formatDateInput(date));
                    setDatePickerOpen(false);
                  }}
                />
              </PopoverContent>
            </PopoverPositioner>
          </Popover>
        </div>
      </Field>

      <Field label="Time" required>
        <input
          type="time"
          value={form.time}
          onChange={(e) => set("time", e.target.value)}
          className={ADMIN_INPUT_CLASS}
        />
      </Field>

      <Field label="Home / Away" required>
        <NativeSelect
          value={form.home ? "home" : "away"}
          onChange={(e) => set("home", e.target.value === "home")}
        >
          <NativeSelectOption value="home">Home</NativeSelectOption>
          <NativeSelectOption value="away">Away</NativeSelectOption>
        </NativeSelect>
      </Field>

      {/* ── Opponent ── */}
      <SectionHeader title="Opponent" />

      <Field label="Opponent" required className="sm:col-span-2">
        <input
          type="text"
          placeholder="e.g. Portland FC"
          value={form.opponent}
          onChange={(e) => set("opponent", e.target.value)}
          className={ADMIN_INPUT_CLASS}
        />
      </Field>

      <Field
        label="Opponent Short Name (optional)"
        help="Used on the homepage Next Match card only when the full opponent name is too long to fit on one line."
        className="sm:col-span-2"
      >
        <input
          type="text"
          placeholder="e.g. LA Galaxy Reserves"
          value={form.opponent_short_name ?? ""}
          onChange={(e) => set("opponent_short_name", e.target.value)}
          className={ADMIN_INPUT_CLASS}
        />
      </Field>

      <Field label="Competition (optional)">
        <input
          type="text"
          placeholder="e.g. UPSL 2027 Premier SoCal North"
          value={form.competition ?? ""}
          onChange={(e) => set("competition", e.target.value)}
          className={ADMIN_INPUT_CLASS}
        />
      </Field>

      <Field label="Opponent Logo (optional)">
        <OpponentLogoUpload
          logoUrl={form.opponent_logo_url}
          opponentName={form.opponent}
          onUploaded={async (url) => {
            if (cleanupDraftUploads) {
              await deleteUnusedMatchImageUrls({
                bucket: "opponent-logos",
                urls: [form.opponent_logo_url],
                column: "opponent_logo_url",
                allowedPrefixes: ["match-opponents/"],
              });
            }
            onChange({ ...form, opponent_logo_url: url });
          }}
          onRemove={async () => {
            if (cleanupDraftUploads) {
              await deleteUnusedMatchImageUrls({
                bucket: "opponent-logos",
                urls: [form.opponent_logo_url],
                column: "opponent_logo_url",
                allowedPrefixes: ["match-opponents/"],
              });
            }
            onChange({ ...form, opponent_logo_url: null });
          }}
        />
      </Field>

      {/* ── Venue ── */}
      <SectionHeader title="Venue" />

      <Field label="Venue" required className="sm:col-span-2">
        <input
          type="text"
          placeholder="e.g. Delta Park"
          value={form.venue}
          onChange={(e) => set("venue", e.target.value)}
          className={ADMIN_INPUT_CLASS}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-[1fr_1fr_5rem]">
        <Field label="Address (optional)">
          <input
            type="text"
            placeholder="e.g. 1234 N Broadacre St"
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
            className={ADMIN_INPUT_CLASS}
          />
        </Field>

        <Field label="City (optional)">
          <input
            type="text"
            placeholder="e.g. Irvine"
            value={form.city ?? ""}
            onChange={(e) => set("city", e.target.value)}
            className={ADMIN_INPUT_CLASS}
          />
        </Field>

        <Field label="State (optional)">
          <input
            type="text"
            placeholder="e.g. CA"
            value={form.state ?? ""}
            onChange={(e) => set("state", e.target.value)}
            className={ADMIN_INPUT_CLASS}
          />
        </Field>
      </div>

      {/* ── Result ── */}
      <SectionHeader title="Result" help="Leave blank until the match is played" />

      <Field label={`${club.name} Score (optional)`}>
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder="e.g. 2"
          value={form.rose_city_score ?? ""}
          onChange={(e) => setScore("rose_city_score", e.target.value)}
          className={ADMIN_INPUT_CLASS}
        />
      </Field>

      <Field label="Opponent Score (optional)">
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder="e.g. 1"
          value={form.opponent_score ?? ""}
          onChange={(e) => setScore("opponent_score", e.target.value)}
          className={ADMIN_INPUT_CLASS}
        />
      </Field>

      {/* ── Presented By Sponsor ── */}
      {!hidesMatchSponsorFields && (
        <>
          <SectionHeader
            title="Presented By Sponsor"
            help="New matches inherit these sponsor details from the latest match. Clear the logo to hide the sponsor on the homepage."
          />

          <Field label="Sponsor Name (optional)">
            <input
              type="text"
              placeholder="e.g. Tepito Coffee"
              value={form.sponsor_name ?? ""}
              onChange={(e) => set("sponsor_name", e.target.value)}
              className={ADMIN_INPUT_CLASS}
            />
          </Field>

          <Field label="Sponsor Website Link (optional)">
            <input
              type="url"
              placeholder="https://..."
              value={form.sponsor_link ?? ""}
              onChange={(e) => set("sponsor_link", e.target.value)}
              className={ADMIN_INPUT_CLASS}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Sponsor Logo (optional)">
              <SponsorLogoUpload
                logoUrl={form.sponsor_logo_url}
                sponsorName={form.sponsor_name ?? ""}
                onUploaded={async (url) => {
                  if (cleanupDraftUploads) {
                    await deleteUnusedMatchImageUrls({
                      bucket: "sponsors",
                      urls: [form.sponsor_logo_url],
                      column: "sponsor_logo_url",
                      allowedPrefixes: ["match-sponsors/"],
                    });
                  }
                  onChange({ ...form, sponsor_logo_url: url });
                }}
                onRemove={async () => {
                  if (cleanupDraftUploads) {
                    await deleteUnusedMatchImageUrls({
                      bucket: "sponsors",
                      urls: [form.sponsor_logo_url],
                      column: "sponsor_logo_url",
                      allowedPrefixes: ["match-sponsors/"],
                    });
                  }
                  onChange({ ...form, sponsor_logo_url: null });
                }}
              />
            </Field>
          </div>

          <p className="rounded-lg border border-border bg-muted/40 px-3.5 py-3 font-body text-xs leading-relaxed text-muted-foreground sm:col-span-2">
            This whole block is hidden for academy@1 and editorial@1 — neither template&rsquo;s fixture cards read
            the sponsor columns, so their rows never show a &ldquo;Presented by&rdquo; line either.
          </p>
        </>
      )}
    </div>
  );
}

function OpponentLogoUpload({
  logoUrl,
  opponentName,
  onUploaded,
  onRemove,
}: {
  logoUrl: string | null;
  opponentName: string;
  onUploaded: (url: string) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await onUploaded(await uploadPhoto(file, "opponent-logos", "match-opponents"));
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <OpponentCrest name={opponentName || "?"} logoUrl={logoUrl} size={40} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="px-3 py-2 rounded-lg font-display font-bold uppercase tracking-widest text-xs border border-border bg-card text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
      </button>
      {logoUrl && !uploading && (
        <button
          type="button"
          onClick={() => void onRemove()}
          className="font-display font-bold uppercase tracking-widest text-xs text-destructive/80"
        >
          Remove
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      {error && (
        <p className="font-body text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

function SponsorLogoUpload({
  logoUrl,
  sponsorName,
  onUploaded,
  onRemove,
}: {
  logoUrl: string | null;
  sponsorName: string;
  onUploaded: (url: string) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await onUploaded(await uploadPhoto(file, "sponsors", "match-sponsors"));
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className="relative flex h-14 w-28 items-center justify-center overflow-hidden rounded-lg border border-border bg-white"
      >
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={sponsorName ? `${sponsorName} logo` : "Sponsor logo"}
            fill
            sizes="112px"
            className="object-contain p-2"
          />
        ) : (
          <span className="font-display text-[0.55rem] font-bold uppercase tracking-widest text-black/35">
            No Logo
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="rounded-lg border border-border bg-card px-3 py-2 font-display text-xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
      </button>
      {logoUrl && !uploading && (
        <button
          type="button"
          onClick={() => void onRemove()}
          className="font-display text-xs font-bold uppercase tracking-widest text-destructive/80"
        >
          Remove
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
      />
      {error && (
        <p className="font-body w-full text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  help,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className={ADMIN_LABEL_CLASS}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
      {help && (
        <p className="font-body mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  );
}

/** Eyebrow label that groups the fields below it into a named section
 * (Fixture, Opponent, Venue, Result, Presented By Sponsor), matching the
 * mockup's panel grouping. Must be the first grid child of a section for
 * the `first:` divider suppression to apply. */
function SectionHeader({ title, help }: { title: string; help?: string }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-4 first:border-t-0 first:pt-0 sm:col-span-2">
      <span className="font-display text-xs font-black uppercase tracking-widest text-muted-foreground">
        {title}
      </span>
      {help && <span className="font-body text-xs text-muted-foreground">{help}</span>}
    </div>
  );
}
