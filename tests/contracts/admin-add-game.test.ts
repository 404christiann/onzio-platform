import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminDataRequestSchema, matchesMutation, newMatchLimits } from "@/lib/admin-data-contract";
import { compareMatches, distinctVenues, RECENT_VENUE_LIMIT, toAddGameMatch } from "@/lib/admin-add-game-data";
import { DEFAULT_KICKOFF_TIME } from "@/lib/club-time";
import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";

// ADMIN-RE-07: "Add a game". Pins the text limits (decision 7: Zod only), the
// insert the form sends through /api/admin/data, the defaults, and where the
// page may run.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const page = source("app/admin/(protected)/add-game/page.tsx");
const form = source("components/admin/reimagined/AddGame.tsx");
const loader = source("lib/admin-add-game-data.ts");
const classic = source("app/admin/(protected)/schedule/page.tsx");

const SEASON = "11111111-1111-4111-8111-111111111111";
const GAME = {
  season_id: SEASON,
  date: "2026-11-14",
  time: "10:00",
  opponent: "Northgate",
  home: true,
  venue: "Lincoln Park",
};
const text = (length: number) => "x".repeat(length);
const insert = (payload: Record<string, unknown>) =>
  adminDataRequestSchema.safeParse({ table: "matches", operation: "insert", payload });
const update = (payload: Record<string, unknown>) =>
  adminDataRequestSchema.safeParse({
    table: "matches",
    operation: "update",
    payload,
    filters: [{ kind: "eq", column: "id", value: SEASON }],
  }).success;

describe("matches text limits for a new game (decision 7, Zod only)", () => {
  it("are the numbers the plan names", () => {
    expect(MATCH_TEXT_LIMITS).toEqual({
      opponent: 80,
      opponent_short_name: 20,
      venue: 120,
      competition: 80,
      address: 120,
      city: 80,
      state: 40,
    });
  });

  it.each(Object.entries(MATCH_TEXT_LIMITS))("adds a game with %s at %i characters and refuses one more", (field, limit) => {
    expect(insert({ ...GAME, [field]: text(limit) }).success).toBe(true);
    const tooLong = insert({ ...GAME, [field]: text(limit + 1) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues.map((issue) => issue.path.join("."))).toContain(`payload.${field}`);
  });

  it.each(Object.entries(MATCH_TEXT_LIMITS))("still saves an existing game whose %s is longer than %i", (field, limit) => {
    // Until decision 7's production length check, rows saved before the
    // limits stay editable: the classic edit form resends every field.
    expect(update({ [field]: text(limit + 40) })).toBe(true);
  });

  it("needs an opponent and a venue with something in them", () => {
    for (const field of ["opponent", "venue"] as const) {
      expect(matchesMutation.safeParse({ [field]: "" }).success).toBe(false);
      expect(matchesMutation.safeParse({ [field]: "   " }).success).toBe(false);
    }
  });

  it("lets the optional text be cleared to null", () => {
    for (const field of ["opponent_short_name", "competition", "address", "city", "state"]) {
      expect(matchesMutation.safeParse({ [field]: null }).success).toBe(true);
    }
  });
});

describe("adding a game through /api/admin/data", () => {
  it("accepts the form's insert", () => {
    expect(insert(GAME).success).toBe(true);
  });

  it.each(["season_id", "date", "time", "opponent", "venue"])("refuses an insert without %s", (field) => {
    const { [field as keyof typeof GAME]: _gone, ...rest } = GAME;
    expect(insert(rest).success).toBe(false);
  });

  it("keeps a score-only update valid (ADMIN-RE-06), whole numbers from 0 to 99 on every write", () => {
    expect(update({ rose_city_score: 3, opponent_score: 0 })).toBe(true);
    expect(update({ rose_city_score: null, opponent_score: null })).toBe(true);
    expect(update({ rose_city_score: 100 })).toBe(false);
    expect(update({ opponent_score: -1 })).toBe(false);
    expect(update({ opponent_score: 1.5 })).toBe(false);
    expect(insert({ ...GAME, rose_city_score: 99, opponent_score: 0 }).success).toBe(true);
    expect(insert({ ...GAME, rose_city_score: 100, opponent_score: 0 }).success).toBe(false);
  });

  it("refuses dates and times the columns cannot hold, unknown columns and tenant identity", () => {
    expect(insert({ ...GAME, date: "Nov 14" }).success).toBe(false);
    expect(insert({ ...GAME, time: "25:00" }).success).toBe(false);
    expect(insert({ ...GAME, time: "10:00:00" }).success).toBe(true);
    expect(insert({ ...GAME, league_game: true }).success).toBe(false);
    expect(insert({ ...GAME, club_id: SEASON }).success).toBe(false);
  });

  it("is what the form sends", () => {
    expect(form).toContain('fetch("/api/admin/data"');
    expect(form).toContain('table: "matches"');
    expect(form).toContain('operation: "insert"');
    expect(form).toMatch(
      /payload: \{\s*season_id: seasonId,\s*date,\s*time,\s*opponent: name,\s*home,\s*venue: place,/,
    );
    // Writes never use the browser Supabase client (Server Mutation Boundary).
    expect(form).not.toMatch(/supabase-browser|createClient/);
  });
});

describe("Add a game form (ADMIN-RE-07)", () => {
  it("defaults to Home, next Saturday at 10:00 in club time, and the active season", () => {
    expect(DEFAULT_KICKOFF_TIME).toBe("10:00");
    expect(page).toContain("defaultDate={nextClubSaturday(portal.timeZone)}");
    expect(page).toContain("defaultTime={DEFAULT_KICKOFF_TIME}");
    expect(page).toContain("today={clubToday(portal.timeZone)}");
    expect(form).toContain("const [home, setHome] = useState(true);");
    expect(form).toContain("seasons.find((season) => season.active) ?? seasons[0]");
  });

  it("asks the plain questions and not \"League game?\" (decision 4)", () => {
    for (const question of ["Who are you playing?", "Home or away?", "When?", "Where?", "Last used", "Coming up", "No games yet", "Add to schedule"]) {
      expect(form).toContain(question);
    }
    expect(form).not.toMatch(/League game/i);
    expect(form).toContain('from "@/components/ui/calendar"');
    expect(form).toContain('formatClubDate(date, "weekday-short")');
  });

  it("caps its inputs at the contract's limits", () => {
    expect(form).toContain("maxLength={MATCH_TEXT_LIMITS.opponent}");
    expect(form).toContain("maxLength={MATCH_TEXT_LIMITS.venue}");
  });

  it("says where the game shows, hold-aware (decision 2)", () => {
    expect(form).toContain('savedLabel(websiteState, "Added")');
    expect(page).toContain("websiteState={websiteState(club)}");
  });

  it("runs only for a reimagined club and sends a classic one to the old schedule", () => {
    expect(page).not.toContain('"use client"');
    expect(page).toContain("requireFreshClubSession(supabase)");
    expect(page).toContain("const portal = await readAdminPortal(supabase, club.id);");
    expect(page).toContain('if (portal.portal !== "reimagined") redirect("/admin/schedule");');
  });

  it("reads with the signed-in person's client, scoped to the club, and nothing personal", () => {
    expect(loader).not.toMatch(/service-role|SERVICE_ROLE/);
    // ADMIN-RE-07b added three reads (opponents, latest sponsor, Sponsors page).
    expect(loader.match(/\.eq\("club_id", clubId\)/g)).toHaveLength(6);
    expect(loader).toContain('MATCH_COLUMNS = "id,season_id,date,time,opponent,home,venue"');
    expect(loader).toContain('.select("id,label,active")');
    expect(loader).toContain('.select("venue")');
  });
});

describe("Last used venues and Coming up order", () => {
  it("keeps the newest distinct venues, ignoring blanks, case and outer spaces", () => {
    expect(distinctVenues(["Lincoln Park", " lincoln park ", "", null, "Riverside", "TBD", "Delta Park"])).toEqual([
      "Lincoln Park",
      "Riverside",
      "TBD",
    ]);
    expect(RECENT_VENUE_LIMIT).toBe(3);
    expect(distinctVenues([])).toEqual([]);
  });

  it("orders games by date, then kickoff", () => {
    const game = (date: string, time: string) =>
      toAddGameMatch({ id: date + time, season_id: SEASON, date, time, opponent: "A", home: true, venue: "B" });
    const sorted = [game("2026-11-21", "09:00:00"), game("2026-11-14", "13:00:00"), game("2026-11-14", "09:30:00")].sort(compareMatches);
    expect(sorted.map((match) => `${match.date} ${match.time}`)).toEqual(["2026-11-14 09:30", "2026-11-14 13:00", "2026-11-21 09:00"]);
  });
});

// The classic Games page writes matches through lib/admin-client.ts, which
// posts to /api/admin/data, so these schemas apply to it today. Its add form
// sends emptyForm()'s fields plus the media asset ids admin-client attaches;
// its edit form resends every field of the stored row.
describe("classic Games page writes", () => {
  const formKeys = () => {
    const body = classic.match(/function emptyForm\(seasonId = ""\): FormState \{\s*return \{([\s\S]*?)\};/)?.[1] ?? "";
    return [...body.matchAll(/(\w+):/g)].map((match) => match[1]).sort();
  };
  const CLASSIC_FIELDS = {
    date: "2026-11-14",
    time: "18:00",
    opponent: "Portland FC",
    opponent_short_name: null,
    opponent_logo_url: null,
    competition: null,
    sponsor_name: null,
    sponsor_logo_url: null,
    sponsor_link: null,
    home: true,
    venue: "Delta Park",
    address: null,
    city: null,
    state: null,
    rose_city_score: null,
    opponent_score: null,
    season_id: SEASON,
  };
  // What lib/admin-client.ts adds when the logo fields are cleared.
  const ASSET_IDS = { opponent_logo_asset_id: null, sponsor_logo_asset_id: null };
  const LEGACY_ROW = {
    ...CLASSIC_FIELDS,
    time: "18:00:00",
    opponent: text(95),
    opponent_short_name: text(30),
    competition: text(100),
    sponsor_name: text(140),
    venue: text(150),
    address: text(130),
    city: text(90),
    state: text(50),
    rose_city_score: 4,
    opponent_score: 3,
  };

  it("sends exactly the fields these payloads pin", () => {
    expect(formKeys()).toEqual(Object.keys(CLASSIC_FIELDS).sort());
    expect(classic).toContain('import { createClient } from "@/lib/admin-client";');
    expect(classic).toMatch(/supabase\.from\("matches"\)\.insert\(\[\{\s*\.\.\.addForm,/);
    expect(classic).toMatch(/supabase\.from\("matches"\)\.update\(\{\s*\.\.\.editForm,/);
  });

  it("adds a classic game, and refuses one over the limits", () => {
    expect(insert({ ...CLASSIC_FIELDS, ...ASSET_IDS }).success).toBe(true);
    expect(insert({ ...CLASSIC_FIELDS, ...ASSET_IDS, opponent: text(81) }).success).toBe(false);
    expect(insert({ ...CLASSIC_FIELDS, ...ASSET_IDS, rose_city_score: 100, opponent_score: 0 }).success).toBe(false);
  });

  it("saves an edit of a game stored before the limits, every field resent", () => {
    expect(update({ ...LEGACY_ROW, ...ASSET_IDS })).toBe(true);
    expect(matchesMutation.safeParse(LEGACY_ROW).success).toBe(true);
    expect(newMatchLimits.safeParse(LEGACY_ROW).success).toBe(false);
  });

  it("caps its add form at the same limits and explains them before saving", () => {
    expect(classic).toContain('import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";');
    expect(classic).toContain("const validationError = validate(addForm, true);");
    expect(classic).toContain("const validationError = validate(editForm);");
    expect(classic).toContain("isNew={!editingId}");
    for (const field of Object.keys(MATCH_TEXT_LIMITS)) {
      expect(classic).toContain(`maxLength={newMatchLimit("${field}")}`);
    }
    expect(classic).toContain("can be at most ${MATCH_TEXT_LIMITS[field]} characters.");
    expect(classic).toContain("Scores can be at most ${MAX_MATCH_SCORE}.");
    expect(classic.match(/max=\{MAX_MATCH_SCORE\}/g)).toHaveLength(2);
  });
});
