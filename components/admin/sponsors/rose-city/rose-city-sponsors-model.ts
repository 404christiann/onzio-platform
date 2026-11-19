import type { DBSiteSponsorLogo, SponsorLogoPlacement } from "@/lib/db-types";
import {
  MAX_CAROUSEL_SPONSORS,
  MAX_FOOTER_SPONSORS,
  SPONSOR_PLACEMENT_SWITCH,
  normalizeSponsorWebsite,
  savedSponsorName,
  type SponsorDraft,
  type SponsorLogoDiff,
  type SponsorRowChanges,
} from "@/lib/sponsor-content";

/*
 * The Rose City Sponsors editor edits both places at once. These are pure
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

export const PLACES = ["carousel", "footer"] as const satisfies readonly SponsorLogoPlacement[];
export type Place = (typeof PLACES)[number];

export const PLACE_NOUN: Record<Place, string> = { carousel: "homepage carousel", footer: "footer" };
export const PLACE_CAP: Record<Place, number> = { carousel: MAX_CAROUSEL_SPONSORS, footer: MAX_FOOTER_SPONSORS };

const flag = (place: Place): "homepage" | "footer" => (place === "carousel" ? "homepage" : "footer");

export function isVisibleRow(row: Pick<DBSiteSponsorLogo, "show_on_homepage" | "show_in_footer">): boolean {
  return row.show_on_homepage || row.show_in_footer;
}

/** The draft for a loaded list: every sponsor that shows somewhere, in list order. */
export function draftsFromRows(rows: readonly DBSiteSponsorLogo[]): SponsorDraft[] {
  return rows.filter(isVisibleRow).map((row) => ({
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
  return drafts.length + rows.filter((row) => !isVisibleRow(row)).length;
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

/** Switches one place off for a sponsor. A sponsor left showing nowhere leaves the list (it is deleted on save). */
export function removeFromPlace(drafts: readonly SponsorDraft[], key: string, place: Place): SponsorDraft[] {
  return drafts.flatMap((draft) => {
    if (draft.key !== key) return [draft];
    const next = { ...draft, [flag(place)]: false };
    return next.homepage || next.footer ? [next] : [];
  });
}

export function setPlaceSwitch(drafts: readonly SponsorDraft[], key: string, place: Place, on: boolean): SponsorDraft[] {
  return drafts.map((draft) => (draft.key === key ? { ...draft, [flag(place)]: on } : draft));
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
  const shown = all.filter(isVisibleRow);
  const draftIds = new Set(drafts.flatMap((draft) => (draft.id === null ? [] : [draft.id])));
  const byId = new Map(all.map((row) => [row.id, row]));

  const toDelete: SponsorLogoDiff["toDelete"] = [];
  const toUpdate: SponsorLogoDiff["toUpdate"] = [];
  for (const row of shown) {
    if (!draftIds.has(row.id)) { toDelete.push(row); continue; }
    const draft = drafts.find((entry) => entry.id === row.id)!;
    for (const place of PLACES) {
      const column = SPONSOR_PLACEMENT_SWITCH[place];
      if (row[column] !== draft[flag(place)]) toUpdate.push({ id: row.id, changes: { [column]: draft[flag(place)] } });
    }
  }

  const kept = drafts.filter((draft) => draft.id !== null && shown.some((row) => row.id === draft.id));
  const slots = shown.filter((row) => draftIds.has(row.id)).map((row) => row.sort_order).sort((a, b) => a - b);
  kept.forEach((draft, index) => {
    const row = byId.get(draft.id as string)!;
    const name = savedSponsorName(draft.name, nameIndex(drafts, draft));
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
  drafts.forEach((draft) => {
    if (draft.id !== null) return;
    const website = normalizeSponsorWebsite(draft.website);
    toInsert.push({
      name: savedSponsorName(draft.name, nameIndex(drafts, draft)),
      logo_url: draft.logo_url,
      sort_order: next++,
      show_on_homepage: draft.homepage,
      show_in_footer: draft.footer,
      ...(website.ok && website.value !== null ? { website_url: website.value } : {}),
    });
  });

  return { toDelete, toInsert, toUpdate };
}

/** The "Sponsor N" a blank name saves as: its position in the first place that shows it, as the classic page counts it. */
function nameIndex(drafts: readonly SponsorDraft[], draft: SponsorDraft): number {
  const place: Place = draft.homepage ? "carousel" : "footer";
  return inPlace(drafts, place).indexOf(draft);
}

/**
 * "Load latest and keep my edits": the edits stay on the freshly read list.
 * A sponsor someone else deleted leaves the draft; one someone else added joins
 * at the end; one the person removed here stays removed.
 */
export function rebaseDrafts(
  drafts: readonly SponsorDraft[],
  previousRows: readonly DBSiteSponsorLogo[],
  freshRows: readonly DBSiteSponsorLogo[],
): SponsorDraft[] {
  const fresh = new Set(freshRows.map((row) => row.id));
  const before = new Set(previousRows.map((row) => row.id));
  const mine = new Set(drafts.flatMap((draft) => (draft.id === null ? [] : [draft.id])));
  const kept = drafts.filter((draft) => draft.id === null || fresh.has(draft.id));
  const added = draftsFromRows(freshRows.filter((row) => !before.has(row.id) && !mine.has(row.id)));
  return [...kept, ...added];
}
