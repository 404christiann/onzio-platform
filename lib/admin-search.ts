import {
  getVisibleAdminHomeJobs,
  type AdminHomeJobId,
  type AdminRouteAccessContext,
  type AdminRouteIconKey,
} from "@/lib/admin-route-manifest";
import { getAdminTabPages, getVisibleAdminTabs, type AdminTabId } from "@/lib/admin-tabs";

// ADMIN-RE-24c: what search lists (design: admin-plain-search-two-clubs.html):
// every job, tab page and page the person can open, built from the route
// manifest after its visibility rules, plus the club's players and upcoming
// games. Hidden pages never enter the list. Matching is plain on purpose: the
// start of a name first, then the start of any word in it, then anywhere in
// it, never fuzzy ("sam" finds Sam Okafor, not "Sign-up forms").

export type AdminSearchGroup = "Jobs" | "Pages" | "Players" | "Games";

export type AdminSearchIcon =
  | { kind: "job"; id: AdminHomeJobId }
  | { kind: "tab"; id: AdminTabId }
  | { kind: "route"; id: AdminRouteIconKey }
  | { kind: "player" }
  | { kind: "game" };

export type AdminSearchItem = Readonly<{
  /** Unique across the list. */
  id: string;
  group: AdminSearchGroup;
  label: string;
  /** Shown on the right: the tab a page sits under, a player's number. */
  hint?: string;
  href: string;
  icon: AdminSearchIcon;
  /** Extra words that may also match, weaker than the label. */
  keywords?: readonly string[];
}>;

export type AdminSearchPlayer = Readonly<{ id: string; name: string; number: number | null; position: string }>;
export type AdminSearchGame = Readonly<{ id: string; opponent: string; home: boolean | null; when: string }>;

/** Jobs, tab pages and pages for this person, in the order they read on the tabs. */
export function getAdminSearchItems(context: AdminRouteAccessContext): readonly AdminSearchItem[] {
  const tabs = getVisibleAdminTabs(context);
  if (tabs.length === 0) return [];
  const jobs: AdminSearchItem[] = getVisibleAdminHomeJobs(context).map((job) => ({
    id: `job:${job.id}`,
    group: "Jobs",
    label: job.label,
    href: job.href,
    icon: { kind: "job", id: job.id },
  }));
  const pages: AdminSearchItem[] = [];
  for (const tab of tabs) {
    if (tab.id !== "home") {
      pages.push({ id: `tab:${tab.id}`, group: "Pages", label: tab.title, hint: tab.label, href: tab.href, icon: { kind: "tab", id: tab.id } });
    }
    for (const row of getAdminTabPages(tab.id, context)) {
      pages.push({
        id: `page:${row.id}`,
        group: "Pages",
        label: row.label,
        hint: tab.label,
        href: row.href,
        icon: { kind: "route", id: row.iconKey },
      });
    }
  }
  return [...jobs, ...pages];
}

/** Players open their page under the Games tab. */
export function playerSearchItems(players: readonly AdminSearchPlayer[]): readonly AdminSearchItem[] {
  return players.map((player) => ({
    id: `player:${player.id}`,
    group: "Players",
    label: player.name,
    hint: [player.number && player.number > 0 ? `#${player.number}` : null, player.position].filter(Boolean).join(" · "),
    href: `/admin/games/players/${player.id}`,
    icon: { kind: "player" },
    keywords: ["player"],
  }));
}

/** Upcoming games open the Games page, where a game is changed. */
export function gameSearchItems(games: readonly AdminSearchGame[], gamesHref: string): readonly AdminSearchItem[] {
  return games.map((game) => ({
    id: `game:${game.id}`,
    group: "Games",
    label: `${game.home === false ? "at" : "vs"} ${game.opponent}`,
    hint: game.when,
    href: gamesHref,
    icon: { kind: "game" },
    keywords: [game.opponent, "game"],
  }));
}

const WORD = /[\s\-–—_/·.,()&']+/;

/**
 * cmdk's filter, replacing its fuzzy default. The label (the first keyword) is
 * matched at its start (1), at a word start (0.9) or anywhere (0.5); other
 * keywords only at a word start (0.3) or anywhere (0.2). Zero hides the item.
 */
export function plainFilter(_value: string, search: string, keywords: readonly string[] = []): number {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return 1;
  const [label = "", ...rest] = keywords.map((keyword) => keyword.toLocaleLowerCase());
  if (label.startsWith(query)) return 1;
  if (label.split(WORD).some((word) => word.startsWith(query))) return 0.9;
  if (label.includes(query)) return 0.5;
  if (rest.some((keyword) => keyword.split(WORD).some((word) => word.startsWith(query)))) return 0.3;
  if (rest.some((keyword) => keyword.includes(query))) return 0.2;
  return 0;
}

/** The words an item matches on, label first (cmdk passes these to the filter). */
export function searchWords(item: AdminSearchItem): string[] {
  return [item.label, ...(item.hint ? [item.hint] : []), ...(item.keywords ?? [])];
}
