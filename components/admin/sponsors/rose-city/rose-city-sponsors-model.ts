import type { DBSiteSponsorLogo, SponsorLogoPlacement } from "@/lib/db-types";
import {
  MAX_CAROUSEL_SPONSORS,
  MAX_FOOTER_SPONSORS,
  normalizeSponsorWebsite,
  savedSponsorName,
  type SponsorDraft,
  type SponsorLogoDiff,
  type SponsorRowChanges,
} from "@/lib/sponsor-content";

/*
 * The Rose City Sponsors editor shows the homepage carousel only. The footer
 * placement is hidden from the page but its data is preserved: a row's footer
 * flag is never written, rows that show only in the footer (or nowhere) are
 * never part of the draft and are never written or deleted, and they still
 * count toward the 30 listed.
 *
 * (Older note:) The editor edits one list at once. These are pure
 * helpers: the draft is the club's visible sponsors in one list order, and a
 * place (homepage carousel or footer) shows the ones whose switch is on, in
 * that order. Sponsors that show nowhere ("resting" rows) are never part of the
 * draft and are never written.
 *
 * diffRoseCitySponsors is built so an edit the classic Sponsors page could make
 * (one place at a time, no website) produces exactly the writes
 * diffSponsorLogos produces for it. Only the website and a second place's
 * switch are new, and they are added to the same writes.
 */

/** Both places full and some sponsors resting; the same ceiling the one-list page uses. */
export const MAX_LISTED_SPONSORS = 30;

export const PLACES = ["carousel"] as const satisfies readonly SponsorLogoPlacement[];
export type Place = SponsorLogoPlacement;

export const PLACE_NOUN: Record<Place, string> = { carousel: "homepage carousel", footer: "footer" };
export const PLACE_CAP: Record<Place, number> = { carousel: MAX_CAROUSEL_SPONSORS, footer: MAX_FOOTER_SPONSORS };

const flag = (place: Place): "homepage" | "footer" => (place === "carousel" ? "homepage" : "footer");

/** The draft for a loaded list: every sponsor in the homepage carousel, in list order. */
export function draftsFromRows(rows: readonly DBSiteSponsorLogo[]): SponsorDraft[] {
  return rows.filter((row) => row.show_on_homepage).map((row) => ({
    key: row.id,
    id: row.id,
    name: row.name,
    logo_url: row.logo_url,
    website: row.website_url ?? "",
    homepage: row.show_on_homepage,
    footer: row.show_in_footer,
  }));
}

export function inPlace(drafts: readonly SponsorDraft[], place: Place): SponsorDraft[] {
  return drafts.filter((draft) => draft[flag(place)]);
}

export function placeCount(drafts: readonly SponsorDraft[], place: Place): number {
  return inPlace(drafts, place).length;
}

/** How many sponsors the club lists in all, including those resting. */
export function listedCount(rows: readonly DBSiteSponsorLogo[], drafts: readonly SponsorDraft[]): number {
  return drafts.length + rows.filter((row) => !row.show_on_homepage).length;
}

/** Room for one more logo in a place, inside both that place's cap and the total. */
export function canAddTo(rows: readonly DBSiteSponsorLogo[], drafts: readonly SponsorDraft[], place: Place): boolean {
  return placeCount(drafts, place) < PLACE_CAP[place] && listedCount(rows, drafts) < MAX_LISTED_SPONSORS;
}

/** What a draft change fingerprints as: anything the page can edit, in order. Used for "is there anything to save". */
export function draftFingerprint(drafts: readonly SponsorDraft[]): string {
  return JSON.stringify(drafts.map((d) => [d.id, d.name, d.logo_url, d.website, d.homepage, d.footer]));
}

/** What a stored list looks like to the conflict check: every column the page can write. */
export function rowsFingerprint(rows: readonly DBSiteSponsorLogo[]): string {
  return JSON.stringify(rows.map((r) => [r.id, r.name, r.logo_url, r.sort_order, r.website_url ?? null, r.show_on_homepage, r.show_in_footer]));
}

/** Moves a sponsor one step within a place. The place's other sponsors, and every sponsor in the other place, keep their positions. */
export function moveWithinPlace(drafts: readonly SponsorDraft[], key: string, place: Place, delta: -1 | 1): SponsorDraft[] {
  const positions = drafts.flatMap((draft, index) => (draft[flag(place)] ? [index] : []));
  const from = positions.findIndex((index) => drafts[index].key === key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= positions.length) return [...drafts];
  const next = [...drafts];
  [next[positions[from]], next[positions[to]]] = [next[positions[to]], next[positions[from]]];
  return next;
}

/** Takes a sponsor out of the carousel. Its footer flag is untouched: on save a sponsor also in the footer keeps its row. */
export function removeFromPlace(drafts: readonly SponsorDraft[], key: string): SponsorDraft[] {
  return drafts.filter((draft) => draft.key !== key);
}

export type SponsorProblem = { key: string; field: "website"; message: string };

/** A website the person typed that is not an address. A website that is unchanged from what is stored is never flagged. */
export function websiteProblems(rows: readonly DBSiteSponsorLogo[], drafts: readonly SponsorDraft[]): SponsorProblem[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return drafts.flatMap((draft) => {
    const stored = draft.id === null ? null : byId.get(draft.id);
    if (stored && (stored.website_url ?? "") === draft.website) return [];
    const result = normalizeSponsorWebsite(draft.website);
    return result.ok ? [] : [{ key: draft.key, field: "website" as const, message: result.message }];
  });
}

/** The place (or both) a draft shows in that is over its cap, if any. */
export function placesOverCap(drafts: readonly SponsorDraft[]): Place[] {
  return PLACES.filter((place) => placeCount(drafts, place) > PLACE_CAP[place]);
}

/**
 * The writes one Save makes.
 *
 * Order and shape follow diffSponsorLogos: deletes, then a switch update per
 * row that was switched off or on, then the row's other changes in draft order,
 * then inserts (sort order after every existing row). sort_order keeps the slots
 * the visible rows already hold: rows take the sorted slots of the rows that
 * stay, in draft order, so reordering one place moves only that place's rows.
 * A website is written only when it changed, and a new row carries one only
 * when one was typed.
 */
export function diffRoseCitySponsors(all: readonly DBSiteSponsorLogo[], drafts: readonly SponsorDraft[]): SponsorLogoDiff {
  const shown = all.filter((row) => row.show_on_homepage);
  const draftIds = new Set(drafts.flatMap((draft) => (draft.id === null ? [] : [draft.id])));
  const byId = new Map(all.map((row) => [row.id, row]));

  const toDelete: SponsorLogoDiff["toDelete"] = [];
  const toUpdate: SponsorLogoDiff["toUpdate"] = [];
  for (const row of shown) {
    if (draftIds.has(row.id)) continue;
    // Removed from the carousel: a row the footer still shows keeps its row and only the carousel switch goes off.
    if (row.show_in_footer) toUpdate.push({ id: row.id, changes: { show_on_homepage: false } });
    else toDelete.push(row);
  }

  const kept = drafts.filter((draft) => draft.id !== null && shown.some((row) => row.id === draft.id));
  const slots = shown.filter((row) => draftIds.has(row.id)).map((row) => row.sort_order).sort((a, b) => a - b);
  kept.forEach((draft, index) => {
    const row = byId.get(draft.id as string)!;
    const name = savedSponsorName(draft.name, inPlace(drafts, "carousel").indexOf(draft));
    const changes: SponsorRowChanges = {};
    if (row.name !== name) changes.name = name;
    if (row.logo_url !== draft.logo_url) changes.logo_url = draft.logo_url;
    if (row.sort_order !== slots[index]) changes.sort_order = slots[index];
    if ((row.website_url ?? "") !== draft.website) {
      const website = normalizeSponsorWebsite(draft.website);
      changes.website_url = website.ok ? website.value : (row.website_url ?? null);
    }
    if (Object.keys(changes).length) toUpdate.push({ id: row.id, changes });
  });

  let next = all.reduce((highest, row) => Math.max(highest, row.sort_order), -1) + 1;
  const toInsert: SponsorLogoDiff["toInsert"] = [];
  drafts.forEach((draft, index) => {
    if (draft.id !== null) return;
    const website = normalizeSponsorWebsite(draft.website);
    toInsert.push({
      name: savedSponsorName(draft.name, index),
      logo_url: draft.logo_url,
      sort_order: next++,
      show_on_homepage: true,
      show_in_footer: false,
      ...(website.ok && website.value !== null ? { website_url: website.value } : {}),
    });
  });

  return { toDelete, toInsert, toUpdate };
}

export type Rebased = { drafts: SponsorDraft[]; notes: string[] };

/**
 * "Load latest and keep my edits": the fresh list is the base, and only the
 * fields the person changed (name, logo, website) are put back on it, so
 * someone else's change to an untouched sponsor survives the next save. The
 * order follows the fresh list unless the person reordered. Footer flags come
 * from the fresh rows (the page never edits them). A sponsor that was deleted,
 * or no longer shows in the carousel, leaves the draft and is reported in
 * `notes`; one someone else added joins; one the person removed here stays removed.
 */
export function rebaseDrafts(
  drafts: readonly SponsorDraft[],
  previousRows: readonly DBSiteSponsorLogo[],
  freshRows: readonly DBSiteSponsorLogo[],
): Rebased {
  const prev = new Map(draftsFromRows(previousRows).map((draft) => [draft.id as string, draft]));
  const freshAll = new Map(freshRows.map((row) => [row.id, row]));
  const freshShown = new Map(draftsFromRows(freshRows).map((draft) => [draft.id as string, draft]));
  const notes: string[] = [];
  const merged = new Map<string, SponsorDraft>();
  for (const draft of drafts) {
    if (draft.id === null) continue;
    const label = draft.name.trim() || "A sponsor";
    const row = freshShown.get(draft.id);
    if (!row) {
      const elsewhere = freshAll.get(draft.id);
      const edited = prev.get(draft.id) && JSON.stringify(fields(prev.get(draft.id)!)) !== JSON.stringify(fields(draft));
      notes.push(elsewhere
        ? `${label} no longer shows in the homepage carousel, so it was left out${edited ? " and your edits to it were not kept" : ""}.`
        : `${label} was deleted somewhere else, so it was left out${edited ? " and your edits to it were not kept" : ""}.`);
      continue;
    }
    const before = prev.get(draft.id);
    const changed = (key: "name" | "logo_url" | "website") => !before || before[key] !== draft[key];
    merged.set(draft.id, {
      ...row,
      key: draft.key,
      name: changed("name") ? draft.name : row.name,
      logo_url: changed("logo_url") ? draft.logo_url : row.logo_url,
      website: changed("website") ? draft.website : row.website,
    });
  }
  const mineIds = drafts.flatMap((draft) => (draft.id !== null && merged.has(draft.id) ? [draft.id] : []));
  const before = [...prev.keys()].filter((id) => mineIds.includes(id));
  const reordered = JSON.stringify(mineIds.filter((id) => prev.has(id))) !== JSON.stringify(before);
  const removedHere = new Set([...prev.keys()].filter((id) => !drafts.some((draft) => draft.id === id)));
  const addedElsewhere = [...freshShown.values()].filter((draft) => !prev.has(draft.id as string) && !drafts.some((mine) => mine.id === draft.id));
  const fresh = drafts.filter((draft) => draft.id === null);
  let ordered: SponsorDraft[];
  if (reordered) {
    ordered = drafts.flatMap((draft) => (draft.id === null ? [draft] : merged.has(draft.id) ? [merged.get(draft.id)!] : []));
    ordered = [...ordered.filter((d) => d.id !== null), ...addedElsewhere, ...fresh];
  } else {
    const inFreshOrder = [...freshShown.keys()].flatMap((id) => (merged.has(id) ? [merged.get(id)!] : removedHere.has(id) ? [] : addedElsewhere.filter((d) => d.id === id)));
    ordered = [...inFreshOrder, ...fresh];
  }
  return { drafts: ordered, notes };
}

function fields(draft: SponsorDraft) {
  return [draft.name, draft.logo_url, draft.website];
}

/** A Replace: the draft with the new logo on the sponsor (a blank name takes the file's), or null when the sponsor is no longer in it. */
export function applyReplace(drafts: readonly SponsorDraft[], key: string, url: string, fileName: string): SponsorDraft[] | null {
  if (!drafts.some((draft) => draft.key === key)) return null;
  return drafts.map((draft) => (draft.key === key ? { ...draft, logo_url: url, name: draft.name.trim() || fileName } : draft));
}

/** Files a save retires: the logos of deleted rows and the old file of every replaced logo. Never a file a row still points at. */
export function retiredFiles(all: readonly DBSiteSponsorLogo[], diff: SponsorLogoDiff): string[] {
  const replaced = diff.toUpdate.flatMap((update) => {
    const original = all.find((row) => row.id === update.id);
    return original && update.changes.logo_url !== undefined && original.logo_url !== update.changes.logo_url ? [original.logo_url] : [];
  });
  return [...diff.toDelete.map((logo) => logo.logo_url), ...replaced];
}

/** The file of a replaced logo that was never saved: it has no row to keep it, so it is cleaned up. */
export function unsavedReplacedFile(replaced: Pick<SponsorDraft, "id" | "logo_url">): string | null {
  return replaced.id === null ? replaced.logo_url : null;
}
