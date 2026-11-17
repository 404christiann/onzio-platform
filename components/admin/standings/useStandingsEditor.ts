"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/admin-client";
import { fetchLeagueStandings, fetchSeasons } from "@/lib/queries";
import { DEFAULT_STANDINGS_SETTINGS } from "@/lib/standings-content";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { logoUrlsNoLongerUsed } from "@/lib/standings-logo-cleanup";
import {
  insertedRowsMatch, prepareStandingsCommand, reconcileStandingsDraft, standingsDraftKey,
  type StandingsCommand, type StandingsDraft,
} from "@/lib/admin-standings-draft";
import type { DBSeason } from "@/lib/db-types";
import { useSaveState } from "@/components/admin/ui/useSaveState";

const emptyDraft = (): StandingsDraft => ({ settings: { ...DEFAULT_STANDINGS_SETTINGS }, rows: [] });
const message = (error: unknown) => error instanceof Error ? error.message : "Standings could not be saved.";

export function useStandingsEditor(clubId: string) {
  const [draft, setDraft] = useState<StandingsDraft>(emptyDraft);
  const current = useRef(draft);
  const [original, setOriginal] = useState<StandingsDraft>(emptyDraft);
  const baseline = useRef(original);
  const [seasons, setSeasons] = useState<DBSeason[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const season = useRef(seasonId);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const command = useRef<StandingsCommand | null>(null);
  const recovering = useRef<StandingsCommand | null>(null);
  const dropped = useRef(new Set<string>());
  const owned = useRef(new Set<string>());
  const inFlight = useRef(false);
  const loadBusy = useRef(false);
  const mounted = useRef(true);
  const [mediaPending, setMediaPending] = useState(false);
  const mediaBusy = useRef(false);
  const fieldMediaPending = useRef(false);
  const mediaTransfers = useRef(0);

  function change(next: StandingsDraft | ((draft: StandingsDraft) => StandingsDraft)) {
    const value = typeof next === "function" ? next(current.current) : next;
    current.current = value;
    setDraft(value);
  }
  function confirm(value: StandingsDraft) {
    baseline.current = value;
    setOriginal(value);
  }
  function replace(value: StandingsDraft) {
    confirm(value);
    change(structuredClone(value));
    dropped.current.clear();
    command.current = null;
    recovering.current = null;
    setPending(false);
  }
  function retainLogo(url: string | null) { if (url) dropped.current.add(url); }
  function syncMediaPending() {
    const value = fieldMediaPending.current || mediaTransfers.current > 0;
    mediaBusy.current = value;
    if (mounted.current) setMediaPending(value);
  }
  function pendingMedia(value: boolean) {
    fieldMediaPending.current = value;
    syncMediaPending();
  }

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setError(null);
    void (async () => {
      try {
        const list = await fetchSeasons(clubId);
        const id = (list.find((item) => item.active) ?? list[0])?.id ?? null;
        const content = await fetchLeagueStandings(clubId, { strict: true, seasonId: id ?? undefined });
        if (cancelled) return;
        setSeasons(list);
        season.current = id;
        setSeasonId(id);
        replace({ ...content, rows: content.rows.map((row) => ({ ...row, isNew: row.id.startsWith("default-") })) });
      } catch (failure) {
        if (!cancelled) { setLoadFailed(true); setError(message(failure)); }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; mounted.current = false; };
    // A tenant mount owns this controller. Season changes use the guarded load below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  async function read(id: string | null) {
    if (loadBusy.current || inFlight.current || mediaBusy.current) return false;
    loadBusy.current = true;
    setLoading(true);
    setError(null);
    try {
      let list = seasons;
      if (!list.length) {
        list = await fetchSeasons(clubId);
        setSeasons(list);
        id = (list.find((item) => item.active) ?? list[0])?.id ?? null;
      }
      // Keep the attempted season as the retry target even when its read fails.
      // Editing stays gated until that target has loaded successfully.
      season.current = id;
      setSeasonId(id);
      const fresh = await fetchLeagueStandings(clubId, { strict: true, seasonId: id ?? undefined });
      if (!mounted.current) return false;
      if (recovering.current) {
        const completed = recovering.current;
        confirm(fresh);
        change(reconcileStandingsDraft(current.current, completed, fresh));
        recovering.current = null;
        command.current = null;
        setPending(false);
      } else replace({ ...fresh, rows: fresh.rows.map((row) => ({ ...row, isNew: row.id.startsWith("default-") })) });
      season.current = id;
      setSeasonId(id);
      setLoadFailed(false);
      return true;
    } catch (failure) { setLoadFailed(true); setError(message(failure)); return false; }
    finally { loadBusy.current = false; if (mounted.current) setLoading(false); }
  }

  const isDirty = standingsDraftKey(draft) !== standingsDraftKey(original) || pending;
  async function persist() {
    if (inFlight.current || loadBusy.current || loading || loadFailed || mediaBusy.current) throw new Error("Wait for the table and logo to finish loading.");
    if (!season.current) throw new Error("Add a season on the Seasons page before adding a league table.");
    inFlight.current = true;
    setError(null);
    try {
      const request = command.current ?? prepareStandingsCommand(current.current, baseline.current, season.current, [...dropped.current]);
      command.current = request;
      setPending(true);
      const client = createClient();
      while (request.cursor < request.steps.length) {
        const step = request.steps[request.cursor];
        if (step.operation === "insert" && request.uncertain) {
          const confirmation = await client.from("league_standings").select("*").in("id", (step.payload ?? []).map((row) => row.id));
          if (confirmation.error || !Array.isArray(confirmation.data)) throw new Error("The last save could not be confirmed. Retry before saving another version.");
          const result = insertedRowsMatch(step, confirmation.data, clubId);
          if (result === "conflict") throw new Error("The last save returned different team details. Reload the page before changing this table.");
          if (result === "confirmed") { request.cursor++; request.uncertain = false; continue; }
        }
        request.uncertain = true;
        const query = client.from(step.table);
        const result = step.operation === "delete"
          ? await query.delete().in("id", step.ids ?? [])
          : step.operation === "insert" ? await query.insert(step.payload) : await query.upsert(step.payload);
        if (result.error) {
          if (step.operation === "insert") {
            // A prior same-ID request can commit after an empty confirmation read.
            // A uniqueness response is not success until the exact submitted rows agree.
            const check = await client.from("league_standings").select("*").in("id", (step.payload ?? []).map((row) => row.id));
            if (!check.error && Array.isArray(check.data) && insertedRowsMatch(step, check.data, clubId) === "confirmed") {
              request.cursor++; request.uncertain = false; continue;
            }
          } else request.uncertain = false;
          throw new Error(result.error.message);
        }
        request.cursor++;
        request.uncertain = false;
      }
      // Cleanup remains after all data writes and reference checks, including other seasons.
      // A cleanup failure retains this command at its completed cursor, never replaying inserts.
      await deleteStorageUrls("standings", await logoUrlsNoLongerUsed(client, request.droppedLogos), ["teams/"]);
      for (const url of request.droppedLogos) dropped.current.delete(url);
      const nowUsed = new Set(request.confirmed.rows.map((row) => row.logo_url));
      for (const url of nowUsed) if (url) owned.current.delete(url);
      confirm(request.confirmed);
      change(reconcileStandingsDraft(current.current, request, request.confirmed));
      try {
        const fresh = await fetchLeagueStandings(clubId, { strict: true, seasonId: season.current ?? undefined });
        confirm(fresh);
        change(reconcileStandingsDraft(current.current, { ...request, submitted: request.confirmed }, fresh));
        command.current = null;
        setPending(false);
      } catch {
        recovering.current = { ...request, submitted: request.confirmed };
        setLoadFailed(true);
        throw new Error("Your standings were saved, but the latest table could not be loaded. Retry loading before editing.");
      }
    } finally { inFlight.current = false; }
  }
  const save = useSaveState({ isDirty, onSave: persist });
  const latestSave = useRef(save);
  latestSave.current = save;

  async function saveCurrent() {
    if (latestSave.current.state === "saving" || mediaBusy.current || inFlight.current || loadBusy.current || loading || loadFailed) return false;
    if (!command.current && standingsDraftKey(current.current) === standingsDraftKey(baseline.current)) return true;
    try {
      if (latestSave.current.state !== "dirty") await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await latestSave.current.save();
      return !command.current && !recovering.current && standingsDraftKey(current.current) === standingsDraftKey(baseline.current);
    } catch (failure) { setError(message(failure)); return false; }
  }

  async function saveGuardCurrent() {
    // The guard owns its pending display. A failed header request can have
    // finished while its minimum Saving display still runs.
    if (inFlight.current || loadBusy.current || mediaBusy.current || loading || loadFailed) return false;
    if (!command.current && standingsDraftKey(current.current) === standingsDraftKey(baseline.current)) return true;
    try {
      await persist();
      return !command.current && !recovering.current && standingsDraftKey(current.current) === standingsDraftKey(baseline.current);
    } catch (failure) { setError(message(failure)); return false; }
  }

  async function discard() {
    if (command.current || recovering.current || inFlight.current || mediaBusy.current || latestSave.current.state === "saving") {
      throw new Error("Confirm the last save and finish the logo upload before discarding changes.");
    }
    const urls = [...owned.current];
    await deleteStorageUrls("standings", await logoUrlsNoLongerUsed(createClient(), urls), ["teams/"]);
    owned.current.clear();
    change(structuredClone(baseline.current));
    dropped.current.clear();
    setError(null);
  }

  async function upload(file: File) {
    mediaTransfers.current++;
    syncMediaPending();
    try {
      const client = createClient();
      const extension = file.name.split(".").pop() ?? "png";
      const path = `teams/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      const result = await client.storage.from("standings").upload(path, file);
      if (result.error) throw new Error(result.error.message);
      const url = client.storage.from("standings").getPublicUrl(path).data.publicUrl;
      if (!url) throw new Error("The logo upload has not finished.");
      owned.current.add(url);
      return url;
    } finally {
      mediaTransfers.current--;
      syncMediaPending();
    }
  }

  async function releaseLogos(urls: readonly string[]) {
    const used = new Set([...current.current.rows, ...(command.current?.submitted.rows ?? [])].map((row) => row.logo_url));
    const unused = urls.filter((url) => owned.current.has(url) && !used.has(url));
    await deleteStorageUrls("standings", await logoUrlsNoLongerUsed(createClient(), unused), ["teams/"]);
    for (const url of unused) owned.current.delete(url);
  }

  return {
    draft, current, original, seasons, seasonId, loading, loadFailed, error, setError,
    isDirty, pending, mediaPending, pendingMedia, change, retainLogo, upload, releaseLogos,
    saveState: save.state, saveCurrent, saveGuardCurrent, isWorking: () => inFlight.current || loadBusy.current || mediaBusy.current, discard,
    retry: () => save.state === "saving" ? Promise.resolve(false) : read(season.current),
    switchSeason: (id: string) => read(id),
    canDiscard: !pending && !mediaPending && save.state !== "saving",
  };
}
