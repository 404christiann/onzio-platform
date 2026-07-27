// TDD CONTRACT — analytics-helpers.ts
//
// These tests define the contract for lib/analytics-helpers.ts.
// The file does not exist yet — every test in this suite will FAIL until
// the helpers are implemented.
//
// Covers: hasEnoughRatings, coerceRating, buildFieldRadarData, buildGKRadarData

import { describe, it, expect } from 'vitest'
import {
  hasEnoughRatings,
  coerceRating,
  buildFieldRadarData,
  buildGKRadarData,
} from '@/lib/analytics-helpers'
import type { MatchLogRow } from '@/lib/queries'
import type { FieldStats, GoalkeeperStats } from '@/lib/data'

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<MatchLogRow> = {}): MatchLogRow {
  return {
    matchId:  'match-1',
    date:     '2025-03-15',
    opponent: 'NW United',
    mins:     90,
    goals:    1,
    assists:  0,
    rating:   7.5,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────
// hasEnoughRatings
// ─────────────────────────────────────────────────────────────

describe('hasEnoughRatings', () => {
  it('returns true when rated matches equal the default threshold of 3', () => {
    const rows = [
      makeRow({ rating: 7.0 }),
      makeRow({ rating: 8.1 }),
      makeRow({ rating: 6.5 }),
    ]
    expect(hasEnoughRatings(rows)).toBe(true)
  })

  it('returns false when fewer than 3 matches have a rating', () => {
    const rows = [makeRow({ rating: 7.0 }), makeRow({ rating: 8.1 })]
    expect(hasEnoughRatings(rows)).toBe(false)
  })

  it('returns false for an empty array', () => {
    expect(hasEnoughRatings([])).toBe(false)
  })

  it('returns false when all ratings are null', () => {
    const rows = [
      makeRow({ rating: null }),
      makeRow({ rating: null }),
      makeRow({ rating: null }),
      makeRow({ rating: null }),
    ]
    expect(hasEnoughRatings(rows)).toBe(false)
  })

  it('counts only non-null ratings toward the threshold', () => {
    // 2 rated, 5 unrated — should still be false at default threshold of 3
    const rows = [
      makeRow({ rating: 7.0 }),
      makeRow({ rating: null }),
      makeRow({ rating: null }),
      makeRow({ rating: null }),
      makeRow({ rating: null }),
      makeRow({ rating: null }),
      makeRow({ rating: 8.1 }),
    ]
    expect(hasEnoughRatings(rows)).toBe(false)
  })

  it('respects a custom minimum threshold', () => {
    const rows = [makeRow({ rating: 7.0 })]
    expect(hasEnoughRatings(rows, 1)).toBe(true)
    expect(hasEnoughRatings(rows, 2)).toBe(false)
  })

  it('treats exactly threshold as passing (boundary)', () => {
    const rows = Array.from({ length: 3 }, () => makeRow({ rating: 7.5 }))
    expect(hasEnoughRatings(rows, 3)).toBe(true)
    expect(hasEnoughRatings(rows, 4)).toBe(false)
  })

  it('rating of 0 is non-null and counts toward the threshold', () => {
    const rows = [
      makeRow({ rating: 0 }),
      makeRow({ rating: 0 }),
      makeRow({ rating: 0 }),
    ]
    expect(hasEnoughRatings(rows)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// coerceRating
// PostgREST serializes NUMERIC columns as JSON strings — "7.5", not 7.5.
// coerceRating must safely convert the raw DB value to number | null.
// ─────────────────────────────────────────────────────────────

describe('coerceRating', () => {
  it('converts a string "7.5" to the number 7.5', () => {
    expect(coerceRating('7.5')).toBe(7.5)
  })

  it('converts an integer string "8" to 8', () => {
    expect(coerceRating('8')).toBe(8)
  })

  it('returns the number as-is when already a number', () => {
    expect(coerceRating(7.5)).toBe(7.5)
    expect(coerceRating(0)).toBe(0)
    expect(coerceRating(10)).toBe(10)
  })

  it('returns null for null input', () => {
    expect(coerceRating(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(coerceRating(undefined)).toBeNull()
  })

  it('returns null for a non-numeric string', () => {
    expect(coerceRating('not-a-number')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(coerceRating('')).toBeNull()
  })

  it('rejects values outside 0–10 range and returns null', () => {
    expect(coerceRating(10.1)).toBeNull()
    expect(coerceRating(-0.1)).toBeNull()
    expect(coerceRating('11')).toBeNull()
  })

  // ── Gap coverage ──────────────────────────────

  it('returns 0 for a rating of exactly 0 — valid lower boundary, must not be treated as null', () => {
    expect(coerceRating(0)).toBe(0)
    expect(coerceRating('0')).toBe(0)
  })

  it('returns null for Infinity and -Infinity', () => {
    expect(coerceRating(Infinity)).toBeNull()
    expect(coerceRating(-Infinity)).toBeNull()
  })

  it('returns null for NaN (the number, not string)', () => {
    expect(coerceRating(NaN)).toBeNull()
  })

  it('returns null for non-primitive inputs — Number([]) is 0 and Number([7.5]) is 7.5 without the guard', () => {
    expect(coerceRating([])).toBeNull()
    expect(coerceRating([7.5])).toBeNull()   // would silently return 7.5 without typeof guard
    expect(coerceRating({})).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────
// buildFieldRadarData
// Derives normalised radar values (0–100) from season aggregate
// stats relative to position peers.  Extracted from the inline
// useMemo in analytics/page.tsx so it can be tested.
// ─────────────────────────────────────────────────────────────

describe('buildFieldRadarData', () => {
  const makeField = (overrides: Partial<FieldStats> = {}): FieldStats => ({
    goals: 5, assists: 3, tackles: 10, starts: 10,
    yellow: 0, red: 0, mins: 900,
    offsides: 1, fouls: 4, foulsSuffered: 6,
    ...overrides,
  })

  it('returns the five expected radar labels for field players', () => {
    const player = makeField()
    const peers  = [player, makeField({ goals: 2, assists: 1 })]
    const result = buildFieldRadarData(player, peers)
    expect(result.labels).toEqual(['Scoring', 'Creativity', 'Defending', 'Stamina', 'Discipline'])
  })

  it('normalises the top scorer to 100 on the Scoring axis', () => {
    const topScorer  = makeField({ goals: 10 })
    const lowScorer  = makeField({ goals: 2 })
    const peers = [topScorer, lowScorer]
    const result = buildFieldRadarData(topScorer, peers)
    expect(result.player[0]).toBe(100)
  })

  it('reduces Discipline score for yellow cards', () => {
    const clean   = makeField({ yellow: 0, red: 0 })
    const carded  = makeField({ yellow: 3, red: 0 })
    const peers   = [clean, carded]
    expect(buildFieldRadarData(clean,  peers).player[4]).toBeGreaterThan(
      buildFieldRadarData(carded, peers).player[4]
    )
  })

  it('clamps all values to 0–100', () => {
    const player = makeField({ goals: 0, assists: 0, tackles: 0, mins: 0 })
    const peers  = [player]
    const result = buildFieldRadarData(player, peers)
    result.player.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    })
  })

  it('returns posAvg values for the position cohort', () => {
    const player = makeField({ goals: 10 })
    const peer1  = makeField({ goals: 4 })
    const peer2  = makeField({ goals: 6 })
    const result = buildFieldRadarData(player, [player, peer1, peer2])
    // posAvg scoring should reflect average of 4, 6, 10 normalised against max 10 → avg 20/10 = 66%
    expect(result.posAvg[0]).toBeGreaterThan(0)
    expect(result.posAvg[0]).toBeLessThan(100)
  })

  it('handles a single-player cohort without dividing by zero', () => {
    const player = makeField({ goals: 5 })
    expect(() => buildFieldRadarData(player, [player])).not.toThrow()
  })

  // ── Gap coverage ──────────────────────────────

  it('red card penalty is 30 pts — double the yellow card penalty of 15', () => {
    const oneRed    = makeField({ yellow: 0, red: 1 })
    const twoYellow = makeField({ yellow: 2, red: 0 })
    const peers     = [oneRed, twoYellow]
    // 100 - 0*15 - 1*30 = 70 and 100 - 2*15 - 0 = 70 — penalties are equal here
    expect(buildFieldRadarData(oneRed,    peers).player[4]).toBe(70)
    expect(buildFieldRadarData(twoYellow, peers).player[4]).toBe(70)
    // One red card = two yellow cards in severity
    const threeYellow = makeField({ yellow: 3, red: 0 })
    const oneRedExtra  = makeField({ yellow: 1, red: 1 })
    // 100 - 3*15 = 55, 100 - 1*15 - 1*30 = 55 — equal
    expect(buildFieldRadarData(threeYellow, [threeYellow]).player[4]).toBe(55)
    expect(buildFieldRadarData(oneRedExtra,  [oneRedExtra]).player[4]).toBe(55)
  })

  it('posAvg Scoring is the exact average of normalised peer values', () => {
    const p1    = makeField({ goals: 10 })
    const p2    = makeField({ goals: 5  })
    const p3    = makeField({ goals: 0  })
    const peers = [p1, p2, p3]
    const result = buildFieldRadarData(p1, peers)
    // avg(norm(10,10), norm(5,10), norm(0,10)) = avg(100, 50, 0) = 50
    expect(result.posAvg[0]).toBe(50)
  })

  it('player above the cohort max is clamped to 100', () => {
    // player is NOT included in peers — cohort max is lower
    const player = makeField({ goals: 10 })
    const peer   = makeField({ goals: 5  })
    const result = buildFieldRadarData(player, [peer])
    // norm(10, 5) = round(min(100, 200)) = 100
    expect(result.player[0]).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────
// buildGKRadarData
// ─────────────────────────────────────────────────────────────

describe('buildGKRadarData', () => {
  const makeGK = (overrides: Partial<GoalkeeperStats> = {}): GoalkeeperStats => ({
    saves: 20, cleanSheets: 4, goalsAgainst: 8,
    starts: 10, yellow: 0, red: 0, mins: 900,
    ...overrides,
  })

  it('returns the five expected radar labels for goalkeepers', () => {
    const gk    = makeGK()
    const peers = [gk]
    const result = buildGKRadarData(gk, peers)
    expect(result.labels).toEqual(['Reflexes', 'Clean Sheets', 'Availability', 'Discipline', 'Starts'])
  })

  it('normalises the top-saving keeper to 100 on Reflexes', () => {
    const best   = makeGK({ saves: 30 })
    const backup = makeGK({ saves: 10 })
    const peers  = [best, backup]
    expect(buildGKRadarData(best, peers).player[0]).toBe(100)
  })

  // ── Gap coverage ──────────────────────────────

  it('yellow card reduces GK Discipline score', () => {
    const clean  = makeGK({ yellow: 0, red: 0 })
    const carded = makeGK({ yellow: 2, red: 0 })
    const peers  = [clean, carded]
    expect(buildGKRadarData(clean,  peers).player[3]).toBeGreaterThan(
      buildGKRadarData(carded, peers).player[3],
    )
  })

  it('red card reduces GK Discipline by exactly 30 points', () => {
    const gk = makeGK({ yellow: 0, red: 1 })
    // 100 - 0*15 - 1*30 = 70
    expect(buildGKRadarData(gk, [gk]).player[3]).toBe(70)
  })

  it('clamps all GK radar values to 0–100', () => {
    const gk     = makeGK({ saves: 0, cleanSheets: 0, mins: 0, starts: 0 })
    const result = buildGKRadarData(gk, [gk])
    result.player.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    })
  })

  it('posAvg Reflexes is the average of normalised saves across the cohort', () => {
    const gk1    = makeGK({ saves: 20 })
    const gk2    = makeGK({ saves: 10 })
    const result = buildGKRadarData(gk1, [gk1, gk2])
    // avg(norm(20,20), norm(10,20)) = avg(100, 50) = 75
    expect(result.posAvg[0]).toBe(75)
  })

  it('single-GK cohort does not crash or divide by zero', () => {
    const gk = makeGK()
    expect(() => buildGKRadarData(gk, [gk])).not.toThrow()
    const result = buildGKRadarData(gk, [gk])
    expect(result.player[0]).toBe(100)
  })
})
