export type MatchSponsorFields = {
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  sponsor_link: string | null;
};

type MatchWithSponsor = MatchSponsorFields & {
  date: string;
  time: string;
  season_id: string;
};

export const EMPTY_MATCH_SPONSOR: MatchSponsorFields = {
  sponsor_name: null,
  sponsor_logo_url: null,
  sponsor_link: null,
};

/** Copies only sponsor fields from the latest scheduled match in a season. */
export function carrySponsorFromLatestMatch(
  matches: readonly MatchWithSponsor[],
  seasonId: string,
): MatchSponsorFields {
  const latest = matches
    .filter((match) => match.season_id === seasonId)
    .slice()
    .sort((a, b) => {
      const keyA = `${a.date}T${a.time || "00:00"}`;
      const keyB = `${b.date}T${b.time || "00:00"}`;
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    })
    .at(-1);

  if (!latest) return { ...EMPTY_MATCH_SPONSOR };
  return {
    sponsor_name: latest.sponsor_name?.trim() || null,
    sponsor_logo_url: latest.sponsor_logo_url?.trim() || null,
    sponsor_link: latest.sponsor_link?.trim() || null,
  };
}
