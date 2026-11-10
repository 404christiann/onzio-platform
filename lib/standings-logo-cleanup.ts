// ADMIN-RE-11b: starting a season copies the club's table, logos included, so
// one team logo file is often used by the same team in several seasons. A
// season dropping or replacing a logo must not delete a file another season's
// row still points at (the public table of the shown season included).

type LogoRow = { logo_url: string | null };

type StandingsReader = {
  from: (table: "league_standings") => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

/**
 * The URLs, out of those a save has just dropped, that no league table row of
 * the club (in any season) uses any more. If the check cannot be made the answer
 * is none: a file that is kept costs nothing, a file deleted under a season breaks it.
 */
export async function logoUrlsNoLongerUsed(client: StandingsReader, urls: readonly string[]): Promise<string[]> {
  const candidates = [...new Set(urls.filter((url) => url))];
  if (candidates.length === 0) return [];
  try {
    const { data, error } = await client.from("league_standings").select("logo_url").in("logo_url", candidates);
    if (error || !Array.isArray(data)) return [];
    const used = new Set((data as LogoRow[]).map((row) => row.logo_url));
    return candidates.filter((url) => !used.has(url));
  } catch {
    return [];
  }
}
