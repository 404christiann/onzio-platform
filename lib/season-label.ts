export type SeasonYears = { start_year: number; end_year: number };

/**
 * The season "Start next season" creates after `latest`: both years move on
 * by one. A single-year season (start = end, e.g. Diverse City's 2026)
 * becomes "2027"; a split season (2025 to 2026) becomes "2026–27". Before
 * ADMIN-PLATFORM-FIXES-02 the single-year case produced "2027–27".
 */
export function nextSeasonAfter(latest: SeasonYears): SeasonYears & { label: string } {
  const start_year = latest.start_year + 1;
  const end_year = latest.end_year + 1;
  const label = start_year === end_year
    ? String(start_year)
    : `${start_year}–${String(end_year).slice(-2)}`;
  return { label, start_year, end_year };
}
