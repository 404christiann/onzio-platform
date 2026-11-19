import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMediaOrphanSweep } from "@/lib/media-orphan-sweep";
import { USER_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createFreshLocalClient } from "../helpers/mfa";
import { localPostgresConfig } from "../helpers/local-postgres";
import { createLocalClients, type LocalClients } from "../helpers/supabase";

// RC-ADMIN-10d: the orphan-media sweep's database half. Pins and the reference registry feed the
// one reference check (onzio_private.media_asset_has_references) that retirement also uses; the
// scan keeps the unreferenced_since clock and returns the report lists.

const db = new Client(localPostgresConfig());
let clients: LocalClients;
const CLUB = randomUUID();
const ARCHIVED = randomUUID();
const reportRunIds: string[] = [];
const HOUR = "interval '1 hour'";

function pathOf(club: string, id: string) {
  return `${club}/homepage/${id}.webp`;
}

async function asset(input: {
  club?: string;
  publishedAgo?: string;
  unreferencedAgo?: string | null;
} = {}) {
  const id = randomUUID();
  const club = input.club ?? CLUB;
  await db.query(
    `insert into onzio.media_assets
      (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,unreferenced_since)
     values ($1,$2,'onzio-media',$3,'homepage','photograph','image/webp',100,100,100,$4,'published',
       now() - ${input.publishedAgo ?? "interval '0 seconds'"},
       ${input.unreferencedAgo ? `now() - ${input.unreferencedAgo}` : "null"})`,
    [id, club, pathOf(club, id), "e".repeat(64)],
  );
  return { id, path: pathOf(club, id) };
}

async function scan(grace = "24 hours") {
  const { data, error } = await clients.service.rpc("media_orphan_sweep_scan", { p_grace: grace });
  expect(error).toBeNull();
  const clubs = (data as { clubs: Array<Record<string, any>> }).clubs;
  return { raw: data as Record<string, any>, club: clubs.find((c) => c.clubId === CLUB)! };
}

async function retire(id: string, club = CLUB) {
  const { data, error } = await clients.service.rpc("retire_unreferenced_media_asset", {
    p_club_id: club, p_asset_id: id, p_actor_id: null,
  });
  expect(error).toBeNull();
  return data as { status: string };
}

async function clock(id: string): Promise<string | null> {
  const { rows } = await db.query("select unreferenced_since from onzio.media_assets where id = $1", [id]);
  return rows[0].unreferenced_since ? new Date(rows[0].unreferenced_since).toISOString() : null;
}

beforeAll(async () => {
  assertSafeTestEnvironment();
  clients = createLocalClients();
  await db.connect();
  await db.query(
    `insert into onzio.clubs (id, slug, name, lifecycle, public_access, tier)
     values ($1, $2, 'Sweep Test', 'active', 'live', 'starter')`,
    [CLUB, `sweep-${CLUB.slice(0, 8)}`],
  );
  await db.query(
    `insert into onzio.clubs (id, slug, name, lifecycle, public_access, tier, archived_at)
     values ($1, $2, 'Sweep Archived', 'archived', 'suspended', 'starter', now())`,
    [ARCHIVED, `sweep-${ARCHIVED.slice(0, 8)}`],
  );
});

afterAll(async () => {
  for (const club of [CLUB, ARCHIVED]) {
    await db.query("delete from onzio.audit_events where club_id = $1", [club]);
    for (const table of ["program_media", "programs", "club_logo_page_content", "site_social_links"]) {
      await db.query(`delete from onzio.${table} where club_id = $1`, [club]);
    }
    await db.query("delete from onzio_private.media_pins where club_id = $1", [club]);
    await db.query("delete from onzio.media_assets where club_id = $1", [club]);
    await db.query("delete from onzio.clubs where id = $1", [club]);
  }
  if (reportRunIds.length) {
    await db.query("delete from onzio.audit_events where resource_type = 'media_sweep' and resource_id = any($1)", [reportRunIds]);
  }
  await db.end();
});

describe("pins", () => {
  it("count as referenced: retire answers 'referenced' until the pin is removed", async () => {
    const a = await asset();
    await db.query("insert into onzio_private.media_pins (club_id, object_path, reason) values ($1,$2,'test pin')", [CLUB, a.path]);
    expect(await retire(a.id)).toEqual({ status: "referenced" });
    const { rows: still } = await db.query("select status from onzio.media_assets where id = $1", [a.id]);
    expect(still[0].status).toBe("published");

    await db.query("delete from onzio_private.media_pins where club_id = $1 and object_path = $2", [CLUB, a.path]);
    expect((await retire(a.id)).status).toBe("retired");
  });

  it("are reported as pinned by the scan, never waiting or candidate, and clear the clock", async () => {
    const a = await asset({ publishedAgo: "interval '3 days'", unreferencedAgo: "interval '3 days'" });
    await db.query("insert into onzio_private.media_pins (club_id, object_path, reason) values ($1,$2,'test pin')", [CLUB, a.path]);
    const { club } = await scan();
    expect(club.pinned).toContainEqual({ assetId: a.id, path: a.path });
    expect(club.waiting.map((w: any) => w.assetId)).not.toContain(a.id);
    expect(club.candidates.map((c: any) => c.assetId)).not.toContain(a.id);
    expect(await clock(a.id)).toBeNull();
  });

  it("only pin a path of the same club and refuse a path under another club", async () => {
    const a = await asset();
    await db.query("insert into onzio_private.media_pins (club_id, object_path, reason) values ($1,$2,'other club')", [ARCHIVED, a.path])
      .then(() => { throw new Error("expected the check to refuse"); }, (error: { code?: string }) => expect(error.code).toBe("23514"));
    // A pin for another club with the same path text does not protect this club's asset.
    await db.query("insert into onzio_private.media_pins (club_id, object_path, reason) values ($1,$2,'x')", [ARCHIVED, `${ARCHIVED}/homepage/x.webp`]);
    expect((await retire(a.id)).status).toBe("retired");
  });

  it("are seeded for Rose City only where the club exists, with RLS on and no client rights", async () => {
    const { rows } = await db.query("select relrowsecurity from pg_class where oid = 'onzio_private.media_pins'::regclass");
    expect(rows[0].relrowsecurity).toBe(true);
    const { rows: policies } = await db.query("select count(*)::int as n from pg_policies where schemaname='onzio_private' and tablename in ('media_pins','media_reference_columns')");
    expect(policies[0].n).toBe(0);
    const { rows: seeded } = await db.query("select count(*)::int as n from onzio_private.media_pins where club_id = '32ceba0b-4e25-52c2-bb6b-d82fb87637a7'");
    const { rows: exists } = await db.query("select count(*)::int as n from onzio.clubs where id = '32ceba0b-4e25-52c2-bb6b-d82fb87637a7'");
    expect(seeded[0].n).toBe(exists[0].n === 0 ? 0 : 14);
  });
});

describe("the reference check", () => {
  it("still counts every registered JSON and text column", async () => {
    const logo = await asset();
    await db.query("insert into onzio.club_logo_page_content (club_id, color_cards) values ($1, $2::jsonb)",
      [CLUB, JSON.stringify([{ image_url: `https://x.example/storage/v1/object/public/onzio-media/${logo.path}` }])]);
    expect(await retire(logo.id)).toEqual({ status: "referenced" });

    const feature = await asset();
    await db.query("update onzio.club_logo_page_content set color_cards = '[]'::jsonb, features = $2::jsonb where club_id = $1",
      [CLUB, JSON.stringify([{ patch: feature.path }])]);
    expect(await retire(logo.id).then((r) => r.status)).toBe("retired");
    expect(await retire(feature.id)).toEqual({ status: "referenced" });
    await db.query("update onzio.club_logo_page_content set features = '[]'::jsonb where club_id = $1", [CLUB]);
    expect((await retire(feature.id)).status).toBe("retired");

    const icon = await asset();
    await db.query("insert into onzio.site_social_links (club_id, id, label, href, icon) values ($1,'sweep-icon','X','https://x.example',$2)", [CLUB, icon.path]);
    expect(await retire(icon.id)).toEqual({ status: "referenced" });
    await db.query("delete from onzio.site_social_links where club_id = $1", [CLUB]);
    expect((await retire(icon.id)).status).toBe("retired");
  });

  it("still counts foreign keys and url columns", async () => {
    const programId = randomUUID();
    await db.query("insert into onzio.programs(id,club_id,slug,display_title) values($1,$2,$3,'Sweep program')", [programId, CLUB, `p-${programId}`]);
    const fk = await asset();
    const row = randomUUID();
    await db.query("insert into onzio.program_media(id,club_id,program_id,url,media_asset_id) values($1,$2,$3,$4,$5)",
      [row, CLUB, programId, "https://example.test/x.webp", fk.id]);
    expect(await retire(fk.id)).toEqual({ status: "referenced" });
    await db.query("delete from onzio.program_media where id = $1", [row]);

    const url = await asset();
    const urlRow = randomUUID();
    await db.query("insert into onzio.program_media(id,club_id,program_id,url) values($1,$2,$3,$4)",
      [urlRow, CLUB, programId, `https://media.example/storage/v1/object/public/onzio-media/${url.path}`]);
    expect(await retire(url.id)).toEqual({ status: "referenced" });
    await db.query("delete from onzio.program_media where id = $1", [urlRow]);
    await db.query("delete from onzio.programs where id = $1", [programId]);
    expect((await retire(url.id)).status).toBe("retired");
  });
});

describe("scan", () => {
  it("sets unreferenced_since once, keeps it, and clears it when the asset is referenced again", async () => {
    const programId = randomUUID();
    await db.query("insert into onzio.programs(id,club_id,slug,display_title) values($1,$2,$3,'Sweep clock')", [programId, CLUB, `c-${programId}`]);
    const a = await asset({ publishedAgo: "interval '3 days'" });
    expect(await clock(a.id)).toBeNull();

    const first = await scan();
    const set = await clock(a.id);
    expect(set).not.toBeNull();
    expect(first.club.waiting).toContainEqual(expect.objectContaining({ assetId: a.id, path: a.path, surface: "homepage" }));
    expect(first.club.candidates.map((c: any) => c.assetId)).not.toContain(a.id);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await scan();
    expect(await clock(a.id)).toBe(set);

    const row = randomUUID();
    await db.query("insert into onzio.program_media(id,club_id,program_id,url) values($1,$2,$3,$4)",
      [row, CLUB, programId, `https://media.example/storage/v1/object/public/onzio-media/${a.path}`]);
    const third = await scan();
    expect(await clock(a.id)).toBeNull();
    expect(third.club.waiting.map((w: any) => w.assetId)).not.toContain(a.id);
    expect(third.club.referencedCount).toBeGreaterThanOrEqual(1);

    await db.query("delete from onzio.program_media where id = $1", [row]);
    await db.query("delete from onzio.programs where id = $1", [programId]);
    await scan();
    const restarted = await clock(a.id);
    expect(restarted).not.toBeNull();
    expect(restarted! > set!).toBe(true);
  });

  it("makes an asset a candidate only when the clock and the publish time are both older than the grace", async () => {
    const both = await asset({ publishedAgo: `${HOUR} * 48`, unreferencedAgo: `${HOUR} * 25` });
    const freshPublish = await asset({ publishedAgo: `${HOUR} * 2`, unreferencedAgo: `${HOUR} * 48` });
    const freshClock = await asset({ publishedAgo: `${HOUR} * 72`, unreferencedAgo: `${HOUR} * 2` });
    const noClock = await asset({ publishedAgo: `${HOUR} * 72` });
    const { club } = await scan();
    const candidates = club.candidates.map((c: any) => c.assetId);
    const waiting = club.waiting.map((w: any) => w.assetId);
    expect(candidates).toContain(both.id);
    expect(candidates).not.toContain(freshPublish.id);
    expect(candidates).not.toContain(freshClock.id);
    expect(candidates).not.toContain(noClock.id);
    expect(waiting).toEqual(expect.arrayContaining([freshPublish.id, freshClock.id, noClock.id]));
    const entry = club.candidates.find((c: any) => c.assetId === both.id);
    expect(entry).toMatchObject({ path: both.path, surface: "homepage" });
    expect(entry.publishedAt).toBeTruthy();
    expect(entry.unreferencedSince).toBeTruthy();
    // published = every bucket together
    expect(club.published).toBe(club.referencedCount + club.pinned.length + club.waiting.length + club.candidates.length);
  });

  it("leaves archived clubs to the purge", async () => {
    const a = await asset({ club: ARCHIVED, publishedAgo: `${HOUR} * 72` });
    const { raw } = await scan();
    expect((raw.clubs as Array<{ clubId: string }>).map((c) => c.clubId)).not.toContain(ARCHIVED);
    expect(await clock(a.id)).toBeNull();
  });

  it("rejects a negative grace", async () => {
    const { error } = await clients.service.rpc("media_orphan_sweep_scan", { p_grace: "-1 hour" });
    expect(error?.message).toContain("INVALID_GRACE");
  });

  it("reports stray storage objects as a number or null, never fails", async () => {
    const { raw } = await scan();
    expect(raw.strayObjects === null || typeof raw.strayObjects === "number").toBe(true);
  });
});

describe("the dry-run report", () => {
  it("writes one row per club and a summary row, and changes no asset", async () => {
    const waiting = await asset({ publishedAgo: `${HOUR} * 72` });
    const candidate = await asset({ publishedAgo: `${HOUR} * 72`, unreferencedAgo: `${HOUR} * 30` });
    const pinned = await asset({ publishedAgo: `${HOUR} * 72` });
    await db.query("insert into onzio_private.media_pins (club_id, object_path, reason) values ($1,$2,'test pin')", [CLUB, pinned.path]);

    const runId = randomUUID();
    reportRunIds.push(runId);
    const summary = await runMediaOrphanSweep({ service: clients.service as never, mode: "dry-run", runId });
    expect(summary).toMatchObject({ mode: "dry-run", runId, retired: 0, skipped: 0, failed: 0, trashPurged: 0, halted: false });

    const { rows } = await db.query(
      "select club_id, actor_type, operation, resource_type, payload from onzio.audit_events where resource_type = 'media_sweep' and resource_id = $1",
      [runId],
    );
    for (const row of rows) {
      expect(row).toMatchObject({ actor_type: "system", operation: "media.orphan_sweep_report", resource_type: "media_sweep" });
    }
    const summaryRows = rows.filter((row) => row.club_id === null);
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0].payload).toMatchObject({ mode: "dry-run", runId });
    const clubRow = rows.find((row) => row.club_id === CLUB)!;
    expect(clubRow.payload).toMatchObject({ mode: "dry-run", graceHours: 24, wouldHaltClub: expect.any(Boolean) });
    expect(clubRow.payload.pinned).toContainEqual({ assetId: pinned.id, path: pinned.path });
    expect(clubRow.payload.candidates.map((c: any) => c.assetId)).toContain(candidate.id);
    expect(clubRow.payload.waiting.map((w: any) => w.assetId)).toContain(waiting.id);
    expect(clubRow.payload.retired).toBeUndefined();
    expect(rows.filter((row) => row.club_id === ARCHIVED)).toHaveLength(0);

    const { rows: still } = await db.query("select status, deleted_at from onzio.media_assets where id = $1", [candidate.id]);
    expect(still[0]).toEqual({ status: "published", deleted_at: null });
  });
});

describe("grants", () => {
  it("lets only the service role run the scan and read the private tables", async () => {
    const fn = "onzio.media_orphan_sweep_scan(interval)";
    const core = "onzio_private.media_orphan_sweep_scan_core(interval)";
    for (const role of ["anon", "authenticated"]) {
      for (const f of [fn, core]) {
        const { rows } = await db.query("select has_function_privilege($1, $2, 'execute') as ok", [role, f]);
        expect(rows[0].ok, `${role} ${f}`).toBe(false);
      }
      const { rows } = await db.query("select has_function_privilege($1, 'onzio_private.media_asset_has_references(uuid,uuid,text)', 'execute') as ok", [role]);
      expect(rows[0].ok).toBe(false);
      for (const table of ["onzio_private.media_pins", "onzio_private.media_reference_columns"]) {
        for (const privilege of ["select", "insert", "update", "delete"]) {
          const { rows: t } = await db.query("select has_table_privilege($1, $2, $3) as ok", [role, table, privilege]);
          expect(t[0].ok, `${role} ${privilege} ${table}`).toBe(false);
        }
      }
    }
    const { rows } = await db.query("select has_function_privilege('service_role', $1, 'execute') as ok", [fn]);
    expect(rows[0].ok).toBe(true);
    const { rows: pins } = await db.query("select has_table_privilege('service_role', 'onzio_private.media_pins', 'select') as ok");
    expect(pins[0].ok).toBe(true);
  });

  it("refuses the scan through the public API for anon and signed-in users", async () => {
    const session = await createFreshLocalClient({ email: "owner-aal2@alpha.local", userId: USER_IDS.ownerAal2 });
    try {
      for (const client of [clients.anon, session.client.schema("onzio")]) {
        const { error } = await client.rpc("media_orphan_sweep_scan", { p_grace: "24 hours" });
        expectPostgrestError(error, "42501", "media_orphan_sweep_scan must be refused");
      }
    } finally {
      await session.cleanup();
    }
  });
});

// Every json/jsonb column on a club table is either a media reference the check searches
// (media_reference_columns) or classified here with the reason it cannot hold a live media
// reference. A new column fails this test until someone decides which.
const NOT_MEDIA: Record<string, string> = {
  // Audit and receipts: history, not live references. homepage_save_receipts.response holds a
  // historical response that may name old paths; it is not something the site renders.
  "onzio.audit_events.payload": "audit log",
  "onzio_private.about_editor_receipts.response": "save receipt (history)",
  "onzio_private.chick_fil_a_save_receipts.response": "save receipt (history)",
  "onzio_private.cinematic_contact_save_receipts.response": "save receipt (history)",
  "onzio_private.cinematic_injury_report_save_receipts.response": "save receipt (history)",
  "onzio_private.cinematic_news_save_receipts.response": "save receipt (history)",
  "onzio_private.cinematic_partners_save_receipts.response": "save receipt (history)",
  "onzio_private.cinematic_policy_save_receipts.response": "save receipt (history)",
  "onzio_private.contact_editor_receipts.response": "save receipt (history)",
  "onzio_private.homepage_save_receipts.response": "save receipt (historical, not a live reference)",
  "onzio_private.program_directory_receipts.response": "save receipt (history)",
  "onzio_private.program_page_receipts.response": "save receipt (history)",
  "onzio_private.robinson_save_receipts.response": "save receipt (history)",
  "onzio_private.shop_page_receipts.response": "save receipt (history)",
  "onzio_private.sign_up_settings_receipts.response": "save receipt (history)",
  "onzio_private.stadium_save_receipts.response": "save receipt (history)",
  "onzio_private.ticket_page_save_receipts.response": "save receipt (history)",
  "onzio_private.tickets_save_receipts.response": "save receipt (history)",
  "onzio_private.tryouts_page_save_receipts.response": "save receipt (history)",
  // Cinematic page content: images are stored as asset ids and mirrored into the table's
  // *_media_asset_id foreign-key columns (or a child table's media_asset_id), which the check
  // counts. The JSON holds ids, not paths.
  "onzio.cinematic_chick_fil_a_content.content": "asset ids mirrored in *_media_asset_id foreign keys",
  "onzio.cinematic_partners_content.content": "logos are rows in cinematic_partners (logo_media_asset_id)",
  "onzio.cinematic_robinson_content.content": "asset ids mirrored in *_media_asset_id foreign keys",
  "onzio.cinematic_shop_content.content": "asset ids mirrored in *_media_asset_id foreign keys",
  "onzio.cinematic_stadium_content.content": "asset ids mirrored in *_media_asset_id foreign keys",
  "onzio.cinematic_ticket_pages.content": "images are rows in cinematic_ticket_page_images (media_asset_id)",
  "onzio.cinematic_tickets_content.content": "asset ids mirrored in *_media_asset_id foreign keys",
  "onzio.cinematic_injury_report_content.content": "asset ids mirrored in *_media_asset_id foreign keys",
  "onzio.homepage_revamp_content.content": "asset ids mirrored in *_media_asset_id foreign keys",
  "onzio.homepage_revamp_content.presentation_config": "presentation tokens, no media",
  "onzio.cinematic_news_articles.content": "text blocks; the cover is cover_media_asset_id",
  // Text-only or structured data that holds no images.
  "onzio.cinematic_contact_content.content": "text and links",
  "onzio.cinematic_policy_content.content": "text",
  "onzio.about_page_content.story_paragraphs": "text",
  "onzio.about_page_content.values": "text",
  "onzio.club_identity.highlights": "text",
  "onzio.matches.scorers": "names and minutes",
  "onzio.matches.summary": "text",
  "onzio.presentation_documents.configuration": "presentation tokens, no media",
  "onzio.presentation_publications.validation_result": "validation output",
  "onzio.programs.highlights": "text",
  "onzio.registration_form_fields.options": "form choices",
  "onzio.registrations.answers": "visitor form answers",
  "onzio.shop_kit_section.bullet_points": "text",
  "onzio.shop_purchase_details.cards": "text cards, no images",
};

describe("json column classification", () => {
  it("classifies every json/jsonb column on a club table as searched or not media", async () => {
    const { rows } = await db.query<{ name: string }>(
      `select c.table_schema || '.' || c.table_name || '.' || c.column_name as name
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
       where c.data_type in ('json', 'jsonb') and c.table_schema in ('onzio', 'onzio_private')
         and exists (select 1 from information_schema.columns k
                     where k.table_schema = c.table_schema and k.table_name = c.table_name and k.column_name = 'club_id')
       order by 1`,
    );
    const actual = rows.map((row) => row.name);
    const { rows: registry } = await db.query<{ name: string }>(
      "select table_name || '.' || column_name as name from onzio_private.media_reference_columns",
    );
    const searched = new Set(registry.map((row) => row.name));

    const unclassified = actual.filter((name) => !searched.has(name) && !(name in NOT_MEDIA));
    expect(unclassified, "add each to media_reference_columns (if it embeds a media path) or to NOT_MEDIA with the reason").toEqual([]);

    const both = actual.filter((name) => searched.has(name) && name in NOT_MEDIA);
    expect(both).toEqual([]);

    const stale = Object.keys(NOT_MEDIA).filter((name) => !actual.includes(name));
    expect(stale, "classified columns that no longer exist").toEqual([]);
  });

  it("registers only columns that exist on a table with club_id", async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string; ok: boolean }>(
      `select reg.table_name, reg.column_name,
         exists (select 1 from pg_attribute a where a.attrelid = to_regclass(reg.table_name) and a.attname = reg.column_name and not a.attisdropped)
         and exists (select 1 from pg_attribute a where a.attrelid = to_regclass(reg.table_name) and a.attname = 'club_id' and not a.attisdropped) as ok
       from onzio_private.media_reference_columns reg order by 1, 2`,
    );
    expect(rows.filter((row) => !row.ok)).toEqual([]);
    expect(rows.map((row) => `${row.table_name}.${row.column_name}`)).toEqual([
      "onzio.club_logo_page_content.color_cards",
      "onzio.club_logo_page_content.features",
      "onzio.site_social_links.icon",
    ]);
  });

  it("gives every registered column a write-side guard trigger, so a new link is serialized against retirement", async () => {
    const { rows } = await db.query<{ name: string; guarded: boolean }>(
      `select reg.table_name || '.' || reg.column_name as name,
         exists (
           select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
           join pg_namespace n on n.oid = p.pronamespace
           where t.tgrelid = to_regclass(reg.table_name) and not t.tgisinternal
             and n.nspname = 'onzio_private' and p.proname = 'guard_media_reference'
             and split_part(encode(t.tgargs, 'escape'), '\\000', 1) = reg.column_name
         ) as guarded
       from onzio_private.media_reference_columns reg order by 1`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.guarded).map((row) => row.name), "registered columns without a guard_media_reference trigger").toEqual([]);
  });
});
