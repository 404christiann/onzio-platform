import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS } from "../fixtures/entities";
import { EMPTY_MATCH_SUMMARY, type MatchSummary } from "@/lib/match-summary";

const summary: MatchSummary = {
  events: [{ minute: "23′", side: "club", kind: "goal", player: "#8 J. Hernandez", detail: "Assist: #10 G. Alfaro" }],
  stats: [{ label: "Possession %", club: 54.5, opponent: 45.5 }],
  officials: [{ role: "Referee", name: "Dennis Maybourn" }],
  kit: [{ item: "Jersey", color: "Red" }],
  lineups: { club: { starting: [{ number: "8", name: "J. Hernandez" }], bench: [], staff: [{ name: "G. Morales", role: "Head Coach" }] }, opponent: { starting: [], bench: [], staff: [] } },
};

it("stores a well-formed match summary, or none, and refuses anything else", async () => {
  assertSafeTestEnvironment();
  const db = new Client(localPostgresConfig());
  await db.connect();
  const match = randomUUID();
  try {
    await db.query("begin");
    const season = (await db.query("select id from onzio.seasons where club_id=$1 limit 1", [CLUB_IDS.alpha])).rows[0].id;
    await db.query("insert into onzio.matches(id,club_id,season_id,date,time,opponent) values($1,$2,$3,'2027-05-02','19:45','Summary regression')", [match, CLUB_IDS.alpha, season]);
    // Matches saved before this change have no summary.
    expect((await db.query("select summary from onzio.matches where id=$1", [match])).rows[0].summary).toBeNull();
    for (const ok of [summary, EMPTY_MATCH_SUMMARY, null]) {
      await db.query("update onzio.matches set summary=$1::jsonb where id=$2", [ok === null ? null : JSON.stringify(ok), match]);
      expect((await db.query("select summary from onzio.matches where id=$1", [match])).rows[0].summary).toEqual(ok);
    }
    const event = summary.events[0];
    for (const bad of [
      { ...summary, events: [{ ...event, kind: "penalty" }] },
      { ...summary, events: [{ ...event, side: "home" }] },
      { ...summary, events: [{ ...event, player: "x".repeat(81) }] },
      { ...summary, events: Array.from({ length: 61 }, () => event) },
      { ...summary, stats: [{ label: "Shots", club: -1, opponent: 2 }] },
      { ...summary, stats: [{ label: "Shots", club: "14", opponent: 2 }] },
      { ...summary, officials: [{ role: "Referee", name: "x".repeat(61) }] },
      { ...summary, kit: [{ item: "Jersey", color: "Red", extra: 1 }] },
      { ...summary, lineups: { ...summary.lineups, club: { ...summary.lineups.club, starting: [{ number: "#8x", name: "J." }] } } },
      { ...summary, lineups: { club: summary.lineups.club } },
      { ...summary, extra: true },
      "not an object",
    ]) {
      await db.query("savepoint invalid_summary");
      await expect(db.query("update onzio.matches set summary=$1::jsonb where id=$2", [JSON.stringify(bad), match])).rejects.toThrow("matches_summary_check");
      await db.query("rollback to savepoint invalid_summary");
    }
  } finally { await db.query("rollback"); await db.end(); }
});
