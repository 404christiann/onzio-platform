import type { FormState, Match } from "@/components/admin/schedule/schedule-model";
import { buildMatchWrite, isNewKey } from "./rose-city-schedule-model";

/**
 * The page Save for several matches. Each match is written with the same per-match call the classic page makes;
 * what this adds is a re-read before the first write (a match changed by someone else is a conflict) and a pending
 * request for a write that never answered (resent as it was, never duplicated). Pure: the database sits behind MatchesApi.
 */
export type SavedMatchRow = Match & { updated_at?: string };

export type MatchesApi = {
  /** Every match of the club, with updated_at (the same read the page loads with). */
  readAll(): Promise<{ rows: SavedMatchRow[]; error?: string }>;
  /** Resolves with an error for an answer that says no; REJECTS when no answer came back (the outcome is unknown). */
  update(id: string, write: ReturnType<typeof buildMatchWrite>): Promise<{ error?: string }>;
  insert(write: ReturnType<typeof buildMatchWrite>): Promise<{ id?: string; error?: string }>;
  /** Removes logos the saved match no longer uses. A failure here never fails the save. */
  cleanup(original: Match | undefined, form: FormState): Promise<void>;
};

/** A write that was sent and never answered. Kept exactly, with the match ids known when it was sent. */
export type PendingWrite = { form: FormState; before: string[] };

export type SaveOutcome =
  /** noAnswer: the re-read never answered, so nothing was sent and the same save can be sent again as it was. */
  | { kind: "unverified"; message: string; noAnswer: boolean }
  | { kind: "conflict"; keys: string[]; rows: SavedMatchRow[]; stamps: Record<string, string> }
  | { kind: "done"; saved: Array<{ key: string; id?: string; form: FormState }>; failed: Array<{ key: string; form: FormState; message: string }>; pending: Record<string, PendingWrite> };

const sameRow = (a: { season_id: string; date: string; time: string; opponent: string }, b: FormState) =>
  a.season_id === b.season_id && a.date === b.date && a.time.slice(0, 5) === b.time.slice(0, 5) && a.opponent === b.opponent;

export async function saveMatches(input: {
  /** Keys to write, in order. A key in `pending` is resent from its pending request, not from the draft. */
  keys: string[];
  drafts: Record<string, FormState>;
  pending: Record<string, PendingWrite>;
  /** updated_at of each saved match when the page loaded it. */
  stamps: Record<string, string>;
  originals: readonly Match[];
  api: MatchesApi;
}): Promise<SaveOutcome> {
  const { keys, drafts, pending, stamps, originals, api } = input;
  // Re-read before the first write. A pending write may already have landed, so it is not compared.
  const toCheck = keys.filter(key => !isNewKey(key) && !pending[key] && stamps[key] !== undefined);
  let fresh: { rows: SavedMatchRow[]; error?: string } = { rows: [] };
  if (toCheck.length || keys.some(key => pending[key] && isNewKey(key))) {
    try { fresh = await api.readAll(); }
    catch { return { kind: "unverified", noAnswer: true, message: "We could not reach the saved schedule, so nothing was saved yet. Retry sends the same save again; it will not add a match twice." }; }
    if (fresh.error) return { kind: "unverified", noAnswer: false, message: "The saved schedule could not be checked before saving, so nothing was sent. Try again." };
  }
  const conflicts = toCheck.filter(key => {
    const row = fresh.rows.find(item => item.id === key);
    return !row || row.updated_at !== stamps[key];
  });
  if (conflicts.length) {
    return { kind: "conflict", keys: conflicts, rows: fresh.rows, stamps: Object.fromEntries(fresh.rows.flatMap(row => row.updated_at ? [[row.id, row.updated_at]] : [])) };
  }

  const saved: Array<{ key: string; id?: string; form: FormState }> = [];
  const failed: Array<{ key: string; form: FormState; message: string }> = [];
  const stillPending: Record<string, PendingWrite> = {};
  for (const key of keys) {
    const resend = pending[key];
    const form = resend ? resend.form : drafts[key];
    const known = resend ? resend.before : originals.map(match => match.id);
    try {
      if (isNewKey(key)) {
        // A resent insert first looks for the row the lost request may have created.
        const created = resend ? fresh.rows.find(row => !resend.before.includes(row.id) && sameRow(row, form)) : undefined;
        if (created) { saved.push({ key, id: created.id, form }); continue; }
        let answer: { id?: string; error?: string };
        try { answer = await api.insert(buildMatchWrite(form)); }
        catch { stillPending[key] = { form, before: known }; continue; }
        if (answer.error) throw new Error(answer.error);
        saved.push({ key, id: answer.id, form });
      } else {
        let answer: { error?: string };
        try { answer = await api.update(key, buildMatchWrite(form)); }
        catch { stillPending[key] = { form, before: known }; continue; }
        if (answer.error) throw new Error(answer.error);
        await api.cleanup(originals.find(match => match.id === key), form).catch(() => undefined);
        saved.push({ key, form });
      }
    } catch (error) {
      failed.push({ key, form, message: error instanceof Error ? error.message : "The match could not be saved. Try again." });
    }
  }
  return { kind: "done", saved, failed, pending: stillPending };
}

/**
 * Load latest and keep my edits, per field: a field I changed (mine differs from what I loaded) stays mine;
 * every other field takes the fresh row, so the other person's change is kept.
 */
export function rebaseForm(loaded: FormState, mine: FormState, fresh: FormState): FormState {
  const next = { ...fresh } as Record<string, unknown>;
  for (const field of Object.keys(mine) as Array<keyof FormState>) {
    if (JSON.stringify(mine[field]) !== JSON.stringify(loaded[field])) next[field] = mine[field];
  }
  return next as FormState;
}

/** What an open draft started from: the saved match as it was when the draft was opened, and its updated_at. A reload never moves it. */
export type Anchor = { stamp?: string; baseline: FormState };

/** The updated_at each edited match is checked against: the one its draft opened with, never a later reload's. */
export function anchorStamps(keys: readonly string[], anchors: Record<string, Anchor>): Record<string, string> {
  return Object.fromEntries(keys.flatMap(key => { const stamp = anchors[key]?.stamp; return stamp ? [[key, stamp]] : []; }));
}

/**
 * After a quick result on a match that has an open draft. If the server still held the version the draft opened with
 * (`unchanged`), the draft's start takes the new score and the new updated_at, so the quick write is not read as someone
 * else's change. If the server had moved on, the start stays as it was and the page Save reports the conflict.
 */
export function anchorAfterQuick(anchor: Anchor, unchanged: boolean, stamp: string | undefined, home: number, away: number): Anchor {
  if (!unchanged || !stamp) return anchor;
  return { stamp, baseline: { ...anchor.baseline, rose_city_score: home, opponent_score: away } };
}
