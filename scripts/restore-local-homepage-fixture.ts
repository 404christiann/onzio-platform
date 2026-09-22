/**
 * Restores Alpha's local homepage browser-test fixture to its seeded state.
 *
 * The Homepage browser specs republish Alpha's presentation document and
 * restore it in `finally`. An interrupted run never reaches that `finally`, and
 * because each run captures "whatever is published now" as its baseline, the
 * leak silently becomes the new baseline: Alpha stays on, say, `clubhouse@1`,
 * `story.text` disappears, hero saves start failing with FIELD_UNAVAILABLE, and
 * unrelated specs fail in ways that look like product defects. This repairs it.
 *
 * Loopback Postgres only. It never touches hosted projects and never resets the
 * database: it repoints Alpha's presentation state at the seeded document and
 * clears any leftover marker text the editor specs may have saved.
 */
import { Client } from "pg";

const ALPHA_CLUB_ID = "11111111-1111-4111-8111-111111111111";
/** Published by supabase/seed.sql (dcfc-304-alpha-academy). */
const ALPHA_SEEDED_PRESENTATION_ID = "88888888-8888-4888-8888-888888888804";
/** Blank is the real baseline for these fields: the column default is '', seed.sql
 * adds no hero row, and the editor states that blank fields fall back to the
 * website's standard wording (the club name for the headline). The recovery spec
 * independently clears its own edit back to '' for the same reason. */
const HERO_BASELINE = "";
/** Text the browser specs type. A crashed run leaves one of these behind, and the
 * next run then captures it as its own "baseline" and restores to it forever. */
const TEST_MARKERS: Record<string, RegExp> = {
  headline_line_one: /^(Local editor verification|Local retry verification|Saved, not recovered|Saved before leaving|Dirty before leaving|First tab version|Another version|Panel toast stays local|Queue check|Hover pause|Phone shot|Review shot|Error shot|Draft across sizes|Draft survives closing options|Real device check|Real check)\b/,
  intro: /^(Newer paragraph from another administrator)\b/,
};

const HOST = process.env.SUPABASE_LOCAL_DB_HOST ?? "127.0.0.1";
if (HOST !== "127.0.0.1" && HOST !== "localhost") {
  throw new Error("This repair script only runs against loopback Postgres.");
}

async function main() {
  const db = new Client({ host: HOST, port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  try {
    const seeded = await db.query(
      "select template_id from onzio.presentation_documents where club_id=$1 and id=$2",
      [ALPHA_CLUB_ID, ALPHA_SEEDED_PRESENTATION_ID],
    );
    if (!seeded.rows.length) {
      throw new Error(
        "Alpha's seeded presentation document is missing. Reseed the local database " +
        "(`supabase db reset`) rather than guessing a replacement fixture.",
      );
    }

    const before = await db.query(
      "select draft_document_id, published_document_id from onzio.presentation_state where club_id=$1",
      [ALPHA_CLUB_ID],
    );
    const current = before.rows[0];
    if (current?.published_document_id === ALPHA_SEEDED_PRESENTATION_ID && current?.draft_document_id === ALPHA_SEEDED_PRESENTATION_ID) {
      console.log(`presentation fixture: already seeded (${seeded.rows[0].template_id})`);
    } else {
      await db.query(
        "update onzio.presentation_state set draft_document_id=$1, published_document_id=$1 where club_id=$2",
        [ALPHA_SEEDED_PRESENTATION_ID, ALPHA_CLUB_ID],
      );
      console.log(
        `presentation fixture: restored to seeded ${seeded.rows[0].template_id} ` +
        `(was published=${current?.published_document_id ?? "none"}, draft=${current?.draft_document_id ?? "none"})`,
      );
    }

    const hero = await db.query<Record<string, string>>(
      "select headline_line_one, intro from onzio.homepage_hero_content where club_id=$1",
      [ALPHA_CLUB_ID],
    );
    for (const [column, marker] of Object.entries(TEST_MARKERS)) {
      const value = hero.rows[0]?.[column];
      if (value && marker.test(value)) {
        await db.query(
          `update onzio.homepage_hero_content set ${column}=$1 where club_id=$2`,
          [HERO_BASELINE, ALPHA_CLUB_ID],
        );
        console.log(`hero ${column}: cleared leftover test text ${JSON.stringify(value)} -> standard wording`);
      } else {
        console.log(`hero ${column}: no leftover test text (${JSON.stringify(value ?? null)})`);
      }
    }
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
