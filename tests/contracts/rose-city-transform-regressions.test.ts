import { describe, expect, it } from "vitest";
import {
  transformRoseCity,
  type RoseCitySource,
} from "@/lib/migration/rose-city-transform";

const source: RoseCitySource = {
  clubId: "33333333-3333-4333-8333-333333333333",
  singletonRows: [{ table: "site_branding", id: 1 }],
  players: [{ id: "player_1", name: "Player One" }],
  matches: [{ id: "match_1", opponent: "Opponent" }],
  playerMatchStats: [
    { id: "stat_1", playerId: "player_1", matchId: "match_1" },
  ],
  media: [
    {
      sourcePath: "roster/player-1.jpg",
      checksum: "sha256:source",
    },
  ],
  stripeSubscriptionId: "sub_rose_existing",
};

describe("Rose City migration transform regressions", () => {
  it("produces deterministic tenant rows and immutable media paths", async () => {
    const first = await transformRoseCity(source);
    const second = await transformRoseCity(source);

    expect(second).toEqual(first);
    expect(first.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(first.playerMatchStats[0]).toMatchObject({
      club_id: source.clubId,
      player_id: "player_1",
      match_id: "match_1",
    });
    expect(first.media[0].storage_path).toMatch(
      new RegExp(`^${source.clubId}/roster/[0-9a-f-]{36}\\.webp$`),
    );
    expect(first.media[0].transformedBySupabase).toBe(false);
  });

  it("detects real duplicate rows without simulation flags", async () => {
    await expect(
      transformRoseCity({
        ...source,
        players: [...source.players, ...source.players],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_SOURCE_ROW" });
  });

  it("detects real broken tenant relationships", async () => {
    await expect(
      transformRoseCity({
        ...source,
        playerMatchStats: [
          { id: "stat_1", playerId: "missing", matchId: "match_1" },
        ],
      }),
    ).rejects.toMatchObject({ code: "RELATIONSHIP_MISMATCH" });
  });

  it("reconciles declared source counts", async () => {
    await expect(
      transformRoseCity({
        ...source,
        expectedCounts: { players: 2 },
      }),
    ).rejects.toMatchObject({ code: "ROW_COUNT_MISMATCH" });
  });

  it("rejects checksum disagreement and unsafe media paths", async () => {
    await expect(
      transformRoseCity({
        ...source,
        media: [
          {
            sourcePath: "roster/player-1.jpg",
            checksum: "sha256:source",
            expectedChecksum: "sha256:expected",
            outputChecksum: "sha256:actual",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "CHECKSUM_MISMATCH" });

    await expect(
      transformRoseCity({
        ...source,
        media: [{ sourcePath: "../secret.jpg", checksum: "sha256:source" }],
      }),
    ).rejects.toMatchObject({ code: "MISSING_MEDIA" });
  });
});
