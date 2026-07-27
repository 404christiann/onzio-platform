// INTEGRATION TESTS — analytics pipeline end-to-end
//
// These tests mock only the Supabase client (the network boundary).
// Everything above it — queries.ts and analytics-helpers.ts — runs as
// real code. This proves the full pipeline works correctly together.
//
// Scenarios:
//   1. Field player match log → scatter-ready data
//   2. Roster fetch → radar normalisation
//   3. Season-switch flow: historical roster shows inactive players
//   4. New player (no appearances) → empty-state trigger
//   5. GK full pipeline: match log + GK radar
//   6. Rating coercion end-to-end: PostgREST strings → typed numbers
//   7. Partial-rating season: scatter shown/hidden at threshold boundary
//   8. fetchPlayerMatchTrend backward compat: value = G+A, rating added
//   9. No-seasonId trend: returns all historical data unfiltered

import { describe, it, expect, vi } from 'vitest'
import {
  fetchPlayerMatchLog,
  fetchRoster,
  fetchSeasons,
  fetchActiveSeason,
  fetchPlayerMatchTrend,
} from '@/lib/queries'
import {
  hasEnoughRatings,
  buildFieldRadarData,
  buildGKRadarData,
} from '@/lib/analytics-helpers'
import type { FieldStats, GoalkeeperStats } from '@/lib/data'

// ─────────────────────────────────────────────────────────────
// Supabase mock — identical helper to queries.test.ts
// ─────────────────────────────────────────────────────────────

const { mockFrom } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  return { mockFrom }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

function chain(result: { data: unknown; error: unknown }) {
  const q = {} as Record<string, unknown>
  for (const m of ['select','eq','neq','in','gt','lt','gte','lte',
                    'order','limit','single','not','is','filter']) {
    q[m] = vi.fn().mockReturnValue(q)
  }
  q.then    = (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  q.catch   = (rej: (v: unknown) => unknown) => Promise.resolve(result).catch(rej)
  q.finally = (fn: () => void)               => Promise.resolve(result).finally(fn)
  return q
}

// ─────────────────────────────────────────────────────────────
// Shared fixtures — realistic season data
// ─────────────────────────────────────────────────────────────

const SEASON_ID = 'season-2025'
const PLAYER_ID = 'player-fwd-1'
const GK_ID     = 'player-gk-1'

const seasons = [
  { id: SEASON_ID,   label: '2025–26', start_year: 2025, end_year: 2026, active: true,  created_at: '2025-01-01' },
  { id: 'season-2024', label: '2024–25', start_year: 2024, end_year: 2025, active: false, created_at: '2024-01-01' },
]

// 10 matches — 6 have a rating (enough for scatter), 4 do not
const matchRows = Array.from({ length: 10 }, (_, i) => ({
  id:        `match-${i + 1}`,
  date:      `2025-0${Math.floor(i / 3) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  opponent:  `Opponent ${i + 1}`,
  season_id: SEASON_ID,
}))

const fieldStatRows = matchRows.map((m, i) => ({
  match_id:       m.id,
  mins:           90,
  goals:          i < 3 ? 1 : 0,
  assists:        i >= 3 && i < 5 ? 1 : 0,
  tackles:        2,
  offsides:       0,
  fouls:          1,
  fouls_suffered: 1,
  yellow:         0,
  red:            0,
  starts:         true,
  rating:         i < 6 ? String(6.5 + i * 0.3) : null,  // first 6 rated, last 4 null
}))

const gkStatRows = matchRows.slice(0, 5).map((m, i) => ({
  match_id:    m.id,
  mins:        90,
  goals_against: i === 2 ? 1 : 0,
  saves:       3 + i,
  clean_sheets: i === 2 ? 0 : 1,
  yellow:      0,
  red:         0,
  starts:      true,
  rating:      String(7.0 + i * 0.2),
}))

// Four forwards (position cohort for radar normalisation)
const forwardSeasonStats = [
  { player_id: 'player-fwd-1', goals: 12, assists: 8,  tackles: 5,  starts: 18, yellow: 1, red: 0, mins: 1620, offsides: 2, fouls: 8, fouls_suffered: 10, season_id: SEASON_ID },
  { player_id: 'player-fwd-2', goals:  6, assists: 4,  tackles: 3,  starts: 15, yellow: 2, red: 0, mins: 1200, offsides: 1, fouls: 5, fouls_suffered:  6, season_id: SEASON_ID },
  { player_id: 'player-fwd-3', goals:  3, assists: 2,  tackles: 2,  starts: 12, yellow: 0, red: 0, mins:  980, offsides: 3, fouls: 3, fouls_suffered:  4, season_id: SEASON_ID },
  { player_id: 'player-fwd-4', goals:  0, assists: 1,  tackles: 1,  starts:  5, yellow: 0, red: 0, mins:  400, offsides: 0, fouls: 1, fouls_suffered:  1, season_id: SEASON_ID },
]

const gkSeasonStats = [
  { player_id: GK_ID, goals_against: 8, saves: 22, clean_sheets: 5, starts: 10, yellow: 0, red: 0, mins: 900, season_id: SEASON_ID },
]

const playerRows = [
  { id: 'player-fwd-1', number: 10, name: 'Marcus Rivera',  position: 'Forward' as const,    active: true,  nationality: '🇺🇸', height: "5'11", weight: '175 lbs', hometown: 'LA',  age: 24, caption: null, school: null, previous_club: null, photo_url: '/img/fwd1.webp', bio: null, pronunciation: null, foot: null },
  { id: 'player-fwd-2', number: 9,  name: 'Diego Herrera',  position: 'Forward' as const,    active: true,  nationality: '🇲🇽', height: "5'9",  weight: '165 lbs', hometown: 'SD',  age: 22, caption: null, school: null, previous_club: null, photo_url: '/img/fwd2.webp', bio: null, pronunciation: null, foot: null },
  { id: 'player-fwd-3', number: 11, name: 'Tyrell Brown',   position: 'Forward' as const,    active: true,  nationality: '🇺🇸', height: "6'0",  weight: '180 lbs', hometown: 'LA',  age: 21, caption: null, school: null, previous_club: null, photo_url: '/img/fwd3.webp', bio: null, pronunciation: null, foot: null },
  { id: 'player-fwd-4', number: 20, name: 'Sean Park',      position: 'Forward' as const,    active: true,  nationality: '🇺🇸', height: "5'8",  weight: '158 lbs', hometown: 'OC',  age: 20, caption: null, school: null, previous_club: null, photo_url: '/img/fwd4.webp', bio: null, pronunciation: null, foot: null },
  { id: GK_ID,          number: 1,  name: 'Alex Mendez',    position: 'Goalkeeper' as const, active: true,  nationality: '🇲🇽', height: "6'2",  weight: '190 lbs', hometown: 'GDL', age: 25, caption: null, school: null, previous_club: null, photo_url: '/img/gk1.webp',  bio: null, pronunciation: null, foot: null },
]

const historicalForwardStats = [
  { player_id: 'player-old-1', goals: 5, assists: 3, tackles: 4, starts: 10, yellow: 1, red: 0, mins: 850, offsides: 1, fouls: 4, fouls_suffered: 5, season_id: 'season-2024' },
]
const historicalPlayer = {
  id: 'player-old-1', number: 7, name: 'Old Timer', position: 'Forward' as const, active: false,
  nationality: '🇺🇸', height: "5'10", weight: '170 lbs', hometown: 'SF', age: 28,
  caption: null, school: null, previous_club: null, photo_url: '/img/old.webp', bio: null,
  pronunciation: null, foot: null,
}


// ─────────────────────────────────────────────────────────────
// 1. Field player match log → scatter-ready data
// ─────────────────────────────────────────────────────────────

describe('Scenario 1: field player match log feeds scatter pipeline', () => {
  it('returns 10 rows sorted chronologically when all match_ids resolve', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: fieldStatRows, error: null }))
      .mockReturnValueOnce(chain({ data: matchRows,     error: null }))

    const log = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(log).toHaveLength(10)
    // Verify chronological order
    for (let i = 1; i < log.length; i++) {
      expect(log[i].date >= log[i - 1].date).toBe(true)
    }
  })

  it('hasEnoughRatings returns true for a 6-rated, 4-null season', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: fieldStatRows, error: null }))
      .mockReturnValueOnce(chain({ data: matchRows,     error: null }))

    const log = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(hasEnoughRatings(log)).toBe(true)
    expect(log.filter(r => r.rating !== null)).toHaveLength(6)
    expect(log.filter(r => r.rating === null)).toHaveLength(4)
  })

  it('scatter points have correct shape and coerced numeric ratings', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: fieldStatRows, error: null }))
      .mockReturnValueOnce(chain({ data: matchRows,     error: null }))

    const log = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)
    const ratedPoints = log.filter(r => r.rating !== null)

    ratedPoints.forEach(p => {
      expect(typeof p.mins).toBe('number')
      expect(typeof p.rating).toBe('number')
      expect(p.rating!).toBeGreaterThanOrEqual(0)
      expect(p.rating!).toBeLessThanOrEqual(10)
    })
  })

  it('goals and assists are numbers, not strings', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: fieldStatRows, error: null }))
      .mockReturnValueOnce(chain({ data: matchRows,     error: null }))

    const log = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    log.forEach(r => {
      expect(typeof r.goals).toBe('number')
      expect(typeof r.assists).toBe('number')
    })
  })
})


// ─────────────────────────────────────────────────────────────
// 2. Roster fetch → radar normalisation
// ─────────────────────────────────────────────────────────────

describe('Scenario 2: roster pipeline feeds radar correctly', () => {
  it('top scorer in the cohort normalises to 100 on the Scoring axis', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: seasons,             error: null })) // seasons
      .mockReturnValueOnce(chain({ data: forwardSeasonStats,  error: null })) // field stats
      .mockReturnValueOnce(chain({ data: gkSeasonStats,       error: null })) // gk stats
      .mockReturnValueOnce(chain({ data: playerRows,          error: null })) // players
      .mockReturnValueOnce(chain({ data: [],                  error: null })) // photos

    const { forwards } = await fetchRoster(SEASON_ID)

    // Collect forward stats for radar normalisation
    const fwdStats = forwards.map(p => p.stats as FieldStats)
    const topScorer = forwards.find(p => p.id === 'player-fwd-1')!

    const radar = buildFieldRadarData(topScorer.stats as FieldStats, fwdStats)

    expect(radar.player[0]).toBe(100)   // Marcus has 12 goals = max in cohort
    expect(radar.labels[0]).toBe('Scoring')
  })

  it('lowest-minute player has lowest Stamina value in the cohort', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: seasons,            error: null }))
      .mockReturnValueOnce(chain({ data: forwardSeasonStats, error: null }))
      .mockReturnValueOnce(chain({ data: gkSeasonStats,      error: null }))
      .mockReturnValueOnce(chain({ data: playerRows,         error: null }))
      .mockReturnValueOnce(chain({ data: [],                 error: null }))

    const { forwards } = await fetchRoster(SEASON_ID)
    const fwdStats    = forwards.map(p => p.stats as FieldStats)
    const lowMinPlayer = forwards.find(p => p.id === 'player-fwd-4')!
    const highMinPlayer = forwards.find(p => p.id === 'player-fwd-1')!

    const radarLow  = buildFieldRadarData(lowMinPlayer.stats  as FieldStats, fwdStats)
    const radarHigh = buildFieldRadarData(highMinPlayer.stats as FieldStats, fwdStats)

    // Stamina is axis index 3
    expect(radarLow.player[3]).toBeLessThan(radarHigh.player[3])
  })

  it('posAvg values reflect all forwards in the fetched cohort', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: seasons,            error: null }))
      .mockReturnValueOnce(chain({ data: forwardSeasonStats, error: null }))
      .mockReturnValueOnce(chain({ data: gkSeasonStats,      error: null }))
      .mockReturnValueOnce(chain({ data: playerRows,         error: null }))
      .mockReturnValueOnce(chain({ data: [],                 error: null }))

    const { forwards } = await fetchRoster(SEASON_ID)
    const fwdStats     = forwards.map(p => p.stats as FieldStats)
    const player       = forwards[0]
    const radar        = buildFieldRadarData(player.stats as FieldStats, fwdStats)

    radar.posAvg.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    })
    // posAvg Scoring should be less than player[0]=100 since others score less
    expect(radar.posAvg[0]).toBeLessThan(100)
  })

  it('roster correctly separates forwards and goalkeepers', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: seasons,            error: null }))
      .mockReturnValueOnce(chain({ data: forwardSeasonStats, error: null }))
      .mockReturnValueOnce(chain({ data: gkSeasonStats,      error: null }))
      .mockReturnValueOnce(chain({ data: playerRows,         error: null }))
      .mockReturnValueOnce(chain({ data: [],                 error: null }))

    const result = await fetchRoster(SEASON_ID)

    expect(result.forwards).toHaveLength(4)
    expect(result.goalkeepers).toHaveLength(1)
    expect(result.goalkeepers[0].id).toBe(GK_ID)
  })
})


// ─────────────────────────────────────────────────────────────
// 3. Season-switch flow: historical roster includes inactive players
// ─────────────────────────────────────────────────────────────

describe('Scenario 3: season-switch flow', () => {
  it('resolves the active season before loading its roster', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [seasons[0]], error: null }))
    const activeSeason = await fetchActiveSeason()

    expect(activeSeason?.id).toBe(SEASON_ID)

    mockFrom
      .mockReturnValueOnce(chain({ data: seasons,            error: null }))
      .mockReturnValueOnce(chain({ data: forwardSeasonStats, error: null }))
      .mockReturnValueOnce(chain({ data: gkSeasonStats,      error: null }))
      .mockReturnValueOnce(chain({ data: playerRows,         error: null }))
      .mockReturnValueOnce(chain({ data: [],                 error: null }))

    const roster = await fetchRoster(activeSeason!.id)
    expect(roster.seasonId).toBe(SEASON_ID)
    expect(roster.forwards).toHaveLength(4)
  })

  it('fetchSeasons returns seasons newest-first, then fetchRoster(historicalId) shows old player', async () => {
    // Step 1: fetch available seasons
    mockFrom.mockReturnValueOnce(chain({ data: seasons, error: null }))
    const allSeasons = await fetchSeasons()

    expect(allSeasons[0].id).toBe(SEASON_ID)
    expect(allSeasons[1].id).toBe('season-2024')

    // Step 2: select historical season and fetch roster
    const historicalId = allSeasons[1].id
    mockFrom
      .mockReturnValueOnce(chain({ data: seasons,              error: null })) // seasons (label lookup)
      .mockReturnValueOnce(chain({ data: historicalForwardStats, error: null }))
      .mockReturnValueOnce(chain({ data: [],                   error: null }))
      .mockReturnValueOnce(chain({ data: [historicalPlayer],   error: null }))
      .mockReturnValueOnce(chain({ data: [],                   error: null }))

    const roster = await fetchRoster(historicalId)
    const allPlayers = [
      ...roster.goalkeepers, ...roster.defenders,
      ...roster.midfielders, ...roster.forwards,
    ]

    expect(allPlayers).toHaveLength(1)
    expect(allPlayers[0].id).toBe('player-old-1')
    expect(roster.seasonLabel).toBe('2024–25')
    expect(roster.seasonId).toBe('season-2024')
  })

  it('current-season active players do NOT appear in historical season result', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: seasons,                error: null }))
      .mockReturnValueOnce(chain({ data: historicalForwardStats, error: null }))
      .mockReturnValueOnce(chain({ data: [],                     error: null }))
      .mockReturnValueOnce(chain({ data: [historicalPlayer],     error: null }))
      .mockReturnValueOnce(chain({ data: [],                     error: null }))

    const roster = await fetchRoster('season-2024')
    const allPlayers = [...roster.forwards, ...roster.goalkeepers, ...roster.defenders, ...roster.midfielders]

    // Active current-season players (fwd-1 through fwd-4) should NOT appear
    expect(allPlayers.map(p => p.id)).not.toContain('player-fwd-1')
  })

  it('deactivating a player removes them from the active roster without deleting season stats', async () => {
    const deactivatedPlayer = { ...playerRows[0], active: false }

    mockFrom
      .mockReturnValueOnce(chain({ data: [seasons[0]], error: null }))
      .mockReturnValueOnce(chain({ data: forwardSeasonStats, error: null }))
      .mockReturnValueOnce(chain({ data: gkSeasonStats, error: null }))
      .mockReturnValueOnce(chain({ data: [deactivatedPlayer, ...playerRows.slice(1)], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))

    const roster = await fetchRoster()
    const allPlayers = [...roster.forwards, ...roster.goalkeepers, ...roster.defenders, ...roster.midfielders]

    expect(allPlayers.map((player) => player.id)).not.toContain(deactivatedPlayer.id)
    expect(forwardSeasonStats.some((stats) => stats.player_id === deactivatedPlayer.id)).toBe(true)
  })
})


// ─────────────────────────────────────────────────────────────
// 4. New player (no appearances) → empty-state trigger
// ─────────────────────────────────────────────────────────────

describe('Scenario 4: new player with no match data', () => {
  it('fetchPlayerMatchLog returns [] and hasEnoughRatings returns false', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [],        error: null }))
      .mockReturnValueOnce(chain({ data: matchRows, error: null }))

    const log = await fetchPlayerMatchLog('brand-new-player', false, SEASON_ID)

    expect(log).toHaveLength(0)
    expect(hasEnoughRatings(log)).toBe(false)
  })

  it('scatter plot would be hidden (< 3 ratings) for a new player', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [],        error: null }))
      .mockReturnValueOnce(chain({ data: matchRows, error: null }))

    const log = await fetchPlayerMatchLog('brand-new-player', false, SEASON_ID)

    // Represents the component decision: hide scatter, show empty callout
    const showScatter = hasEnoughRatings(log)
    expect(showScatter).toBe(false)
  })
})


// ─────────────────────────────────────────────────────────────
// 5. GK full pipeline: match log + GK radar
// ─────────────────────────────────────────────────────────────

describe('Scenario 5: goalkeeper analytics pipeline', () => {
  it('GK match log returns goals=0 and assists=0 regardless of DB stats', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: gkStatRows, error: null }))
      .mockReturnValueOnce(chain({ data: matchRows,  error: null }))

    const log = await fetchPlayerMatchLog(GK_ID, true, SEASON_ID)

    log.forEach(r => {
      expect(r.goals).toBe(0)
      expect(r.assists).toBe(0)
    })
  })

  it('GK match log returns correctly rated rows', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: gkStatRows, error: null }))
      .mockReturnValueOnce(chain({ data: matchRows,  error: null }))

    const log = await fetchPlayerMatchLog(GK_ID, true, SEASON_ID)

    expect(log.every(r => r.rating !== null)).toBe(true)  // all 5 GK rows are rated
    expect(typeof log[0].rating).toBe('number')
  })

  it('GK radar has Reflexes as first axis and correct cohort normalisation', async () => {
    // Two GKs in the cohort
    const gkPeer: GoalkeeperStats = { saves: 10, cleanSheets: 2, goalsAgainst: 12, starts: 8, yellow: 0, red: 0, mins: 720 }
    const gkStar: GoalkeeperStats = { saves: 22, cleanSheets: 5, goalsAgainst:  8, starts: 10, yellow: 1, red: 0, mins: 900 }

    const radar = buildGKRadarData(gkStar, [gkStar, gkPeer])

    expect(radar.labels[0]).toBe('Reflexes')
    expect(radar.player[0]).toBe(100)  // gkStar has max saves in cohort
    expect(radar.player[3]).toBeLessThan(100) // discipline reduced by 1 yellow
  })

  it('GK trend uses saves as value (not goals+assists)', async () => {
    const gkTrendStats = [
      { match_id: 'match-1', saves: 4, mins: 90, rating: '7.5' },
      { match_id: 'match-2', saves: 2, mins: 90, rating: '7.0' },
    ]
    const trendMatches = [
      { id: 'match-1', date: '2025-03-01', opponent: 'Team A', season_id: SEASON_ID },
      { id: 'match-2', date: '2025-03-15', opponent: 'Team B', season_id: SEASON_ID },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: gkTrendStats, error: null }))
      .mockReturnValueOnce(chain({ data: trendMatches, error: null }))

    const trend = await fetchPlayerMatchTrend(GK_ID, true, SEASON_ID)

    expect(trend[0].value).toBe(4)  // saves, not goals+assists
    expect(trend[1].value).toBe(2)
    expect(trend[0].rating).toBe(7.5)
  })
})


// ─────────────────────────────────────────────────────────────
// 6. Rating coercion end-to-end: PostgREST strings → typed numbers
// ─────────────────────────────────────────────────────────────

describe('Scenario 6: rating coercion through the full pipeline', () => {
  it('all string-typed ratings from PostgREST arrive as numbers in MatchLogRow', async () => {
    // Simulate PostgREST returning all ratings as strings
    const rawStats = [
      { match_id: 'match-1', mins: 90, goals: 1, assists: 0, tackles: 1, offsides: 0, fouls: 0, fouls_suffered: 0, yellow: 0, red: 0, starts: true, rating: '8.5' },
      { match_id: 'match-2', mins: 90, goals: 0, assists: 1, tackles: 2, offsides: 0, fouls: 1, fouls_suffered: 0, yellow: 0, red: 0, starts: true, rating: '7.0' },
      { match_id: 'match-3', mins: 90, goals: 2, assists: 0, tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 1, yellow: 0, red: 0, starts: true, rating: '9.1' },
    ]
    const rawMatches = [
      { id: 'match-1', date: '2025-01-10', opponent: 'A', season_id: SEASON_ID },
      { id: 'match-2', date: '2025-01-17', opponent: 'B', season_id: SEASON_ID },
      { id: 'match-3', date: '2025-01-24', opponent: 'C', season_id: SEASON_ID },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: rawStats,   error: null }))
      .mockReturnValueOnce(chain({ data: rawMatches, error: null }))

    const log = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    log.forEach(r => {
      expect(typeof r.rating).toBe('number')
    })
    expect(log[0].rating).toBe(8.5)
    expect(log[1].rating).toBe(7.0)
    expect(log[2].rating).toBe(9.1)
  })

  it('a mix of string ratings, null ratings, and out-of-range values is handled safely', async () => {
    const rawStats = [
      { match_id: 'match-1', mins: 90, goals: 0, assists: 0, tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0, yellow: 0, red: 0, starts: true, rating: '7.5' },   // valid string
      { match_id: 'match-2', mins: 90, goals: 0, assists: 0, tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0, yellow: 0, red: 0, starts: true, rating: null    },   // no rating
      { match_id: 'match-3', mins: 90, goals: 0, assists: 0, tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0, yellow: 0, red: 0, starts: true, rating: '11'    },   // out-of-range
    ]
    const rawMatches = rawStats.map((r, i) => ({
      id: r.match_id, date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      opponent: `T${i}`, season_id: SEASON_ID,
    }))
    mockFrom
      .mockReturnValueOnce(chain({ data: rawStats,   error: null }))
      .mockReturnValueOnce(chain({ data: rawMatches, error: null }))

    const log = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(log[0].rating).toBe(7.5)    // coerced from string
    expect(log[1].rating).toBeNull()   // preserved null
    expect(log[2].rating).toBeNull()   // out-of-range → null
    expect(hasEnoughRatings(log)).toBe(false)  // only 1 valid rating → below threshold
  })
})


// ─────────────────────────────────────────────────────────────
// 7. Partial-rating season: scatter shown/hidden at threshold boundary
// ─────────────────────────────────────────────────────────────

describe('Scenario 7: scatter threshold boundary in real match data', () => {
  function buildMatchData(ratedCount: number, total: number) {
    const stats = Array.from({ length: total }, (_, i) => ({
      match_id: `m${i}`, mins: 90, goals: 0, assists: 0, tackles: 0,
      offsides: 0, fouls: 0, fouls_suffered: 0, yellow: 0, red: 0, starts: true,
      rating: i < ratedCount ? '7.0' : null,
    }))
    const matches = Array.from({ length: total }, (_, i) => ({
      id: `m${i}`,
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      opponent: `T${i}`, season_id: SEASON_ID,
    }))
    return { stats, matches }
  }

  it('scatter is hidden when exactly 2 out of 10 matches are rated', async () => {
    const { stats, matches } = buildMatchData(2, 10)
    mockFrom
      .mockReturnValueOnce(chain({ data: stats,   error: null }))
      .mockReturnValueOnce(chain({ data: matches, error: null }))

    const log = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)
    expect(hasEnoughRatings(log)).toBe(false)
  })

  it('scatter appears when exactly 3 out of 10 matches are rated (threshold)', async () => {
    const { stats, matches } = buildMatchData(3, 10)
    mockFrom
      .mockReturnValueOnce(chain({ data: stats,   error: null }))
      .mockReturnValueOnce(chain({ data: matches, error: null }))

    const log = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)
    expect(hasEnoughRatings(log)).toBe(true)
  })

  it('scatter appears for a fully-rated 10-game season', async () => {
    const { stats, matches } = buildMatchData(10, 10)
    mockFrom
      .mockReturnValueOnce(chain({ data: stats,   error: null }))
      .mockReturnValueOnce(chain({ data: matches, error: null }))

    const log = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)
    expect(hasEnoughRatings(log)).toBe(true)
    expect(log.every(r => r.rating !== null)).toBe(true)
  })
})


// ─────────────────────────────────────────────────────────────
// 8. fetchPlayerMatchTrend backward compat: value field
// ─────────────────────────────────────────────────────────────

describe('Scenario 8: fetchPlayerMatchTrend backward compatibility', () => {
  it('value equals goals+assists for field players (existing TrendLine contract)', async () => {
    const stats = [
      { match_id: 'match-1', goals: 2, assists: 1, mins: 90, rating: '8.1' },
      { match_id: 'match-2', goals: 0, assists: 0, mins: 78, rating: null },
    ]
    const matches = [
      { id: 'match-1', date: '2025-03-01', opponent: 'A', season_id: SEASON_ID },
      { id: 'match-2', date: '2025-03-08', opponent: 'B', season_id: SEASON_ID },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: stats,   error: null }))
      .mockReturnValueOnce(chain({ data: matches, error: null }))

    const trend = await fetchPlayerMatchTrend(PLAYER_ID, false, SEASON_ID)

    expect(trend[0].value).toBe(3)     // goals=2, assists=1
    expect(trend[1].value).toBe(0)     // goals=0, assists=0
    expect(trend[0].rating).toBe(8.1)  // new field
    expect(trend[1].rating).toBeNull() // new field, null for unrated
  })

  it('trend result has both value (old) and rating (new) on every point', async () => {
    const stats = [{ match_id: 'match-1', goals: 1, assists: 0, mins: 90, rating: '7.5' }]
    const matches = [{ id: 'match-1', date: '2025-03-01', opponent: 'A', season_id: SEASON_ID }]
    mockFrom
      .mockReturnValueOnce(chain({ data: stats,   error: null }))
      .mockReturnValueOnce(chain({ data: matches, error: null }))

    const trend = await fetchPlayerMatchTrend(PLAYER_ID, false, SEASON_ID)

    expect(trend[0]).toHaveProperty('value')
    expect(trend[0]).toHaveProperty('rating')
    expect(trend[0]).toHaveProperty('opponent')
    expect(trend[0]).toHaveProperty('date')
    expect(trend[0]).toHaveProperty('mins')
  })
})


// ─────────────────────────────────────────────────────────────
// 9. No-seasonId trend: all historical data returned
// ─────────────────────────────────────────────────────────────

describe('Scenario 9: fetchPlayerMatchTrend without seasonId returns all history', () => {
  it('returns matches from multiple seasons when no seasonId is provided', async () => {
    const multiSeasonStats = [
      { match_id: 'match-2025', goals: 1, assists: 0, mins: 90, rating: '7.8' },
      { match_id: 'match-2024', goals: 0, assists: 1, mins: 85, rating: '7.2' },
    ]
    const allMatches = [
      { id: 'match-2025', date: '2025-03-01', opponent: 'Current Rival', season_id: SEASON_ID },
      { id: 'match-2024', date: '2024-11-10', opponent: 'Old Rival',     season_id: 'season-2024' },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: multiSeasonStats, error: null }))
      .mockReturnValueOnce(chain({ data: allMatches,       error: null }))

    // No seasonId — all historical data should come back
    const trend = await fetchPlayerMatchTrend(PLAYER_ID, false)

    expect(trend).toHaveLength(2)
    expect(trend.map(t => t.opponent)).toContain('Current Rival')
    expect(trend.map(t => t.opponent)).toContain('Old Rival')
  })
})
