/**
 * RC2027-SCHEDULE-LINKS browser check, local Rose City rehearsal only.
 *   --apply   puts a dummy YouTube link on the latest played match and the next upcoming match, saving what was there
 *   --remove  restores those matches exactly as they were
 * The dummy video is YouTube's public "Me at the zoo" clip; the owner enters real links in the Schedule editor.
 */
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { MATCH_REPLAY_EMBED_PATTERN } from "@/lib/youtube-embed";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const RECEIPT = join(tmpdir(), "rose-city-schedule-links-sample.json");
const DUMMY_VIDEO = "https://www.youtube.com/embed/jNQXAC9IVRw?rel=0";

async function main() {
  const apply = process.argv.includes("--apply"), remove = process.argv.includes("--remove");
  assert(apply !== remove, "Pass --apply or --remove.");
  assert(MATCH_REPLAY_EMBED_PATTERN.test(DUMMY_VIDEO), "The dummy link must be a stored YouTube embed link.");
  const connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  assert(connection.hostname === "127.0.0.1" && connection.port === "55322", "Only the isolated Rose City database is allowed.");
  assert(![...connection.searchParams.keys()].some(key => ["host", "hostaddr", "service", "servicefile"].includes(key)), "Connection redirects are not allowed.");
  const db = new Client({ connectionString: connection.href });
  await db.connect();
  try {
    const club = (await db.query("select slug,kind from onzio.clubs where id=$1", [clubId])).rows[0];
    assert(club?.slug === "rose-city" && club.kind === "test", "Expected the local Rose City test tenant.");
    if (apply) {
      const played = (await db.query("select id,replay_video_url from onzio.matches where club_id=$1 and rose_city_score is not null and opponent_score is not null order by date desc,time desc limit 1", [clubId])).rows[0];
      const upcoming = (await db.query("select id,replay_video_url from onzio.matches where club_id=$1 and (rose_city_score is null or opponent_score is null) and date >= current_date order by date,time limit 1", [clubId])).rows[0];
      const rows = [played, upcoming].filter(Boolean) as { id: string; replay_video_url: string | null }[];
      assert(rows.length > 0, "No local matches to sample.");
      assert(rows.every(row => !row.replay_video_url), "A sampled match already has a video link; leave it alone.");
      await writeFile(RECEIPT, JSON.stringify(rows));
      for (const row of rows) await db.query("update onzio.matches set replay_video_url=$1 where id=$2 and club_id=$3", [DUMMY_VIDEO, row.id, clubId]);
      console.log(JSON.stringify({ localOnly: true, sampleApplied: rows.map(row => row.id) }));
    } else {
      const saved = JSON.parse(await readFile(RECEIPT, "utf8")) as { id: string; replay_video_url: string | null }[];
      for (const row of saved) await db.query("update onzio.matches set replay_video_url=$1 where id=$2 and club_id=$3", [row.replay_video_url, row.id, clubId]);
      await rm(RECEIPT);
      console.log(JSON.stringify({ localOnly: true, sampleRemoved: saved.map(row => row.id) }));
    }
  } finally { await db.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Sample failed."); process.exitCode = 1; });
