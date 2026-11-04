import { describe, expect, it } from "vitest";
import { buildRoseCityRosterImport, type RoseCityRosterSource } from "@/lib/rose-city-roster-import";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const oldSeason = "11111111-1111-4111-8111-111111111111";
const newSeason = "22222222-2222-4222-8222-222222222222";
const uuid = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

function fixture(): RoseCityRosterSource {
  const players = Array.from({ length: 33 }, (_, i) => ({ id: uuid(i + 1), club_id: clubId, active: i < 27, name: `Player ${i + 1}`, position: i < 3 ? "Goalkeeper" : "Defender", number: i + 1, photo_asset_id: uuid(i + 100), photo_url: "/source.webp" }));
  const media = Array.from({ length: 41 }, (_, i) => ({ id: uuid(i + 100), club_id: clubId, storage_path: `${clubId}/${i < 35 ? "roster" : "flags"}/${uuid(i + 100)}.webp`, checksum_sha256: "a".repeat(64), surface: i < 35 ? "roster" : "flags", status: "published", deleted_at: null, storage_bucket: "onzio-media" }));
  const stats = (i: number) => ({ club_id: clubId, player_id: players[i].id, season_id: oldSeason, mins: 123, starts: 2, red: 0, yellow: 1, updated_at: "2026-10-01T00:00:00Z" });
  return { version: 1, sourceProject: "public-source", clubId, players, media,
    seasons: [{ id: oldSeason, club_id: clubId, label: "2025–26", active: true }],
    fieldStats: players.slice(3).map((_, i) => ({ ...stats(i + 3), goals: 4, assists: 2, tackles: 7, offsides: 1, fouls: 3, fouls_suffered: 2 })),
    goalkeeperStats: players.slice(0, 3).map((_, i) => ({ ...stats(i), saves: 8, clean_sheets: 1, goals_against: 3 })),
    photos: [{ club_id: clubId, player_id: players[4].id, media_asset_id: uuid(133), url: "/old-action.webp" }, { club_id: clubId, player_id: players[5].id, media_asset_id: uuid(134), url: "/old-action-2.webp" }],
  };
}

describe("2027 local roster preparation preserves historical data", () => {
  it("carries the existing 33 identities but only seeds the 27 active players into 2027", () => {
    const source = fixture();
    const original = structuredClone(source);
    const plan = buildRoseCityRosterImport(source, "http://127.0.0.1:55321", newSeason);
    expect(plan.profiles.map((p) => p.id)).toEqual(source.players.map((p) => p.id));
    expect(plan.fieldStats).toHaveLength(24);
    expect(plan.goalkeeperStats).toHaveLength(3);
    expect(new Set([...plan.fieldStats, ...plan.goalkeeperStats].map((s) => s.player_id))).toEqual(new Set(source.players.filter((p) => p.active).map((p) => p.id)));
    for (const row of [...plan.fieldStats, ...plan.goalkeeperStats]) {
      expect(row.season_id).toBe(newSeason);
      expect(Object.values(row).filter((value) => typeof value === "number").every((value) => value === 0)).toBe(true);
    }
    expect(plan.history.fieldStats).toEqual(original.fieldStats);
    expect(plan.history.goalkeeperStats).toEqual(original.goalkeeperStats);
    expect(plan.history.seasons[0]).toEqual({ ...original.seasons[0], active: false });
    expect(plan.season).toMatchObject({ label: "2027", active: true, start_year: 2027, end_year: 2027 });
    expect(source).toEqual(original);
  });
  it("keeps photo identities and paths while resolving delivery to the isolated local project", () => {
    const source = fixture();
    const plan = buildRoseCityRosterImport(source, "http://127.0.0.1:55321", newSeason);
    expect(plan.profiles[0].photo_asset_id).toBe(source.players[0].photo_asset_id);
    expect(plan.profiles[0].photo_url).toBe(`http://127.0.0.1:55321/storage/v1/object/public/onzio-media/${source.media[0].storage_path}`);
    expect(plan.photos[0].media_asset_id).toBe(source.photos[0].media_asset_id);
    expect(plan.photos[0].url).toContain(String(source.media[33].storage_path));
  });
  it("rejects hosted destinations, cross-tenant records, missing photos and mismatched historical membership", () => {
    expect(() => buildRoseCityRosterImport(fixture(), "https://example.invalid", newSeason)).toThrow("isolated local API");
    const crossTenant = fixture(); crossTenant.players[0].club_id = newSeason;
    expect(() => buildRoseCityRosterImport(crossTenant, "http://127.0.0.1:55321", newSeason)).toThrow("Cross-tenant");
    const missingPhoto = fixture(); missingPhoto.players[0].photo_asset_id = newSeason;
    expect(() => buildRoseCityRosterImport(missingPhoto, "http://127.0.0.1:55321", newSeason)).toThrow("Missing player photo");
    const mismatched = fixture(); mismatched.fieldStats[0].season_id = newSeason;
    expect(() => buildRoseCityRosterImport(mismatched, "http://127.0.0.1:55321", newSeason)).toThrow("relationship mismatch");
    const retired = fixture(); retired.media[0].deleted_at = "2026-10-01";
    expect(() => buildRoseCityRosterImport(retired, "http://127.0.0.1:55321", newSeason)).toThrow("Invalid published");
  });
});
