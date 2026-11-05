/**
 * RC2027-MATCH-SUMMARY browser check, local Rose City rehearsal only.
 *   --apply   puts made-up sample summary data on the latest played local match, saving what was there
 *   --remove  restores that match exactly as it was
 * The sample is never meant to be published; the owner enters real summaries in the Schedule editor.
 */
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { matchSummarySchema, type MatchSummary } from "@/lib/match-summary";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const RECEIPT = "/tmp/rose-city-match-summary-sample.json";
const people = (rows: string) => rows.split(";").map(row => { const [number, name] = row.trim().split(" "); return { number, name: name.replace("_", " ") }; });
const SAMPLE: MatchSummary = {
  events: [
    { minute: "23′", side: "club", kind: "goal", player: "#8 J. Hernandez", detail: "Assist: #10 G. Alfaro" },
    { minute: "41′", side: "opponent", kind: "yellow", player: "#5 B. Williams", detail: "" },
    { minute: "45′+2′", side: "opponent", kind: "goal", player: "#9 D. Ortiz", detail: "Assist: #7 M. Reyes" },
    { minute: "58′", side: "club", kind: "sub", player: "#14 L. Castillo", detail: "#11 R. Vega" },
    { minute: "71′", side: "club", kind: "goal", player: "#10 G. Alfaro", detail: "Assist: #14 L. Castillo" },
    { minute: "84′", side: "opponent", kind: "red", player: "#5 B. Williams", detail: "" },
  ],
  stats: [{ label: "Possession %", club: 54.5, opponent: 45.5 }, { label: "Shots", club: 14, opponent: 9 }, { label: "Shots on goal", club: 6, opponent: 3 }, { label: "Corners", club: 6, opponent: 3 }, { label: "Red cards", club: 0, opponent: 1 }],
  officials: [{ role: "Referee", name: "Dennis Maybourn" }, { role: "Asst. Referee 1", name: "Brandon Wills" }],
  kit: [{ item: "Jersey", color: "Red" }, { item: "Shorts", color: "Red" }, { item: "Socks", color: "White" }],
  lineups: {
    club: { starting: people("1 M._Soto; 4 A._Mendez; 8 J._Hernandez; 10 G._Alfaro; 11 R._Vega"), bench: people("14 L._Castillo; 16 J._Fox"), staff: [{ name: "G. Morales", role: "Head Coach" }] },
    opponent: { starting: people("1 R._Diaz; 5 B._Williams; 7 M._Reyes; 9 D._Ortiz"), bench: people("18 T._Wright"), staff: [{ name: "R. Delgado", role: "Head Coach" }] },
  },
};

async function main() {
  const apply = process.argv.includes("--apply"), remove = process.argv.includes("--remove");
  assert(apply !== remove, "Pass --apply or --remove.");
  const connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  assert(connection.hostname === "127.0.0.1" && connection.port === "55322", "Only the isolated Rose City database is allowed.");
  assert(![...connection.searchParams.keys()].some(key => ["host", "hostaddr", "service", "servicefile"].includes(key)), "Connection redirects are not allowed.");
  const db = new Client({ connectionString: connection.href });
  await db.connect();
  try {
    const club = (await db.query("select slug,kind from onzio.clubs where id=$1", [clubId])).rows[0];
    assert(club?.slug === "rose-city" && club.kind === "test", "Expected the local Rose City test tenant.");
    if (apply) {
      const match = (await db.query("select id,summary,attendance from onzio.matches where club_id=$1 and rose_city_score is not null and opponent_score is not null order by date desc,time desc limit 1", [clubId])).rows[0];
      assert(match, "No played local match.");
      assert(match.summary === null, "That match already has a summary; leave it alone.");
      await writeFile(RECEIPT, JSON.stringify({ id: match.id, summary: match.summary, attendance: match.attendance }));
      await db.query("update onzio.matches set summary=$1::jsonb,attendance=1356 where id=$2 and club_id=$3", [JSON.stringify(matchSummarySchema.parse(SAMPLE)), match.id, clubId]);
      console.log(JSON.stringify({ localOnly: true, sampleApplied: match.id }));
    } else {
      const saved = JSON.parse(await readFile(RECEIPT, "utf8")) as { id: string; summary: null; attendance: number | null };
      await db.query("update onzio.matches set summary=$1::jsonb,attendance=$2 where id=$3 and club_id=$4", [saved.summary, saved.attendance, saved.id, clubId]);
      await rm(RECEIPT);
      console.log(JSON.stringify({ localOnly: true, sampleRemoved: saved.id }));
    }
  } finally { await db.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Sample failed."); process.exitCode = 1; });
