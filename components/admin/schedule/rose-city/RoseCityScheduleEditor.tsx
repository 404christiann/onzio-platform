"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { IconSearch, IconAdd as IconPlus } from "@/components/admin/icons";
import SeasonSelect from "@/components/admin/SeasonSelect";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { ShimmerRegion, Shimmer } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { EditorNotice, EditorSecondaryButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import {
  EditorDialog, PageFrame, PageFrameSkeleton, derivePageSaveState, KIT_EDIT_PROPS, useEditorDialog,
  type PageSaveFailure,
} from "@/components/admin/ui/editor-kit";
import previewCards from "@/components/admin/ui/editor-kit/PreviewCards.module.css";
import { DISCARD_CONFIRM } from "@/components/admin/editor-copy";
import { createClient } from "@/lib/admin-client";
import type { EditTargetId } from "@/lib/admin-edit-targets";
import { clubToday } from "@/lib/club-time";
import { carrySponsorFromLatestMatch } from "@/lib/match-sponsor";
import { useSeasons } from "@/lib/use-seasons";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { nextScheduleFixture, orderedSchedule } from "@/lib/cinematic-schedule";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  deleteUnusedMatchImageUrls, emptyForm, hasResult, MAX_MATCH_SCORE, monthGroupKey, type FormState, type Match, type ResultFilter,
} from "@/components/admin/schedule/schedule-model";
import {
  MATCH_SECTIONS, NEW_KEY_PREFIX, buildMatchWrite, changedKeys, fixtureFromForm, formFromMatch, isNewKey, matchLabel,
  matchRowAfterSave, matchTitle, sameForm, summaryLine, validateMatchForm, type MatchSectionId,
} from "./rose-city-schedule-model";
import { RoseCityMatchFields } from "./RoseCityMatchFields";
import { anchorAfterQuick, anchorStamps, rebaseForm, saveMatches, type Anchor, type MatchesApi, type PendingWrite, type SavedMatchRow } from "./rose-city-schedule-save";
import { MatchLive, MatchThumb, fixturesSignature, THUMB_SIZE } from "./MatchPreview";
import { hideMatchFieldHover, matchFieldUnder, showMatchFieldHover } from "./match-card-hover";
import { matchSectionOf } from "./match-edit-targets";
import { matchPreviewFixtures } from "./match-preview-fixtures";
import styles from "./RoseCityScheduleEditor.module.css";

const COLUMNS = "id, date, time, opponent, opponent_short_name, opponent_logo_url, opponent_logo_asset_id, competition, league_logo_url, league_logo_asset_id, sponsor_name, sponsor_logo_url, sponsor_logo_asset_id, sponsor_link, home, venue, address, city, state, rose_city_score, opponent_score, replay_video_url, attendance, summary, season_id, updated_at";
const CRUMBS = [{ label: "Competition" }];
const DESCRIPTION = "Add matches, enter results, and set the stream, replay and Directions for each one. Save applies every match you edited.";
const FILTERS: Array<[ResultFilter, string]> = [["all", "All"], ["home", "Home"], ["away", "Away"], ["missing", "Needs result"]];

type Quick = { key: string; home: string; away: string; error: string | null; saving: boolean };
type Notice = { message: string; key?: string; tone: "error" | "info" };
type Conflict = { keys: string[]; rows: SavedMatchRow[]; stamps: Record<string, string> };

const byKickoff = (a: { form: FormState }, b: { form: FormState }) => {
  const keyA = `${a.form.date}T${a.form.time || "00:00"}`, keyB = `${b.form.date}T${b.form.time || "00:00"}`;
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
};

export default function RoseCityScheduleEditor() {
  const club = useClubContext();
  const { timeZone } = useAdminPortal();
  const today = clubToday(timeZone);
  const { seasons, selectedSeasonId, setSelectedSeasonId, loading: seasonsLoading } = useSeasons();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [loadError, setLoadError] = useState<string | null>(null);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null);
  // The page draft: one form per match edited in this session (a match id), plus matches not saved yet ("new:" keys).
  const [drafts, setDrafts] = useState<Record<string, FormState>>({});
  const [newBaselines, setNewBaselines] = useState<Record<string, FormState>>({});
  const newCounter = useRef(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const dialog = useEditorDialog<MatchSectionId>();
  const [failure, setFailure] = useState<PageSaveFailure | null>(null), [notice, setNotice] = useState<Notice | null>(null), [status, setStatus] = useState("");
  const [uploadCount, setUploadCount] = useState(0);
  const uploadRef = useRef(0);
  const [quick, setQuick] = useState<Quick | null>(null);
  const quickBusy = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null), [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResultFilter>("all"), [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null), addRef = useRef<HTMLButtonElement>(null);
  const matchesRef = useRef(matches);
  matchesRef.current = matches;
  const savingRef = useRef(false);
  // updated_at of each match as the page loaded it; the re-read before a save compares against it.
  const stamps = useRef<Record<string, string>>({});
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});
  const [conflict, setConflict] = useState<Conflict | null>(null);
  // Writes that were sent and never answered. Resent exactly as they were by Retry.
  const [pending, setPending] = useState<Record<string, PendingWrite>>({});
  const keepRef = useRef<HTMLButtonElement>(null);
  // The re-read before a save never answered: nothing was sent, and Retry runs the same save again.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const locked = Object.keys(pending).length > 0 || unconfirmed;

  async function load(): Promise<SavedMatchRow[] | null> {
    try {
      const { data, error } = await createClient().from("matches").select(COLUMNS).order("date").order("time");
      if (error) { setLoadError(error.message); return null; }
      const rows = (data ?? []) as SavedMatchRow[];
      stamps.current = Object.fromEntries(rows.flatMap(row => row.updated_at ? [[row.id, row.updated_at]] : []));
      setMatches(rows);
      setReady(true); setLoadError(null);
      return rows;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load schedule");
      return null;
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    let active = true;
    fetchCinematicHomepageContent(club.id).then(content => { if (active) setShared(content); }).catch(() => undefined);
    return () => { active = false; };
  }, [club.id]);

  const baselines = useMemo(() => Object.fromEntries(matches.map(match => [match.id, formFromMatch(match)])), [matches]);
  const allBaselines = useMemo(() => ({ ...baselines, ...newBaselines }), [baselines, newBaselines]);
  const newKeys = useMemo(() => Object.keys(newBaselines), [newBaselines]);
  const order = useMemo(() => [...matches.map(match => match.id), ...newKeys], [matches, newKeys]);
  // A draft is dirty against what it started from, not against the latest reload.
  const draftBaselines = useMemo(() => Object.fromEntries(Object.keys(drafts).flatMap(key => { const base = anchors[key]?.baseline ?? allBaselines[key]; return base ? [[key, base]] : []; })), [drafts, anchors, allBaselines]);
  const dirtyKeys = useMemo(() => changedKeys(order, drafts, draftBaselines), [order, drafts, draftBaselines]);
  const unsaved = dirtyKeys.length > 0;
  const formOf = useCallback((key: string): FormState | undefined => drafts[key] ?? allBaselines[key], [drafts, allBaselines]);

  const carrySponsor = useCallback((seasonId: string) => carrySponsorFromLatestMatch(matches, seasonId), [matches]);

  // ── the match dialog ───────────────────────────────────────────────

  /** `target` is the field clicked in the card's preview: its section opens with that field focused. Edit and the keyboard pass none. */
  function openMatch(key: string, event?: React.MouseEvent<HTMLElement>, target?: EditTargetId) {
    setEditingKey(key);
    if (!drafts[key] && allBaselines[key]) {
      setDrafts(current => ({ ...current, [key]: structuredClone(allBaselines[key]) }));
      setAnchors(current => ({ ...current, [key]: { stamp: stamps.current[key], baseline: structuredClone(allBaselines[key]) } }));
    }
    dialog.openSection(matchSectionOf(target) ?? "match", event);
    dialog.focusField(target);
  }
  function openNew(event: React.MouseEvent<HTMLElement>) {
    const key = `${NEW_KEY_PREFIX}${++newCounter.current}`;
    const form = { ...emptyForm(selectedSeasonId), ...carrySponsor(selectedSeasonId) };
    setNewBaselines(current => ({ ...current, [key]: form }));
    setDrafts(current => ({ ...current, [key]: structuredClone(form) }));
    setAnchors(current => ({ ...current, [key]: { baseline: structuredClone(form) } }));
    setEditingKey(key);
    dialog.openSection("match", event);
  }
  const closeDialog = useCallback(() => {
    dialog.close();
    // A match that was only opened leaves no draft behind. Not while an upload is still landing in it.
    if (uploadRef.current > 0 || !editingKey) return;
    const key = editingKey;
    const form = drafts[key];
    const start = anchors[key]?.baseline ?? allBaselines[key];
    if (form && start && sameForm(form, start)) {
      setDrafts(current => { const { [key]: _drop, ...rest } = current; return rest; });
      setAnchors(current => { const { [key]: _drop, ...rest } = current; return rest; });
      if (isNewKey(key)) setNewBaselines(current => { const { [key]: _drop, ...rest } = current; return rest; });
    }
  }, [dialog, editingKey, drafts, anchors, allBaselines]);

  const formChange = useCallback((key: string): Dispatch<SetStateAction<FormState>> => update => {
    setDrafts(current => {
      const base = current[key] ?? allBaselines[key];
      if (!base) return current;
      const next = typeof update === "function" ? update(base) : update;
      return { ...current, [key]: next };
    });
    // An edit clears an old "not saved" message. A conflict or an unconfirmed save stays until it is resolved.
    if (failure === null || failure === "error") { setFailure(null); setNotice(null); }
  }, [allBaselines, failure]);
  function uploadBusy(delta: number) { uploadRef.current = Math.max(0, uploadRef.current + delta); setUploadCount(uploadRef.current); }

  // ── save: every edited match, each through the same per-match call the classic page makes ──

  const api: MatchesApi = {
    async readAll() {
      const { data, error } = await createClient().from("matches").select(COLUMNS).order("date").order("time");
      return { rows: (data ?? []) as SavedMatchRow[], error: error?.message };
    },
    async update(id, write) {
      const { error } = await createClient().from("matches").update(write).eq("id", id);
      return { error: error?.message };
    },
    async insert(write) {
      const { data, error } = await createClient().from("matches").insert([write]);
      return { id: Array.isArray(data) ? data[0]?.id : undefined, error: error?.message };
    },
    async cleanup(original, form) {
      await deleteUnusedMatchImageUrls({ bucket: "opponent-logos", urls: [original?.opponent_logo_url !== form.opponent_logo_url ? original?.opponent_logo_url : null], column: "opponent_logo_url", allowedPrefixes: ["match-opponents/"] });
      await deleteUnusedMatchImageUrls({ bucket: "sponsors", urls: [original?.sponsor_logo_url !== form.sponsor_logo_url ? original?.sponsor_logo_url : null], column: "sponsor_logo_url", allowedPrefixes: ["match-sponsors/"] });
      await deleteUnusedMatchImageUrls({ bucket: "league-logos", urls: [original?.league_logo_url !== form.league_logo_url ? original?.league_logo_url : null], column: "league_logo_url", allowedPrefixes: ["match-leagues/"] });
    },
  };

  async function saveAll(): Promise<boolean> {
    if (savingRef.current || uploadRef.current > 0) return false;
    const keys = [...new Set([...dirtyKeys, ...Object.keys(pending)])];
    if (!keys.length) return true;
    // Validate every match before anything is sent, so one mistake never leaves the page half saved. A pending request was valid when sent.
    for (const key of keys) {
      if (pending[key]) continue;
      const problem = validateMatchForm(drafts[key]);
      if (problem) {
        setFailure("error"); setNotice({ tone: "error", key, message: `${matchLabel(drafts[key])} was not saved. ${problem}` });
        return false;
      }
    }
    savingRef.current = true;
    setFailure(null); setNotice(null); setConflict(null); setUnconfirmed(false); setStatus("Saving the schedule…");
    let outcome;
    try { outcome = await saveMatches({ keys, drafts, pending, stamps: anchorStamps(keys, anchors), originals: matchesRef.current, api }); }
    finally { savingRef.current = false; }
    if (outcome.kind === "unverified") {
      setUnconfirmed(outcome.noAnswer);
      setFailure(outcome.noAnswer ? "retry" : "error"); setNotice({ tone: "error", message: outcome.message }); setStatus("The schedule was not saved.");
      return false;
    }
    if (outcome.kind === "conflict") {
      setConflict({ keys: outcome.keys, rows: outcome.rows, stamps: outcome.stamps });
      const first = outcome.keys[0], row = outcome.rows.find(item => item.id === first);
      const label = matchLabel(drafts[first]);
      setFailure("conflict");
      setNotice({ tone: "error", key: first, message: `${label} ${row ? "was changed by someone else while you were editing" : "was deleted by someone else while you were editing"}. Nothing was saved.${outcome.keys.length > 1 ? ` ${outcome.keys.length - 1} more ${outcome.keys.length === 2 ? "match was" : "matches were"} changed too.` : ""}` });
      setStatus("The schedule changed elsewhere. Choose how to resolve it.");
      return false;
    }
    const { saved, failed, pending: unknown } = outcome;
    setPending(unknown);
    if (saved.length) {
      // Show the saved values at once; the reload then confirms them.
      setMatches(current => {
        const next = current.map(match => { const hit = saved.find(item => item.key === match.id); return hit ? matchRowAfterSave(match.id, hit.form) : match; });
        for (const item of saved) if (isNewKey(item.key) && item.id && !next.some(match => match.id === item.id)) next.push(matchRowAfterSave(item.id, item.form));
        return next;
      });
      setDrafts(current => { const next = { ...current }; for (const item of saved) delete next[item.key]; return next; });
      setAnchors(current => { const next = { ...current }; for (const item of saved) delete next[item.key]; return next; });
      setNewBaselines(current => { const next = { ...current }; for (const item of saved) delete next[item.key]; return next; });
      if (editingKey && saved.some(item => item.key === editingKey)) setEditingKey(null);
    }
    const reloaded = saved.length ? (await load()) !== null : true;
    const waiting = Object.keys(unknown);
    if (waiting.length) {
      const form = unknown[waiting[0]].form;
      setFailure("retry");
      setNotice({ tone: "error", key: waiting[0], message: `We could not confirm that ${matchLabel(form)} was saved. Retry sends the same save again; it will not add the match twice.${saved.length ? ` ${saved.length === 1 ? "1 other match was saved." : `${saved.length} other matches were saved.`}` : ""}` });
      setStatus("A save needs confirmation. Retry same save is available.");
      return false;
    }
    if (failed.length) {
      const first = failed[0];
      setFailure("error");
      setNotice({ tone: "error", key: first.key, message: `${matchLabel(first.form)} was not saved: ${first.message}${saved.length ? ` ${saved.length === 1 ? "1 other match was saved." : `${saved.length} other matches were saved.`}` : ""}${failed.length > 1 ? ` ${failed.length - 1} more ${failed.length === 2 ? "match" : "matches"} also failed.` : ""}` });
      setStatus("The schedule was not fully saved.");
      return false;
    }
    if (!reloaded) setNotice({ tone: "info", message: "Saved. The list could not be refreshed, so reload the page to see it again." });
    setStatus(saved.length === 1 ? "Match saved." : `${saved.length} matches saved.`);
    return true;
  }

  /** Load latest and keep my edits: the other person's fields stay, and only the fields I changed are applied on top. */
  function keepMyEdits() {
    if (!conflict) return;
    const freshForms = Object.fromEntries(conflict.rows.map(row => [row.id, formFromMatch(row)]));
    setDrafts(current => {
      const next = { ...current };
      for (const key of conflict.keys) {
        const fresh = freshForms[key], mine = current[key], loaded = anchors[key]?.baseline ?? allBaselines[key];
        if (!fresh) delete next[key];
        else if (mine && loaded) next[key] = rebaseForm(loaded, mine, fresh);
      }
      return next;
    });
    stamps.current = conflict.stamps;
    // A conflicted draft now starts from the fresh row; a draft that did not conflict keeps its own start.
    setAnchors(current => {
      const next = { ...current };
      for (const key of conflict.keys) { if (freshForms[key]) next[key] = { stamp: conflict.stamps[key], baseline: freshForms[key] }; else delete next[key]; }
      return next;
    });
    setMatches(conflict.rows);
    setConflict(null); setFailure(null);
    const gone = conflict.keys.filter(key => !freshForms[key]).length;
    setNotice({ tone: "info", message: `Latest saved version loaded. Your edits were kept.${gone ? ` ${gone === 1 ? "1 match was deleted elsewhere, so your edits to it were dropped." : `${gone} matches were deleted elsewhere, so your edits to them were dropped.`}` : ""}` });
    setStatus("Latest saved version loaded. Your edits were kept.");
  }
  const latestSave = useRef(saveAll);
  latestSave.current = saveAll;
  const saveAction = useSaveState({
    isDirty: unsaved,
    onSave: async () => { if (!(await latestSave.current())) throw new Error("The schedule was not saved."); },
  });
  const baseState = uploadCount > 0 && saveAction.state === "dirty" ? "clean" : saveAction.state;
  const pageState = derivePageSaveState(baseState, failure);

  function discardAll() {
    setDrafts({}); setAnchors({}); setNewBaselines({}); setEditingKey(null); setFailure(null); setNotice(null); setQuick(null); setConflict(null); setPending({}); setUnconfirmed(false);
    void load();
  }
  /** Discard asks first; while a save is unconfirmed it waits, so the retry is never lost. */
  function requestDiscard() {
    if (locked) { setNotice({ tone: "error", message: "Retry the same save before discarding your edits, so nothing is lost." }); return; }
    setConfirmDiscard(true);
  }
  useUnsavedGuard({
    dirty: unsaved || uploadCount > 0, edited: "the schedule", onSave: () => latestSave.current(),
    onDiscard: () => { if (locked) throw new Error("A save is still being confirmed."); discardAll(); },
  });
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // ── the quick result (unchanged: its own immediate save) ───────────

  async function saveQuick(key: string) {
    if (!quick || quick.key !== key || quickBusy.current) return;
    const home = Number(quick.home), away = Number(quick.away);
    if (quick.home.trim() === "" || quick.away.trim() === "" || ![home, away].every(score => Number.isInteger(score) && score >= 0 && score <= MAX_MATCH_SCORE)) {
      setQuick({ ...quick, error: "Enter both scores, using whole numbers from 0 to 99." });
      return;
    }
    quickBusy.current = true;
    setQuick({ ...quick, saving: true, error: null });
    try {
      // An edit open on this match started from a saved version. If the server has moved on since, it stays stale, so the page Save reports the conflict.
      const anchor = anchors[key];
      let unchanged = false;
      if (anchor?.stamp) {
        const seen = await api.readAll().catch(() => null);
        unchanged = seen?.rows.find(row => row.id === key)?.updated_at === anchor.stamp;
      }
      const { error } = await createClient().from("matches").update({ rose_city_score: home, opponent_score: away }).eq("id", key);
      if (error) throw new Error(error.message);
      setMatches(current => current.map(row => row.id === key ? { ...row, rose_city_score: home, opponent_score: away } : row));
      // An edit already open on this match keeps its other changes and takes the saved score.
      setDrafts(current => current[key] ? { ...current, [key]: { ...current[key], rose_city_score: home, opponent_score: away } } : current);
      setQuick(null); setStatus("Result saved.");
      // Only this match's own start takes its new score and updated_at; every other open draft keeps the stamp and baseline it opened with.
      void load().then(rows => {
        const stamp = rows?.find(row => row.id === key)?.updated_at;
        if (anchor) setAnchors(current => current[key] ? { ...current, [key]: anchorAfterQuick(current[key], unchanged, stamp, home, away) } : current);
      });
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-match-edit="${CSS.escape(key)}"]`)?.focus());
    } catch (error) {
      setQuick(current => current && { ...current, saving: false, error: error instanceof Error ? error.message : "The result could not be saved. Try again." });
    } finally { quickBusy.current = false; }
  }

  // ── delete (unchanged: immediate, confirmed) ───────────────────────

  async function confirmDelete() {
    const key = deleteKey;
    if (!key || deleting) return;
    setDeleting(true); setDeleteError(null);
    try {
      if (isNewKey(key)) {
        setNewBaselines(current => { const { [key]: _drop, ...rest } = current; return rest; });
      } else {
        const { error } = await createClient().from("matches").delete().eq("id", key);
        if (error) { setDeleteError(error.message); return; }
        setMatches(current => current.filter(match => match.id !== key));
      }
      setDrafts(current => { const { [key]: _drop, ...rest } = current; return rest; });
      setAnchors(current => { const { [key]: _drop, ...rest } = current; return rest; });
      setEditingKey(null); setDeleteKey(null); setStatus("Match deleted.");
    } catch { setDeleteError("This match could not be deleted. Check the connection and try again."); }
    finally { setDeleting(false); }
  }

  // ── the list ───────────────────────────────────────────────────────

  const seasonItems = useMemo(() => order.flatMap(key => {
    const form = drafts[key] ?? allBaselines[key];
    return form && form.season_id === selectedSeasonId ? [{ key, form, isNew: isNewKey(key) }] : [];
  }).sort(byKickoff), [order, drafts, allBaselines, selectedSeasonId]);
  const needsResult = useCallback((form: FormState) => form.date < today && !hasResult(form), [today]);
  const counts = useMemo(() => ({
    all: seasonItems.length, home: seasonItems.filter(item => item.form.home).length, away: seasonItems.filter(item => !item.form.home).length,
    missing: seasonItems.filter(item => needsResult(item.form)).length,
  }), [seasonItems, needsResult]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return seasonItems.filter(({ form }) => {
      if (filter === "home" && !form.home) return false;
      if (filter === "away" && form.home) return false;
      if (filter === "missing" && !needsResult(form)) return false;
      return !q || `${form.opponent} ${form.venue} ${form.competition ?? ""}`.toLowerCase().includes(q);
    });
  }, [seasonItems, filter, query, needsResult]);
  const months = useMemo(() => {
    const groups = new Map<string, typeof shown>();
    for (const item of shown) { const key = monthGroupKey(item.form.date); (groups.get(key) ?? groups.set(key, []).get(key)!).push(item); }
    return Array.from(groups.entries());
  }, [shown]);
  // The public page marks one row "Next". A preview shows that styling only on the match that really is next.
  const deferredItems = useDeferredValue(seasonItems);
  const nextFixture = useMemo(() => nextScheduleFixture(deferredItems.map(item => fixtureFromForm(item.key, item.form)), new Date(), timeZone), [deferredItems, timeZone]);

  const active = editingKey ? formOf(editingKey) : undefined;
  const activeFixtures = useMemo(() => {
    if (!editingKey || !active) return [];
    return matchPreviewFixtures(fixtureFromForm(editingKey, active), nextFixture, timeZone).fixtures;
  }, [editingKey, active, nextFixture, timeZone]);
  const dialogFixtures = useDeferredValue(activeFixtures);

  if (loadError && !ready) return <PageFrame title="Schedule" breadcrumb={CRUMBS} description={DESCRIPTION}>
    <EditorNotice failed>{loadError}</EditorNotice>
    <div><EditorSecondaryButton onClick={() => location.reload()}>Try again</EditorSecondaryButton></div>
  </PageFrame>;

  const sectionList = MATCH_SECTIONS.map(section => ({
    id: section.id, title: section.title,
    summary: section.id === "result" && active ? (hasResult(active) ? `${active.rose_city_score} – ${active.opponent_score}` : "No result yet")
      : section.id === "summary" && active ? (summaryLine(active) ?? "Nothing added")
      : section.id === "sponsor" && active ? (active.sponsor_name || "No sponsor")
      : section.id === "match" && active ? matchTitle(active) : undefined,
  }));
  const saving = pageState === "saving";
  const noticeNode = notice ? <div className={styles.notice} data-schedule-notice="">
    <EditorNotice failed={notice.tone === "error"}>
      {notice.message}
      {conflict ? <span className={styles.noticeActions}>
        <button ref={keepRef} type="button" className="admin-press" disabled={saving} onClick={keepMyEdits} style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))" }}>Load latest and keep my edits</button>
        <EditorSecondaryButton disabled={saving} onClick={requestDiscard}>Reload saved page</EditorSecondaryButton>
      </span> : notice.key && <span className={styles.noticeActions}>
        <EditorSecondaryButton disabled={saving} onClick={() => openMatch(notice.key!)}>Open this match</EditorSecondaryButton>
      </span>}
    </EditorNotice>
  </div> : null;

  return <>
    <ShimmerRegion loading={loading || seasonsLoading} loadingLabel="Loading schedule…" minHeight={480} skeleton={<ScheduleSkeleton />}>
      <PageFrame title="Schedule" breadcrumb={CRUMBS} openPageHref="/schedule" description={DESCRIPTION} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onRetry={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()}
        onDiscard={requestDiscard} notice={noticeNode}>
        <div className={styles.toolbar} data-schedule-toolbar="">
          <SeasonSelect seasons={seasons} loading={seasonsLoading} value={selectedSeasonId} onChange={setSelectedSeasonId} label="View season" className="h-11" disabled={saving} />
          <div className={styles.search}>
            <IconSearch size={16} className={styles.searchIcon} aria-hidden="true" />
            <input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search opponent, venue or competition…"
              aria-label="Search matches by opponent, venue or competition" className={cn(ADMIN_INPUT_CLASS, "min-h-11 pl-9")} />
          </div>
          <div role="group" aria-label="Filter matches" className={styles.filters}>
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" className={`admin-press ${styles.filter}`} aria-pressed={filter === value} data-schedule-filter={value} onClick={() => setFilter(value)}>
                {label} <b>{counts[value]}</b>
              </button>
            ))}
          </div>
          <Button ref={addRef} type="button" className={`${styles.addButton} min-h-11 rounded-xl px-5`} disabled={!ready || !selectedSeasonId || saving || locked} onClick={openNew}>
            <IconPlus size={16} aria-hidden="true" /> Add match
          </Button>
        </div>
        {months.length === 0 ? (
          <div className={styles.empty} data-schedule-empty="">
            <p><strong>{seasonItems.length === 0 ? "No matches yet" : filter === "missing" && !query.trim() ? "No matches need a result" : "No matches match your search and filters"}</strong></p>
            <p className={styles.emptyHint}>{seasonItems.length === 0 ? "Add the first match of the season to get started." : filter === "missing" && !query.trim() ? "Every played match already has a result." : "Try a different search term or filter."}</p>
          </div>
        ) : (
          <div className={styles.months}>
            {months.map(([month, items]) => (
              <section key={month} className={styles.month} aria-label={month}>
                <header className={styles.monthHead}><h2>{month}</h2><span>{items.length} {items.length === 1 ? "match" : "matches"}</span></header>
                <ul className={styles.grid} data-match-cards="">
                  {items.map(({ key, form, isNew }) => {
                    const { fixtures: row, listed } = matchPreviewFixtures(fixtureFromForm(key, form), nextFixture, timeZone);
                    const changed = dirtyKeys.includes(key);
                    const label = `Edit match against ${form.opponent.trim() || "Opponent"}`;
                    const needs = needsResult(form) && !isNew;
                    const isQuick = quick?.key === key;
                    const outcome = hasResult(form) ? form.rose_city_score! > form.opponent_score! ? "W" : form.rose_city_score! < form.opponent_score! ? "L" : "D" : null;
                    return (
                      <li key={key} className={`${previewCards.card} ${styles.card}`} data-match-card={key}>
                        <div className={previewCards.previewWrap}>
                          <MatchThumb ownId={key} fixtures={row} timeZone={timeZone} shared={shared} signature={fixturesSignature(row)}
                            urls={[form.opponent_logo_url, form.league_logo_url, form.sponsor_logo_url].filter((url): url is string => Boolean(url))} />
                          <button type="button" className={`admin-press ${previewCards.previewButton}`} aria-label={label} tabIndex={-1}
                            // A pointer click opens the field under the pointer; Enter or Space (detail 0) opens the match, as before.
                            onClick={event => openMatch(key, event, event.detail > 0 ? matchFieldUnder(event.currentTarget, key, event.clientX, event.clientY)?.id : undefined)}
                            onPointerMove={event => { if (event.pointerType === "mouse") showMatchFieldHover(event.currentTarget, key, event.clientX, event.clientY); }}
                            onPointerLeave={event => hideMatchFieldHover(event.currentTarget)} {...KIT_EDIT_PROPS} />
                          <span className={previewCards.fieldHoverClip} data-field-hover-clip="" aria-hidden="true"><span className={previewCards.fieldHover} data-field-hover="" hidden /></span>
                        </div>
                        <div className={styles.foot}>
                          <div className={styles.footRow}>
                            <div className={styles.footText}>
                              <h3 className={styles.cardTitle}>
                                <span className={styles.cardTitleText}>{matchTitle(form, 60)}</span>
                                {changed && <span className={previewCards.dot} title="Unsaved edits" data-unsaved-dot=""><span className="sr-only"> (unsaved edits)</span></span>}
                              </h3>
                              <span className={styles.cardSub}>
                                {isNew ? <span className={`${styles.tag} ${styles.tagNew}`}>New match</span>
                                  : needs ? <span className={styles.tag}>Needs result</span>
                                  : outcome ? <span className={styles.score} data-outcome={outcome}><b>{outcome}</b>{form.rose_city_score} – {form.opponent_score}{summaryLine(form) ? ` · ${summaryLine(form)}` : ""}</span>
                                  : listed ? "Upcoming" : "Upcoming · on the site once it is next"}
                              </span>
                            </div>
                            <div className={styles.actions}>
                              {needs && !isQuick && (
                                <button type="button" className={`admin-press ${styles.smallButton}`} data-result-for={key} onClick={() => setQuick({ key, home: "", away: "", error: null, saving: false })}>Add result</button>
                              )}
                              <button type="button" className={`admin-press ${previewCards.edit}`} data-match-edit={key} aria-label={label} onClick={event => openMatch(key, event)} {...KIT_EDIT_PROPS}>Edit</button>
                            </div>
                          </div>
                          {isQuick && quick && (
                            <form className={styles.quick} aria-label={`Result against ${form.opponent}`} onSubmit={event => { event.preventDefault(); void saveQuick(key); }}
                              onKeyDown={event => { if (event.key === "Escape" && !quick.saving) { event.preventDefault(); event.stopPropagation(); setQuick(null); } }}>
                              <div className={styles.quickFields}>
                                <input autoFocus type="number" min={0} max={MAX_MATCH_SCORE} step={1} inputMode="numeric" aria-label={`${club.name} score against ${form.opponent}`} aria-invalid={Boolean(quick.error)} value={quick.home} disabled={quick.saving} onChange={event => setQuick({ ...quick, home: event.target.value, error: null })} />
                                <span aria-hidden="true">–</span>
                                <input type="number" min={0} max={MAX_MATCH_SCORE} step={1} inputMode="numeric" aria-label={`${form.opponent} score`} aria-invalid={Boolean(quick.error)} value={quick.away} disabled={quick.saving} onChange={event => setQuick({ ...quick, away: event.target.value, error: null })} />
                                <button type="submit" className={`admin-press ${styles.smallButton} ${styles.smallPrimary}`} disabled={quick.saving}>{quick.saving ? "Saving…" : "Save result"}</button>
                                <button type="button" className={`admin-press ${styles.smallButton} ${styles.smallGhost}`} disabled={quick.saving} onClick={() => setQuick(null)}>Cancel</button>
                              </div>
                              {quick.error && <p role="alert" className={styles.quickError}>{quick.error}</p>}
                            </form>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </PageFrame>
    </ShimmerRegion>
    <p className={styles.srOnly} role="status" data-schedule-status="">{status}</p>
    <EditorDialog open={dialog.open} onClose={closeDialog} mode="split" returnFocusRef={dialog.returnFocusRef} focusRequest={dialog.focusRequest}
      title={active ? (isNewKey(editingKey!) ? "New match" : `Edit ${matchTitle(active)}`) : "Edit match"}
      sections={sectionList} activeId={dialog.activeId} onActiveChange={id => dialog.switchTo(id as MatchSectionId)}
      previewHint="How this match looks on the Schedule"
      renderSection={id => dialog.open && editingKey && active ? (
        <fieldset className={styles.lock} disabled={saving || locked}>
          <RoseCityMatchFields key={editingKey} matchKey={editingKey} section={id as MatchSectionId} form={active} onChange={formChange(editingKey)} seasons={seasons} clubName={club.name}
            isNew={isNewKey(editingKey)} onUploadBusyChange={uploadBusy} onMediaActivity={() => { setFailure(current => current === "error" ? null : current); }}
            onDelete={() => { const key = editingKey; closeDialog(); setDeleteError(null); setDeleteKey(key); }} />
        </fieldset>
      ) : null}
      renderPreview={() => dialog.open && editingKey && dialogFixtures.length ? (
        <MatchLive ownId={editingKey} fixtures={dialogFixtures} timeZone={timeZone} shared={shared} host={club.primaryDomain ?? club.slug} />
      ) : null} />
    <AdminConfirmDialog open={confirmDiscard} destructive title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel}
      onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); discardAll(); }}>
      Discard unsaved Schedule edits and load the saved schedule?
    </AdminConfirmDialog>
    <AdminConfirmDialog open={deleteKey !== null} destructive title="Delete this match?" confirmLabel={deleting ? "Deleting…" : "Delete match"} busy={deleting}
      finalFocus={() => searchRef.current ?? true}
      onCancel={() => { if (!deleting) setDeleteKey(null); }} onConfirm={() => void confirmDelete()}>
      {(() => { const form = deleteKey ? formOf(deleteKey) : undefined; return form ? <p>{matchLabel(form)}</p> : null; })()}
      <p className="mt-3">This removes the match from your schedule and deletes the player stats entered for it on the Stats page. Season totals you typed yourself are not changed. This cannot be undone.</p>
      {deleteError && <p role="alert" className="mt-3 text-destructive">{deleteError}</p>}
    </AdminConfirmDialog>
  </>;
}

/** The loading shape: the page header, the toolbar, a month heading and four cards with the real box ratio and 64px footers. */
function ScheduleSkeleton() {
  const size = THUMB_SIZE.desktop;
  return (
    <div aria-hidden="true" data-schedule-skeleton="">
      <PageFrameSkeleton cardCount={0} description />
      <div className={styles.toolbarSkeleton}>
        <Shimmer style={{ display: "block", inlineSize: 160, blockSize: 44, borderRadius: 12 }} />
        <Shimmer style={{ display: "block", inlineSize: 280, blockSize: 44, borderRadius: 12 }} />
        <Shimmer style={{ display: "block", inlineSize: 300, blockSize: 44, borderRadius: 10 }} />
      </div>
      <div className={styles.months} style={{ marginBlockStart: 20 }}>
        <section className={styles.month}>
          <header className={styles.monthHead}><Shimmer style={{ display: "block", inlineSize: 120, blockSize: 20 }} /></header>
          <ul className={styles.grid}>
            {[0, 1, 2, 3].map(index => (
              <li key={index} className={`${previewCards.card} ${styles.card}`}>
                <div className={previewCards.previewWrap}>
                  <Shimmer className={`${previewCards.box} ${styles.thumb}`} style={{ "--thumb-ratio": `${size.width} / ${size.height}`, display: "block" } as React.CSSProperties} />
                </div>
                <div className={styles.foot}><div className={styles.footRow}>
                  <div className={styles.footText}>
                    <Shimmer style={{ display: "block", inlineSize: `${42 + index * 8}%`, blockSize: 16 }} />
                    <Shimmer style={{ display: "block", inlineSize: 90, blockSize: 14 }} />
                  </div>
                  <Shimmer style={{ display: "block", inlineSize: 56, blockSize: 32, borderRadius: 8 }} />
                </div></div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
