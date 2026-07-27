// TDD CONTRACT — lib/queries.ts (new + modified functions)
//
// These tests define the contract for:
//   - fetchSeasons()            [new]
//   - fetchPlayerMatchLog()     [new]
//   - fetchRoster(seasonId?)    [modified — season-aware]
//   - fetchPlayerMatchTrend()   [modified — adds rating field + season param]
//
// Every test FAILS right now because:
//   1. fetchSeasons, fetchPlayerMatchLog are not yet exported from queries.ts
//   2. DBPlayerMatchStats / DBGoalkeeperMatchStats have no `rating` column
//   3. DBMatch has no `season_id` column
//   4. fetchRoster ignores seasonId and uses `active=true` only
//   5. MatchLogRow type does not exist yet
//
// Run: npm test

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchSeasons,
  fetchActiveSeason,
  fetchClubBranding,
  fetchShopCarouselPhotos,
  fetchShopKitContent,
  fetchShopPurchaseDetails,
  fetchSiteSocialLinks,
  fetchSchedule,
  fetchPlayerMatchLog,
  fetchRoster,
  fetchPlayerMatchTrend,
  type MatchLogRow,
} from '@/lib/queries'

// ─────────────────────────────────────────────────────────────
// Supabase mock
// Creates a chainable query builder that resolves to { data, error }.
// Each method returns `this` so .select().eq().gt() chains work.
// The object is made thenable so `await supabase.from(...).select(...)` works.
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
  for (const m of ['select','eq','neq','in','gt','lt','gte','lte','order',
                    'limit','single','not','is','filter']) {
    q[m] = vi.fn().mockReturnValue(q)
  }
  q.then    = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  q.catch   = (rej: (e: unknown) => unknown) => Promise.resolve(result).catch(rej)
  q.finally = (fn: () => void) => Promise.resolve(result).finally(fn)
  return q
}

beforeEach(() => { vi.clearAllMocks() })

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const SEASON_ID   = 'season-2025'
const PLAYER_ID   = 'player-abc'
const MATCH_ID_1  = 'match-001'
const MATCH_ID_2  = 'match-002'

const dbSeasons = [
  { id: 'season-2025', label: '2025–26', start_year: 2025, end_year: 2026, active: true,  created_at: '2025-01-01' },
  { id: 'season-2024', label: '2024–25', start_year: 2024, end_year: 2025, active: false, created_at: '2024-01-01' },
]

const dbMatchStats = [
  { match_id: MATCH_ID_1, mins: 90, goals: 2, assists: 0, tackles: 1,
    offsides: 0, fouls: 1, fouls_suffered: 2, yellow: 0, red: 0,
    starts: true, rating: '7.8' },          // PostgREST returns NUMERIC as string
  { match_id: MATCH_ID_2, mins: 78, goals: 0, assists: 1, tackles: 3,
    offsides: 1, fouls: 2, fouls_suffered: 0, yellow: 1, red: 0,
    starts: true, rating: null },            // unrated match
]

const dbMatches = [
  { id: MATCH_ID_1, date: '2025-03-01', opponent: 'NW United',  season_id: SEASON_ID },
  { id: MATCH_ID_2, date: '2025-03-15', opponent: 'PDX Thorns', season_id: SEASON_ID },
  { id: 'match-other-season', date: '2024-11-01', opponent: 'Old Rival', season_id: 'season-2024' },
]

// ─────────────────────────────────────────────────────────────
// fetchSeasons
// ─────────────────────────────────────────────────────────────

describe('fetchSeasons', () => {
  it('returns all seasons ordered newest first', async () => {
    mockFrom.mockReturnValue(chain({ data: dbSeasons, error: null }))

    const result = await fetchSeasons()

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('season-2025')
    expect(result[1].id).toBe('season-2024')
  })

  it('returns an empty array when no seasons exist', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))

    const result = await fetchSeasons()

    expect(result).toEqual([])
  })

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'DB connection failed' } }))

    await expect(fetchSeasons()).rejects.toThrow('DB connection failed')
  })

  it('queries the seasons table ordered by start_year descending', async () => {
    const q = chain({ data: dbSeasons, error: null })
    mockFrom.mockReturnValue(q)

    await fetchSeasons()

    expect(mockFrom).toHaveBeenCalledWith('seasons')
    expect(q.order).toHaveBeenCalledWith('start_year', { ascending: false })
  })
})

describe('fetchActiveSeason', () => {
  it('returns the active season row', async () => {
    mockFrom.mockReturnValue(chain({ data: [dbSeasons[0]], error: null }))

    const result = await fetchActiveSeason()

    expect(result).toEqual(dbSeasons[0])
  })

  it('returns null when no active season exists', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))

    await expect(fetchActiveSeason()).resolves.toBeNull()
  })

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'active season failed' } }))

    await expect(fetchActiveSeason()).rejects.toThrow('active season failed')
  })
})

describe('fetchClubBranding', () => {
  it('returns the saved club logo path', async () => {
    const row = {
      id: 1,
      club_logo_path: 'club-branding/new-crest.png',
      updated_at: '2026-07-16T00:00:00Z',
    }
    const q = chain({ data: [row], error: null })
    mockFrom.mockReturnValue(q)

    await expect(fetchClubBranding()).resolves.toEqual({
      logoPath: 'club-branding/new-crest.png',
    })
    expect(mockFrom).toHaveBeenCalledWith('site_branding')
    expect(q.eq).toHaveBeenCalledWith('id', 1)
  })

  it('uses the shipped crest when no branding row exists', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))

    await expect(fetchClubBranding()).resolves.toEqual({
      logoPath: 'Rose City FC Patch Color.png',
    })
  })

  it('throws with context when the branding query fails', async () => {
    mockFrom.mockReturnValue(chain({
      data: null,
      error: { message: 'branding unavailable' },
    }))

    await expect(fetchClubBranding())
      .rejects.toThrow('fetchClubBranding: branding unavailable')
  })
})

describe('fetchShopKitContent', () => {
  const section = {
    id: 1,
    surface: 'home',
    kit_variant: 'home',
    eyebrow: '2026 Kit · Available Now',
    title: 'Thorn\nEdition\n2026',
    description: 'Official kit',
    bullet_points: ['Authentic match jersey', 'Any name & number'],
    store_note: "Sold at Niky's Sports\nPasadena, CA",
    cta_label: 'Buy Now →',
    cta_link: 'https://example.com',
    updated_at: '2026-07-16T00:00:00Z',
  }
  const photos = [
    {
      id: 'photo-a',
      surface: 'home',
      kit_variant: 'home',
      url: 'a.jpg',
      sort_order: 0,
      created_at: '2026-07-16T00:00:00Z',
    },
    {
      id: 'photo-b',
      surface: 'home',
      kit_variant: 'home',
      url: 'b.jpg',
      sort_order: 1,
      created_at: '2026-07-16T00:00:00Z',
    },
  ]

  it('returns the homepage section and ordered photos by default', async () => {
    const sectionQuery = chain({ data: [section], error: null })
    const photosQuery = chain({ data: photos, error: null })
    mockFrom
      .mockReturnValueOnce(sectionQuery)
      .mockReturnValueOnce(photosQuery)

    await expect(fetchShopKitContent()).resolves.toEqual({ section, photos })
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'shop_kit_section')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'shop_kit_photos')
    expect(sectionQuery.eq).toHaveBeenCalledWith('surface', 'home')
    expect(sectionQuery.eq).toHaveBeenCalledWith('kit_variant', 'home')
    expect(sectionQuery.limit).toHaveBeenCalledWith(1)
    expect(photosQuery.eq).toHaveBeenCalledWith('surface', 'home')
    expect(photosQuery.eq).toHaveBeenCalledWith('kit_variant', 'home')
    expect(photosQuery.order).toHaveBeenCalledWith('sort_order', { ascending: true })
  })

  it('scopes both queries to the requested shop-page away kit', async () => {
    const shopSection = { ...section, id: 4, surface: 'shop', kit_variant: 'away' }
    const shopPhotos = photos.map((photo) => ({
      ...photo,
      surface: 'shop',
      kit_variant: 'away',
    }))
    const sectionQuery = chain({ data: [shopSection], error: null })
    const photosQuery = chain({ data: shopPhotos, error: null })
    mockFrom
      .mockReturnValueOnce(sectionQuery)
      .mockReturnValueOnce(photosQuery)

    await expect(fetchShopKitContent('shop', 'away')).resolves.toEqual({
      section: shopSection,
      photos: shopPhotos,
    })
    expect(sectionQuery.eq).toHaveBeenCalledWith('surface', 'shop')
    expect(sectionQuery.eq).toHaveBeenCalledWith('kit_variant', 'away')
    expect(photosQuery.eq).toHaveBeenCalledWith('surface', 'shop')
    expect(photosQuery.eq).toHaveBeenCalledWith('kit_variant', 'away')
  })

  it('returns an empty content shape when both tables are empty', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))

    await expect(fetchShopKitContent()).resolves.toEqual({ section: null, photos: [] })
  })

  it('uses the current bullet points and store note for a legacy row', async () => {
    const { bullet_points: _bullets, store_note: _storeNote, ...legacySection } = section
    mockFrom
      .mockReturnValueOnce(chain({ data: [legacySection], error: null }))
      .mockReturnValueOnce(chain({ data: photos, error: null }))

    const result = await fetchShopKitContent()

    expect(result.section?.bullet_points).toEqual([
      'Authentic match jersey',
      'Any name & number',
      'League patch',
      'Team sponsor badges',
      'Raffle ticket included',
      'Custom name + $10',
    ])
    expect(result.section?.store_note).toBe(
      "Sold exclusively at Niky's Sports\n33 E Colorado Blvd, Pasadena, CA",
    )
  })

  it('throws with context when the section query fails', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: null, error: { message: 'section unavailable' } }))
      .mockReturnValueOnce(chain({ data: [], error: null }))

    await expect(fetchShopKitContent())
      .rejects.toThrow('fetchShopKitContent: section unavailable')
  })

  it('throws with context when the photos query fails', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [section], error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'photos unavailable' } }))

    await expect(fetchShopKitContent())
      .rejects.toThrow('fetchShopKitContent: photos unavailable')
  })
})

describe('fetchShopCarouselPhotos', () => {
  const photos = [
    {
      id: 'strip-a',
      kit_variant: 'away',
      url: 'away-a.jpg',
      sort_order: 0,
      created_at: '2026-07-24T00:00:00Z',
    },
    {
      id: 'strip-b',
      kit_variant: 'away',
      url: 'away-b.jpg',
      sort_order: 1,
      created_at: '2026-07-24T00:00:00Z',
    },
  ]

  it('fetches the home photo row by default', async () => {
    const query = chain({ data: [], error: null })
    mockFrom.mockReturnValue(query)

    await expect(fetchShopCarouselPhotos()).resolves.toEqual([])
    expect(mockFrom).toHaveBeenCalledWith('shop_carousel_photos')
    expect(query.eq).toHaveBeenCalledWith('kit_variant', 'home')
    expect(query.order).toHaveBeenCalledWith('sort_order', { ascending: true })
  })

  it('scopes photo row reads to the selected shop kit variant', async () => {
    const query = chain({ data: photos, error: null })
    mockFrom.mockReturnValue(query)

    await expect(fetchShopCarouselPhotos('away')).resolves.toEqual(photos)
    expect(query.eq).toHaveBeenCalledWith('kit_variant', 'away')
    expect(query.order).toHaveBeenCalledWith('sort_order', { ascending: true })
  })

  it('throws with context when the photo row query fails', async () => {
    mockFrom.mockReturnValue(chain({
      data: null,
      error: { message: 'photo row unavailable' },
    }))

    await expect(fetchShopCarouselPhotos('home'))
      .rejects.toThrow('fetchShopCarouselPhotos: photo row unavailable')
  })
})

describe('fetchShopPurchaseDetails', () => {
  const purchaseDetails = {
    id: 1,
    heading: 'Purchase Details',
    cards: [
      {
        label: "What's Included",
        title: 'Match jersey package',
        body: 'Authentic jersey package.',
      },
    ],
    cta_eyebrow: 'Ready To Order',
    cta_text: "Buy online now or stop by Niky's Sports in Pasadena.",
    cta_label: 'Buy Now →',
    cta_link: 'https://example.com/buy',
    updated_at: '2026-07-24T00:00:00Z',
  }

  it('returns the singleton purchase-details row', async () => {
    const query = chain({ data: [purchaseDetails], error: null })
    mockFrom.mockReturnValueOnce(query)

    await expect(fetchShopPurchaseDetails()).resolves.toEqual(purchaseDetails)
    expect(mockFrom).toHaveBeenCalledWith('shop_purchase_details')
    expect(query.eq).toHaveBeenCalledWith('id', 1)
    expect(query.limit).toHaveBeenCalledWith(1)
  })

  it('falls back to default purchase details when the table is empty', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [], error: null }))

    const result = await fetchShopPurchaseDetails()

    expect(result.heading).toBe('Purchase Details')
    expect(result.cards).toHaveLength(4)
    expect(result.cta_label).toBe('Buy Now →')
  })

  it('throws with context when the query fails', async () => {
    mockFrom.mockReturnValueOnce(chain({
      data: null,
      error: { message: 'purchase unavailable' },
    }))

    await expect(fetchShopPurchaseDetails())
      .rejects.toThrow('fetchShopPurchaseDetails: purchase unavailable')
  })
})

describe('fetchSiteSocialLinks', () => {
  it('returns normalized social links in footer order', async () => {
    const query = chain({
      data: [
        {
          id: 'instagram',
          label: 'Instagram',
          href: 'https://example.com/instagram',
          icon: '/images/logo/instagramLogo.svg',
          sort_order: 0,
          updated_at: '2026-07-24T00:00:00Z',
        },
      ],
      error: null,
    })
    mockFrom.mockReturnValueOnce(query)

    const result = await fetchSiteSocialLinks()

    expect(mockFrom).toHaveBeenCalledWith('site_social_links')
    expect(query.order).toHaveBeenCalledWith('sort_order', { ascending: true })
    expect(result).toHaveLength(5)
    expect(result[0].href).toBe('https://example.com/instagram')
    expect(result[1].id).toBe('facebook')
  })

  it('falls back to default social links when the query fails', async () => {
    mockFrom.mockReturnValueOnce(chain({
      data: null,
      error: { message: 'social links unavailable' },
    }))

    const result = await fetchSiteSocialLinks()

    expect(result).toHaveLength(5)
    expect(result[0].id).toBe('instagram')
    expect(result[0].href).toContain('instagram.com')
  })
})

describe('fetchSchedule sponsor mapping', () => {
  it('maps optional per-match sponsor fields into the public fixture model', async () => {
    mockFrom.mockReturnValue(chain({
      data: [{
        id: 'match-sponsored',
        date: '2027-03-10',
        time: '19:00',
        opponent: 'Pasadena Athletic',
        opponent_logo_url: 'opponent.png',
        competition: null,
        sponsor_name: 'Tepito Coffee',
        sponsor_logo_url: 'tepito.png',
        sponsor_link: 'https://example.com/tepito',
        home: true,
        venue: 'Rose City Stadium',
        address: null,
        rose_city_score: 2,
        opponent_score: 1,
        season_id: 'season-2027',
      }],
      error: null,
    }))

    await expect(fetchSchedule()).resolves.toEqual([{
      date: '2027-03-10',
      time: '19:00',
      opponent: 'Pasadena Athletic',
      opponentLogoUrl: 'opponent.png',
      competition: null,
      sponsorName: 'Tepito Coffee',
      sponsorLogoUrl: 'tepito.png',
      sponsorLink: 'https://example.com/tepito',
      home: true,
      venue: 'Rose City Stadium',
      address: undefined,
      roseCityScore: 2,
      opponentScore: 1,
    }])
  })
})

// ─────────────────────────────────────────────────────────────
// fetchPlayerMatchLog
// ─────────────────────────────────────────────────────────────

describe('fetchPlayerMatchLog', () => {
  it('happy path: returns MatchLogRow[] sorted by date ascending', async () => {
    // First call → player_match_stats, second call → matches
    mockFrom
      .mockReturnValueOnce(chain({ data: dbMatchStats, error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches,    error: null }))

    const result = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(result).toHaveLength(2)
    expect(result[0].date).toBe('2025-03-01')
    expect(result[1].date).toBe('2025-03-15')
  })

  it('coerces rating from PostgREST string "7.8" to number 7.8', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: dbMatchStats, error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches,    error: null }))

    const result = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(typeof result[0].rating).toBe('number')
    expect(result[0].rating).toBe(7.8)
  })

  it('preserves null rating for unrated matches', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: dbMatchStats, error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches,    error: null }))

    const result = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(result[1].rating).toBeNull()
  })

  it('excludes matches from other seasons', async () => {
    const statsWithExtraMatch = [
      ...dbMatchStats,
      { match_id: 'match-other-season', mins: 90, goals: 1, assists: 0,
        tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0,
        yellow: 0, red: 0, starts: true, rating: '8.0' },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: statsWithExtraMatch, error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches,           error: null }))

    const result = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    // match-other-season belongs to season-2024 — must not appear
    expect(result).toHaveLength(2)
    expect(result.map(r => r.matchId)).not.toContain('match-other-season')
  })

  it('returns an empty array when the player has no match stats', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [],        error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches, error: null }))

    const result = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(result).toEqual([])
  })

  it('filters out stat rows whose match_id is not in the matches table', async () => {
    const statsWithOrphan = [
      ...dbMatchStats,
      { match_id: 'ghost-match', mins: 90, goals: 1, assists: 0,
        tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0,
        yellow: 0, red: 0, starts: true, rating: '7.0' },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: statsWithOrphan, error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches,       error: null }))

    const result = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(result).toHaveLength(2)
    expect(result.map(r => r.matchId)).not.toContain('ghost-match')
  })

  it('throws when the stats query returns an error', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: null, error: { message: 'permission denied' } }))
      .mockReturnValueOnce(chain({ data: dbMatches, error: null }))

    await expect(fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID))
      .rejects.toThrow('permission denied')
  })

  it('throws when the matches query returns an error', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: dbMatchStats, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'matches unavailable' } }))

    await expect(fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID))
      .rejects.toThrow('matches unavailable')
  })

  it('uses goalkeeper_match_stats table when gk=true', async () => {
    const gkStats = [
      { match_id: MATCH_ID_1, mins: 90, goals_against: 1, saves: 4,
        clean_sheets: 0, yellow: 0, red: 0, starts: true, rating: '7.2' },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: gkStats,   error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches, error: null }))

    await fetchPlayerMatchLog(PLAYER_ID, true, SEASON_ID)

    expect(mockFrom).toHaveBeenCalledWith('goalkeeper_match_stats')
  })

  // ── Gap coverage ──────────────────────────────

  it('GK match log returns goals=0 and assists=0 regardless of DB stats', async () => {
    const gkStats = [
      { match_id: MATCH_ID_1, mins: 90, goals_against: 3, saves: 6,
        clean_sheets: 0, yellow: 0, red: 0, starts: true, rating: '7.0' },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: gkStats,   error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches, error: null }))

    const result = await fetchPlayerMatchLog(PLAYER_ID, true, SEASON_ID)

    expect(result[0].goals).toBe(0)
    expect(result[0].assists).toBe(0)
  })

  it('excludes matches where season_id is null', async () => {
    const matchesWithNull = [
      ...dbMatches,
      { id: 'match-null-season', date: '2025-04-01', opponent: 'Mystery', season_id: null },
    ]
    const statsWithNull = [
      ...dbMatchStats,
      { match_id: 'match-null-season', mins: 90, goals: 1, assists: 0,
        tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0,
        yellow: 0, red: 0, starts: true, rating: '8.0' },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: statsWithNull,   error: null }))
      .mockReturnValueOnce(chain({ data: matchesWithNull, error: null }))

    const result = await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(result.map(r => r.matchId)).not.toContain('match-null-season')
    expect(result).toHaveLength(2)
  })

  it('passes player_id eq filter to the stats query', async () => {
    const q = chain({ data: [], error: null })
    mockFrom
      .mockReturnValueOnce(q)
      .mockReturnValueOnce(chain({ data: dbMatches, error: null }))

    await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(q.eq).toHaveBeenCalledWith('player_id', PLAYER_ID)
  })

  it('passes gt mins=0 filter to the stats query to exclude non-appearances', async () => {
    const q = chain({ data: [], error: null })
    mockFrom
      .mockReturnValueOnce(q)
      .mockReturnValueOnce(chain({ data: dbMatches, error: null }))

    await fetchPlayerMatchLog(PLAYER_ID, false, SEASON_ID)

    expect(q.gt).toHaveBeenCalledWith('mins', 0)
  })
})

// ─────────────────────────────────────────────────────────────
// fetchRoster — season-aware
// ─────────────────────────────────────────────────────────────

describe('fetchRoster (season-aware)', () => {
  const activeSeason  = dbSeasons[0]
  const historicalSeason = dbSeasons[1]

  const activePlayer = {
    id: 'player-active', number: 10, name: 'Marcus Rivera',
    position: 'Forward' as const, active: true,
    nationality: '🇺🇸', height: "5'11", weight: '175 lbs',
    hometown: 'LA', age: 24, caption: null, school: null,
    previous_club: null, photo_url: '/img/p1.webp', bio: null,
    pronunciation: null, foot: null,
  }
  const inactivePlayer = {
    ...activePlayer, id: 'player-inactive', name: 'Old Player', active: false,
  }

  const fieldSeasonStats = [{ player_id: 'player-active', goals: 12, assists: 8,
    tackles: 5, starts: 18, yellow: 1, red: 0, mins: 1620,
    offsides: 2, fouls: 8, fouls_suffered: 10, season_id: activeSeason.id }]

  const historicalStats = [{ player_id: 'player-inactive', goals: 7, assists: 3,
    tackles: 4, starts: 12, yellow: 2, red: 0, mins: 1080,
    offsides: 1, fouls: 5, fouls_suffered: 6, season_id: historicalSeason.id }]

  it('includes a historically inactive player who has stats for the selected season', async () => {
    // historical season: only inactivePlayer has stats
    mockFrom
      .mockReturnValueOnce(chain({ data: [activeSeason, historicalSeason], error: null })) // seasons
      .mockReturnValueOnce(chain({ data: historicalStats, error: null }))  // player_season_stats
      .mockReturnValueOnce(chain({ data: [], error: null }))               // goalkeeper_season_stats
      .mockReturnValueOnce(chain({ data: [inactivePlayer], error: null })) // players (by id, no active filter)
      .mockReturnValueOnce(chain({ data: [], error: null }))               // player_photos

    const result = await fetchRoster(historicalSeason.id)
    const allPlayers = [
      ...result.goalkeepers, ...result.defenders,
      ...result.midfielders, ...result.forwards,
    ]

    expect(allPlayers.some(p => p.id === 'player-inactive')).toBe(true)
  })

  it('does NOT fetch players by active=true for a historical season', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: dbSeasons,      error: null }))
      .mockReturnValueOnce(chain({ data: historicalStats, error: null }))
      .mockReturnValueOnce(chain({ data: [],             error: null }))
      .mockReturnValueOnce(chain({ data: [inactivePlayer], error: null }))
      .mockReturnValueOnce(chain({ data: [],             error: null }))

    const playersChain = { ...chain({ data: [inactivePlayer], error: null }), eq: vi.fn() } as Record<string, unknown>
    playersChain.eq = vi.fn().mockReturnValue(chain({ data: [inactivePlayer], error: null }))
    // We assert .eq("active", true) is NOT called when a seasonId is provided
    mockFrom.mockImplementation((table: string) => {
      if (table === 'players') return playersChain
      return chain({ data: [], error: null })
    })

    await fetchRoster(historicalSeason.id)

    // The players query must NOT be filtered by active when a seasonId is given
    expect(playersChain.eq).not.toHaveBeenCalledWith('active', true)
  })

  it('returns the correct seasonLabel for the selected season', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: dbSeasons,        error: null }))
      .mockReturnValueOnce(chain({ data: fieldSeasonStats, error: null }))
      .mockReturnValueOnce(chain({ data: [],               error: null }))
      .mockReturnValueOnce(chain({ data: [activePlayer],   error: null }))
      .mockReturnValueOnce(chain({ data: [],               error: null }))

    const result = await fetchRoster(activeSeason.id)
    expect(result.seasonLabel).toBe('2025–26')
  })

  it('returns empty position arrays when no players have stats for the season', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: dbSeasons, error: null }))
      .mockReturnValueOnce(chain({ data: [],        error: null })) // no field stats
      .mockReturnValueOnce(chain({ data: [],        error: null })) // no gk stats
      .mockReturnValueOnce(chain({ data: [],        error: null })) // no player rows
      .mockReturnValueOnce(chain({ data: [],        error: null }))

    const result = await fetchRoster(historicalSeason.id)
    expect(result.goalkeepers).toEqual([])
    expect(result.defenders).toEqual([])
    expect(result.midfielders).toEqual([])
    expect(result.forwards).toEqual([])
  })

  it('falls back to the active season when no seasonId is provided', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [activeSeason], error: null })) // active season lookup
      .mockReturnValueOnce(chain({ data: fieldSeasonStats, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [activePlayer], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))

    const result = await fetchRoster()   // no seasonId
    expect(result.seasonId).toBe(activeSeason.id)
  })

  it('excludes a deactivated player from the active season even when their season stats remain', async () => {
    const activeAndInactiveStats = [
      fieldSeasonStats[0],
      { ...fieldSeasonStats[0], player_id: inactivePlayer.id },
    ]

    mockFrom
      .mockReturnValueOnce(chain({ data: [activeSeason], error: null }))
      .mockReturnValueOnce(chain({ data: activeAndInactiveStats, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [activePlayer, inactivePlayer], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))

    const result = await fetchRoster()
    const allPlayers = [
      ...result.goalkeepers, ...result.defenders,
      ...result.midfielders, ...result.forwards,
    ]

    expect(allPlayers.map((player) => player.id)).toEqual([activePlayer.id])
  })

  it('supports the full active → inactive → active lifecycle without deleting season membership', async () => {
    const seededStats = [{ ...fieldSeasonStats[0], goals: 0, assists: 0 }]
    const deactivatedPlayer = { ...activePlayer, active: false }

    mockFrom
      // Newly added/active player with a seeded season row.
      .mockReturnValueOnce(chain({ data: [activeSeason], error: null }))
      .mockReturnValueOnce(chain({ data: seededStats, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [activePlayer], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      // Deactivation retains the same season row but hides the player.
      .mockReturnValueOnce(chain({ data: [activeSeason], error: null }))
      .mockReturnValueOnce(chain({ data: seededStats, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [deactivatedPlayer], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      // Reactivation uses the retained row and shows the player again.
      .mockReturnValueOnce(chain({ data: [activeSeason], error: null }))
      .mockReturnValueOnce(chain({ data: seededStats, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [activePlayer], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))

    const added = await fetchRoster()
    const deactivated = await fetchRoster()
    const reactivated = await fetchRoster()

    expect(added.forwards.map((player) => player.id)).toEqual([activePlayer.id])
    expect(deactivated.forwards).toEqual([])
    expect(reactivated.forwards.map((player) => player.id)).toEqual([activePlayer.id])
  })

  it('includes a previously inactive player after activation seeds active-season membership', async () => {
    const reactivatedPlayer = { ...inactivePlayer, active: true }
    const seededStats = [{ ...fieldSeasonStats[0], player_id: inactivePlayer.id, goals: 0, assists: 0 }]

    mockFrom
      .mockReturnValueOnce(chain({ data: [activeSeason], error: null }))
      .mockReturnValueOnce(chain({ data: seededStats, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [reactivatedPlayer], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))

    const result = await fetchRoster()

    expect(result.forwards.map((player) => player.id)).toEqual([inactivePlayer.id])
  })
})

// ─────────────────────────────────────────────────────────────
// fetchPlayerMatchTrend — extended with rating + season param
// ─────────────────────────────────────────────────────────────

describe('fetchPlayerMatchTrend (extended)', () => {
  const trendStats = [
    { match_id: MATCH_ID_1, goals: 2, assists: 0, mins: 90, rating: '7.8' },
    { match_id: MATCH_ID_2, goals: 0, assists: 1, mins: 78, rating: null },
  ]

  it('includes a rating field (number | null) on each trend point', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: trendStats, error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches,  error: null }))

    const result = await fetchPlayerMatchTrend(PLAYER_ID, false, SEASON_ID)

    expect(result[0]).toHaveProperty('rating')
    expect(result[0].rating).toBe(7.8)
    expect(result[1].rating).toBeNull()
  })

  it('coerces rating from string to number', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: trendStats, error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches,  error: null }))

    const result = await fetchPlayerMatchTrend(PLAYER_ID, false, SEASON_ID)

    expect(typeof result[0].rating).toBe('number')
  })

  it('still returns value (G+A) for backward compat with TrendLine component', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: trendStats, error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches,  error: null }))

    const result = await fetchPlayerMatchTrend(PLAYER_ID, false, SEASON_ID)

    expect(result[0].value).toBe(2)  // goals=2, assists=0
    expect(result[1].value).toBe(1)  // goals=0, assists=1
  })

  it('returns only matches for the provided season', async () => {
    const statsAllSeasons = [
      ...trendStats,
      { match_id: 'match-other-season', goals: 1, assists: 0, mins: 90, rating: '8.0' },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: statsAllSeasons, error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches,       error: null }))

    const result = await fetchPlayerMatchTrend(PLAYER_ID, false, SEASON_ID)

    expect(result).toHaveLength(2)
    expect(result.map(r => r.opponent)).not.toContain('Old Rival')
  })

  it('returns an empty array for a brand-new player with no match appearances', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [],        error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches, error: null }))

    const result = await fetchPlayerMatchTrend('new-player-id', false, SEASON_ID)

    expect(result).toEqual([])
  })

  // ── Gap coverage ──────────────────────────────

  it('uses goalkeeper_match_stats and value=saves when gk=true', async () => {
    const gkTrend = [
      { match_id: MATCH_ID_1, saves: 5, mins: 90, rating: '7.8' },
      { match_id: MATCH_ID_2, saves: 2, mins: 90, rating: null  },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: gkTrend,   error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches, error: null }))

    const result = await fetchPlayerMatchTrend(PLAYER_ID, true, SEASON_ID)

    expect(mockFrom).toHaveBeenCalledWith('goalkeeper_match_stats')
    expect(result[0].value).toBe(5)   // saves, not goals+assists
    expect(result[1].value).toBe(2)
  })

  it('returns matches from all seasons when no seasonId is provided', async () => {
    const allSeasonStats = [
      { match_id: MATCH_ID_1,         goals: 1, assists: 0, mins: 90, rating: '8.0' },
      { match_id: 'match-other-season', goals: 0, assists: 1, mins: 85, rating: '7.0' },
    ]
    mockFrom
      .mockReturnValueOnce(chain({ data: allSeasonStats, error: null }))
      .mockReturnValueOnce(chain({ data: dbMatches,      error: null }))

    // No seasonId — should return matches from all seasons
    const result = await fetchPlayerMatchTrend(PLAYER_ID, false)

    expect(result).toHaveLength(2)
    expect(result.map(r => r.opponent)).toContain('Old Rival')  // match-other-season
  })
})
