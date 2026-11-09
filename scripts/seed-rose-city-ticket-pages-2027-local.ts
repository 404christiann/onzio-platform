/**
 * RC2027-TICKET-PAGES: store Sam's Season Ticket Membership and Know Before You Go copy as the starting content
 * in the isolated local Rose City rehearsal only. No images: Sam is sending the icons, logos and the PlayStation
 * photo, so every image slot starts empty (the public page hides empty slots). Re-running is a no-op; owner-edited
 * content is never overwritten.
 */
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";
import { TICKET_PAGE_KEYS, ticketPageSchemas, type TicketPageContent, type TicketPageKey } from "@/lib/cinematic-ticket-pages-content";
import { knowBeforeYouGoReferenceContent, seasonMembershipReferenceContent } from "@/lib/ticket-pages-reference-content";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7", version = "20261105060000";
const REFERENCE: Record<TicketPageKey, TicketPageContent> = { "season-membership": seasonMembershipReferenceContent, "know-before-you-go": knowBeforeYouGoReferenceContent };

async function main() {
  assert(process.argv.includes("--execute-local"), "Pass --execute-local.");
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  assert(api.protocol === "http:" && api.hostname === "127.0.0.1" && api.port === "55321", "Only the isolated Rose City API is allowed.");
  assert(connection.hostname === "127.0.0.1" && connection.port === "55322", "Only the isolated Rose City database is allowed.");
  assert(![...connection.searchParams.keys()].some(key => ["host", "hostaddr", "service", "servicefile"].includes(key)), "Connection redirects are not allowed.");
  const db = new Client({ connectionString: connection.href });
  await db.connect();
  try {
    const club = (await db.query("select slug,kind from onzio.clubs where id=$1", [clubId])).rows[0];
    assert(club?.slug === "rose-city" && club.kind === "test", "Expected the isolated Rose City test tenant.");
    const design = (await db.query("select d.template_id,d.template_version from onzio.presentation_state s join onzio.presentation_documents d on d.id=s.published_document_id and d.club_id=s.club_id where s.club_id=$1", [clubId])).rows[0];
    assert(design?.template_id === "cinematic" && design.template_version === 2, "Expected a published cinematic@2 design.");
    assert((await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version])).rowCount, "Apply the ticket page migrations first (scripts/apply-rose-city-ticket-pages-migrations-local.ts).");
    const seeded: string[] = [];
    await db.query("begin");
    try {
      for (const page of TICKET_PAGE_KEYS) {
        const content = ticketPageSchemas[page].parse(REFERENCE[page]);
        const stored = { ...content, images: Object.fromEntries(Object.entries(content.images).map(([slot, image]) => [slot, { alt: image.alt }])) };
        const existing = (await db.query("select content from onzio.cinematic_ticket_pages where club_id=$1 and page=$2", [clubId, page])).rows[0];
        assert(!existing || isDeepStrictEqual(existing.content, stored), `Saved ${page} content differs (owner edits); refusing to overwrite it.`);
        if (!existing) { await db.query("insert into onzio.cinematic_ticket_pages(club_id,page,content) values($1,$2,$3)", [clubId, page, JSON.stringify(stored)]); seeded.push(page); }
      }
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    console.log(JSON.stringify({ localOnly: true, clubId, seeded, images: "none (waiting for Sam)", hostedWrites: false }));
  } finally { await db.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Local ticket page seed failed."); process.exitCode = 1; });
