"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { Plus, Search } from "@/components/admin/icons";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import SeasonSelect from "@/components/admin/SeasonSelect";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { useClubContext } from "@/components/ClubContextProvider";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { clubToday } from "@/lib/club-time";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import { createClient } from "@/lib/admin-client";
import { useSeasons } from "@/lib/use-seasons";
import { carrySponsorFromLatestMatch } from "@/lib/match-sponsor";
import { cn } from "@/lib/utils";
import { matchReplayEmbedUrl } from "@/lib/youtube-embed";
import { EMPTY_MATCH_SUMMARY, matchSummaryColumns, readMatchSummary } from "@/lib/match-summary";
import { Button } from "@/components/ui/button";
import { AdminDialog, AdminDialogFooter } from "@/components/admin/ui/AdminDialog";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { AdminSaveButton } from "@/components/admin/ui/AdminSaveButton";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import LegacySchedulePage from "@/components/admin/schedule/LegacySchedulePage";
import { MatchForm } from "@/components/admin/schedule/ScheduleMatchForm";
import { ScheduleMatchList, ScheduleListSkeleton } from "@/components/admin/schedule/ScheduleMatchList";
import { emptyForm, matchTooLong, normalizeScore, deleteUnusedMatchImageUrls, monthGroupKey, hasResult, formatShortDate, MAX_MATCH_SCORE, type Match, type FormState, type ResultFilter } from "@/components/admin/schedule/schedule-model";

export default function SchedulePage() {
  const portal = useAdminPortal();
  return portal.portal === "reimagined" ? <LegacySchedulePage /> : <ClassicSchedulePage />;
}

function ClassicSchedulePage() {
  const club = useClubContext();
  // See MatchForm: academy@1 never renders match sponsors, so the fields are
  // hidden and nothing is copied forward into a new match for that template.
  const schedulePolicy = codeSiteAdminFor(club)?.schedule;
  const hidesMatchSponsorFields = schedulePolicy?.showMatchSponsorFields === false;
  const isCinematic = club.presentationTemplateKey === "cinematic@2";
  // Attendance and the Match Summary are edited only for cinematic@2 clubs, so other designs never
  // overwrite those columns. Scorers follow the timeline's goals (lib/match-summary.ts).
  function summaryColumnsFor(form: FormState) {
    const { summary, attendance, ...rest } = form;
    return isCinematic ? { ...rest, attendance, ...matchSummaryColumns(summary) } : rest;
  }
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
  const [matchesReady, setMatchesReady] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<FormState>(emptyForm());
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null);
  const editorOpener = useRef<HTMLElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const editorActivity = useRef(0);
  const [addOpen, setAddOpen]       = useState(false);
  const [addForm, setAddForm]       = useState<FormState>(emptyForm());
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [error, setError]           = useState<string | null>(null);
  const [saved, setSaved]           = useState(false);

  const [editorSession, setEditorSession] = useState(0);
  const [savedSession, setSavedSession] = useState<number | null>(null);
  const [initialForm, setInitialForm] = useState<FormState>(emptyForm());
  const initialFormRef = useRef(initialForm);
  initialFormRef.current = initialForm;
  const panelDraft = useRef<FormState>(emptyForm());
  const uploadCountRef = useRef(0);
  const [uploadCount, setUploadCount] = useState(0);
  const [flashedId, setFlashedId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { timeZone } = useAdminPortal();
  const today = clubToday(timeZone);
  const missingResult = useCallback((match: Match) => match.date < today && !hasResult(match), [today]);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // Search + result filter: pure client-side derived state, same pattern as
  // Roster's search/status filters — the season's matches are already loaded
  // in full, so no new query is needed.
  const [searchQuery, setSearchQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  // ── Load ────────────────────────────────────

  async function load() {
    try {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("matches")
        .select("id, date, time, opponent, opponent_short_name, opponent_logo_url, opponent_logo_asset_id, competition, league_logo_url, league_logo_asset_id, sponsor_name, sponsor_logo_url, sponsor_logo_asset_id, sponsor_link, home, venue, address, city, state, rose_city_score, opponent_score, replay_video_url, attendance, summary, season_id")
        .order("date")
        .order("time");
      if (loadError) setError(loadError.message);
      else {
        setMatches((data ?? []) as Match[]);
        setMatchesReady(true);
      }
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (addOpen || editingId) return;
    setAddForm({
      ...emptyForm(selectedSeasonId),
      ...carrySponsor(matches, selectedSeasonId),
    });
  }, [carrySponsor, matches, selectedSeasonId, addOpen, editingId]);

  function flash(id?: string) {
    setSaved(true);
    if (id) setFlashedId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => { setSaved(false); setFlashedId(null); }, 1400);
  }

  // ── Add ─────────────────────────────────────

  function validate(form: FormState): string | null {
    if (!form.season_id) return "Season is required.";
    if (!form.date)     return "Date is required.";
    if (!form.time)     return "Time is required.";
    if (!form.opponent.trim()) return "Opponent is required.";
    if (!form.venue.trim())    return "Venue is required.";
    const tooLong = matchTooLong(form);
    if (tooLong) return tooLong;
    if ([form.rose_city_score, form.opponent_score].some((score) => score !== null && score > MAX_MATCH_SCORE)) {
      return `Scores can be at most ${MAX_MATCH_SCORE}.`;
    }
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
    if (matchReplayEmbedUrl(form.replay_video_url ?? "") === null) {
      return "The stream or replay video must be a YouTube video link, like https://youtu.be/…";
    }
    if (form.attendance !== null && (!Number.isInteger(form.attendance) || form.attendance < 0)) {
      return "Attendance must be a whole number of 0 or higher.";
    }
    return null;
  }

  async function handleAdd() {
    const validationError = validate(addForm);
    if (validationError) { setError(validationError); return false; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: inserted, error: e } = await supabase.from("matches").insert([{
      ...summaryColumnsFor(addForm),
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
      replay_video_url: matchReplayEmbedUrl(addForm.replay_video_url ?? "") || null,
    }]);
    if (e) { setError(e.message); setSaving(false); return false; }
    const createdId = Array.isArray(inserted) ? inserted[0]?.id : undefined;
    setCreatedMatchId(createdId ?? null);
    initialFormRef.current = addForm;
    setInitialForm(addForm);
    await load();
    flash(createdId);
    setSaving(false);
    return true;
  }

  // ── Edit ────────────────────────────────────

  function startEdit(m: Match) {
    setEditingId(m.id);
    setEditForm({
      date: m.date, time: m.time, opponent: m.opponent,
      opponent_short_name: m.opponent_short_name,
      opponent_logo_url: m.opponent_logo_url, competition: m.competition ?? "",
      league_logo_url: m.league_logo_url ?? null,
      sponsor_name: m.sponsor_name, sponsor_logo_url: m.sponsor_logo_url,
      sponsor_link: m.sponsor_link,
      home: m.home, venue: m.venue, address: m.address ?? "",
      city: m.city ?? "", state: m.state ?? "",
      rose_city_score: m.rose_city_score, opponent_score: m.opponent_score,
      replay_video_url: m.replay_video_url ?? null,
      attendance: m.attendance ?? null,
      summary: readMatchSummary(m.summary) ?? structuredClone(EMPTY_MATCH_SUMMARY),
      season_id: m.season_id,
    });
  }

  function openAddPanel() {
    editorOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCreatedMatchId(null);
    setEditorSession((current) => current + 1);
    const next = { ...emptyForm(selectedSeasonId), ...carrySponsor(matches, selectedSeasonId) };
    setInitialForm(next);
    setEditingId(null);
    setAddForm(next);
    setError(null);
    setAddOpen(true);
  }

  function openEditPanel(m: Match) {
    editorOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCreatedMatchId(null);
    setEditorSession((current) => current + 1);
    setAddOpen(false);
    setError(null);
    startEdit(m);
    setInitialForm({
      date: m.date, time: m.time, opponent: m.opponent,
      opponent_short_name: m.opponent_short_name,
      opponent_logo_url: m.opponent_logo_url, competition: m.competition ?? "",
      league_logo_url: m.league_logo_url ?? null,
      sponsor_name: m.sponsor_name, sponsor_logo_url: m.sponsor_logo_url, sponsor_link: m.sponsor_link,
      home: m.home, venue: m.venue, address: m.address ?? "", city: m.city ?? "", state: m.state ?? "",
      rose_city_score: m.rose_city_score, opponent_score: m.opponent_score,
      replay_video_url: m.replay_video_url ?? null,
      attendance: m.attendance ?? null,
      summary: readMatchSummary(m.summary) ?? structuredClone(EMPTY_MATCH_SUMMARY),
      season_id: m.season_id,
    });
  }

  function closePanel() {
    setAddOpen(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSaveEdit(editingId: string | null, editForm: FormState) {
    if (!editingId) return false;
    const validationError = validate(editForm);
    if (validationError) { setError(validationError); return false; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const originalMatch = matches.find((match) => match.id === editingId);
    const { error: e } = await supabase.from("matches").update({
      ...summaryColumnsFor(editForm),
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
      replay_video_url: matchReplayEmbedUrl(editForm.replay_video_url ?? "") || null,
    }).eq("id", editingId);
    if (e) { setError(e.message); setSaving(false); return false; }
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
    await deleteUnusedMatchImageUrls({
      bucket: "league-logos",
      urls: [originalMatch?.league_logo_url !== editForm.league_logo_url ? originalMatch?.league_logo_url : null],
      column: "league_logo_url",
      allowedPrefixes: ["match-leagues/"],
    });
    const savedId = editingId;
    initialFormRef.current = editForm;
    setInitialForm(editForm);
    await load();
    flash(savedId);
    setSaving(false);
    return true;
  }

  // ── Delete ──────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const supabase = createClient();
      const { error: e } = await supabase.from("matches").delete().eq("id", id);
      if (e) { setError(e.message); return; }
      setMatches((prev) => prev.filter((m) => m.id !== id));
      setConfirmDeleteOpen(false);
      if (editingId === id) closePanel();
    } catch {
      setError("This match could not be deleted. Check the connection and try again.");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ───────────────────────────────────

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId);
  const sorted = useMemo(() => matches.filter((match) => match.season_id === selectedSeasonId).sort((a, b) => {
    const keyA = `${a.date}T${a.time ?? "00:00"}`;
    const keyB = `${b.date}T${b.time ?? "00:00"}`;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  }), [matches, selectedSeasonId]);

  // Counts for the filter chips reflect the whole season, independent of
  // the search box — same convention as the mockup's "All 18 / Home 9 /
  // Away 9 / Result missing 4" chip labels.
  const resultFilterCounts = useMemo(
    () => ({
      all: sorted.length,
      home: sorted.filter((m) => m.home).length,
      away: sorted.filter((m) => !m.home).length,
      missing: sorted.filter(missingResult).length,
    }),
    [sorted, missingResult],
  );

  const resultFiltered = useMemo(() => {
    if (resultFilter === "home") return sorted.filter((m) => m.home);
    if (resultFilter === "away") return sorted.filter((m) => !m.home);
    if (resultFilter === "missing") return sorted.filter(missingResult);
    return sorted;
  }, [sorted, resultFilter, missingResult]);

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
  const panelForm = editingId ? editForm : addForm;
  panelDraft.current = panelForm;
  function panelOnChange(update: SetStateAction<FormState>) {
    const next = typeof update === "function" ? update(panelDraft.current) : update;
    panelDraft.current = next;
    editorActivity.current += 1;
    (editingId ? setEditForm : setAddForm)(next);
  }
  const dirty = panelOpen && JSON.stringify(panelForm) !== JSON.stringify(initialForm);
  const saveAction = useSaveState({
    isDirty: dirty,
    onSave: async () => {
      const activityAtSave = editorActivity.current;
      const persistedId = editingId ?? createdMatchId;
      const success = await (persistedId ? handleSaveEdit(persistedId, panelForm) : handleAdd()).catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : "The match could not be saved. Try again.");
        return false;
      });
      setSaving(false);
      if (!success) throw new Error("Match could not be saved");
      setSavedSession(editorActivity.current === activityAtSave ? editorSession : null);
    },
  });
  const visibleSaveState = saveAction.state === "saved" && savedSession !== editorSession ? "clean" : saveAction.state;
  useEffect(() => {
    if (!panelOpen || dirty || uploadCount > 0 || visibleSaveState !== "saved" || savedSession !== editorSession) return;
    const timer = setTimeout(() => {
      setAddOpen(false);
      setEditingId(null);
    }, 700);
    return () => clearTimeout(timer);
  }, [panelOpen, dirty, uploadCount, visibleSaveState, savedSession, editorSession]);

  const guardSaveAttempt = useRef<() => Promise<boolean>>(async () => false);
  guardSaveAttempt.current = async () => {
    if (uploadCountRef.current > 0 || saving) return false;
    const activityAtSave = editorActivity.current;
    try {
      await saveAction.save();
      return editorActivity.current === activityAtSave && uploadCountRef.current === 0
        && JSON.stringify(panelDraft.current) === JSON.stringify(initialFormRef.current);
    } catch { return false; }
  };

  const requestNavigation = useUnsavedGuard({
    dirty: dirty || uploadCount > 0,
    edited: editingId ? "this match" : "a new match",
    onSave: () => guardSaveAttempt.current(),
    onDiscard: closePanel,
  });
  function uploadBusyChange(delta: number) {
    uploadCountRef.current = Math.max(0, uploadCountRef.current + delta);
    setUploadCount(uploadCountRef.current);
  }

  function mediaActivity() {
    editorActivity.current += 1;
    setSavedSession(null);
  }

  function requestClose() {
    if (visibleSaveState === "saving" || uploadCount > 0) return;
    requestNavigation({ kind: "switch", label: "the schedule", continue: closePanel });
  }


  return (
    <AdminPage className="max-w-4xl">
      <span className="sr-only" role="status">{saved ? "Match saved" : ""}</span>

      <AdminPageHeader
        title="Schedule"
        description="Add, edit, or remove matches."
        actions={<div data-admin-page-action-group="" className="flex flex-wrap items-end gap-3">
          <SeasonSelect
            seasons={seasons}
            loading={seasonsLoading}
            value={selectedSeasonId}
            onChange={(value) => requestNavigation({ kind: "switch", label: "another season", continue: () => setSelectedSeasonId(value) })}
            label="View season"
            className="h-11"
            disabled={seasonsLoading || saving}
          />
          <Button
            onClick={() => requestNavigation({ kind: "switch", label: "a new match", continue: openAddPanel })}
            disabled={!matchesReady || seasonsLoading || saving || !selectedSeasonId}
            className="min-h-11 flex-shrink-0 rounded-xl bg-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Plus width={14} height={14} className="mr-1 inline-block align-middle" /> Add match
          </Button>
        </div>}
      />

      {/* Global feedback */}
      {error && !panelOpen && (
        <p className="font-body text-sm mb-4 text-destructive">
          Error: {error}
        </p>
      )}

      {/* Search + result filter */}
      <div data-schedule-toolbar="" className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={searchInput}
            type="search"
            value={searchQuery}
            onChange={(e) => { const value = e.target.value; requestNavigation({ kind: "switch", label: "another match search", continue: () => setSearchQuery(value) }); }}
            disabled={loading || seasonsLoading}
            placeholder="Search opponent or venue…"
            aria-label="Search matches by opponent or venue"
            className={cn(ADMIN_INPUT_CLASS, "pl-9")}
          />
        </div>
        <div className="flex min-w-0 items-start sm:shrink-0">
          <div
            role="group"
            aria-label="Filter matches by result"
            className="flex max-w-full flex-wrap gap-1 rounded-lg bg-muted/60 p-1"
          >
            {([
              ["all", "All"],
              ["home", "Home"],
              ["away", "Away"],
              ["missing", "Result missing"],
            ] as [ResultFilter, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => requestNavigation({ kind: "switch", label: "another match filter", continue: () => setResultFilter(value) })}
                aria-pressed={resultFilter === value}
                data-schedule-filter={value}
                disabled={loading || seasonsLoading}
                className={cn(
                  "admin-press inline-flex min-h-11 flex-none items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium sm:text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  resultFilter === value
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                )}
              >
                {label} <span className="inline-block w-[3ch] flex-none text-right tabular-nums">{loading || seasonsLoading ? "–" : resultFilterCounts[value]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <ShimmerRegion loading={loading || seasonsLoading} minHeight={360}
        loadingLabel="Loading schedule" skeleton={<ScheduleListSkeleton groups={matchesReady && !seasonsLoading ? monthGroups : undefined} showSponsors={!hidesMatchSponsorFields} />}>
        {!matchesReady ? null : filtered.length === 0 ? (
          <AdminPanel className="flex min-h-[180px] flex-col items-center justify-center gap-2 py-10 text-center">
            <p className="text-sm font-semibold">{sorted.length === 0 ? "No matches yet" : resultFilter === "missing" && !searchQuery.trim() ? "No matches are missing a result" : "No matches match your search and filters"}</p>
            <p className="text-sm text-muted-foreground">{sorted.length === 0 ? `Add a match for ${selectedSeason?.label ?? "the selected season"} to get started.` : resultFilter === "missing" && !searchQuery.trim() ? "Every played match already has a result." : "Try a different search term or filter."}</p>
            {sorted.length === 0 && <Button onClick={() => requestNavigation({ kind: "switch", label: "a new match", continue: openAddPanel })} disabled={!selectedSeasonId}>Add match</Button>}
          </AdminPanel>
        ) : <ScheduleMatchList groups={monthGroups} clubName={club.name} today={today} flashedId={flashedId}
          showSponsors={!hidesMatchSponsorFields} onEdit={openEditPanel}
          onResultFocusFallback={() => document.querySelector<HTMLButtonElement>('[data-schedule-filter="missing"]')?.focus()}
          onSaveResult={async (match, homeScore, awayScore) => {
            const supabase = createClient();
            const { error: resultError } = await supabase.from("matches").update({ rose_city_score: homeScore, opponent_score: awayScore }).eq("id", match.id);
            if (resultError) throw new Error(resultError.message);
            setMatches((current) => current.map((row) => row.id === match.id ? { ...row, rose_city_score: homeScore, opponent_score: awayScore } : row));
            flash(match.id);
          }} />}
      </ShimmerRegion>

      <AdminDialog open={panelOpen} onClose={requestClose}
        finalFocus={() => editorOpener.current?.isConnected ? editorOpener.current : searchInput.current} size="md" busy={visibleSaveState === "saving" || uploadCount > 0}
        title={editingId ? "Edit match" : "Add match"}
        eyebrow={editingId ? `${editForm.home ? "vs" : "@"} ${editForm.opponent || "Opponent"}` : "Schedule"}
        footer={<AdminDialogFooter
          status={error ? <p role="alert" className="text-sm text-destructive">{error}</p> : dirty ? "Unsaved changes" : null}
          destructive={editingId ? <Button variant="outline" className="min-h-11 text-destructive" disabled={saving || uploadCount > 0} onClick={() => { setError(null); setConfirmDeleteOpen(true); }}>Delete match</Button> : null}
          primary={<AdminSaveButton className="!min-h-11" state={uploadCount > 0 ? "clean" : visibleSaveState} onSave={() => { void saveAction.save().catch(() => {}); }} />}
        ><Button variant="outline" className="min-h-11" onClick={requestClose} disabled={saving || uploadCount > 0}>Cancel</Button></AdminDialogFooter>}>
        <fieldset disabled={visibleSaveState === "saving"}>
        <MatchForm form={panelForm} onChange={panelOnChange} seasons={seasons} cleanupDraftUploads={!editingId && !createdMatchId}
          onMediaActivity={mediaActivity}
          onUploadBusyChange={uploadBusyChange} />
        </fieldset>
      </AdminDialog>
      <AdminConfirmDialog open={confirmDeleteOpen && editingId !== null}
        finalFocus={() => panelOpen ? true : searchInput.current} title="Delete this match?" destructive
        confirmLabel={deletingId ? "Deleting…" : "Delete match"} busy={Boolean(deletingId)}
        onCancel={() => { if (!deletingId) setConfirmDeleteOpen(false); }}
        onConfirm={() => { if (editingId && !deletingId) void handleDelete(editingId); }}>
        <p>{editForm.home ? "vs" : "@"} {editForm.opponent || "Opponent"}{editForm.date ? ` · ${formatShortDate(editForm.date)}` : ""}</p>
        <p className="mt-3">This removes the match from your schedule and deletes the player stats entered for it on the Stats page. Season totals you typed yourself are not changed. This cannot be undone.</p>
        {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
      </AdminConfirmDialog>
    </AdminPage>
  );
}
