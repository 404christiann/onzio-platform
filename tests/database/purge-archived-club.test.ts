import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

// Operator hard purge (onzio.purge_archived_club): one transaction that
// deletes every row of an archived club and leaves every other club as it
// was. Each test runs in a transaction that is rolled back, and applies the
// migration inside it, so it runs whether or not the local database has it.

const MIGRATION = resolve(
  __dirname,
  "../../supabase/migrations/20261110210000_purge_archived_club.sql",
);
const OPERATOR = USER_IDS.ownerAal2;
const LEDGERS = ["onzio.audit_events", "onzio.stripe_events", "onzio.club_exports"];

// One row in every club table for the club in purge_test.club_id: archived,
// suspended, domain inactive, no live subscription, a Connect account that
// can't take payments, and a verified export. A new club table must get a
// row here (the first test fails until it does) and a place in the
// function's delete order.
const FIXTURE = `
do $fixture$
declare
  c uuid := current_setting('purge_test.club_id')::uuid;
  owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  asset uuid := gen_random_uuid();
  season uuid := gen_random_uuid();
  player uuid := gen_random_uuid();
  match uuid := gen_random_uuid();
  form uuid := gen_random_uuid();
  price uuid := gen_random_uuid();
  program uuid := gen_random_uuid();
  doc uuid := gen_random_uuid();
  digest text := repeat('d', 64);
begin
  insert into onzio.clubs (id, slug, name, lifecycle, public_access, tier, archived_at)
  values (c, 'purge-' || left(c::text, 8), 'Purge Target', 'archived', 'suspended', 'starter', now());

  insert into onzio.club_domains (club_id, hostname, environment, active)
  values (c, 'purge-' || left(c::text, 8) || '.example', 'staging', false);
  insert into onzio.club_members (user_id, club_id, role) values (owner, c, 'owner');
  insert into onzio.club_subscriptions (club_id) values (c);
  insert into onzio.media_assets (id, club_id, storage_bucket, storage_path, surface, media_kind, mime_type, byte_size, width, height, checksum_sha256, status, published_at)
  values (asset, c, 'onzio-media', c || '/branding/' || asset || '.png', 'branding', 'graphic', 'image/png', 100, 50, 50, repeat('c', 64), 'published', now());
  insert into onzio.media_cleanup_queue (club_id, storage_bucket, storage_path, reason)
  values (c, 'onzio-upload-staging', c || '/branding/' || gen_random_uuid() || '.png', 'abandoned-staging-object');

  insert into onzio.seasons (id, club_id, label, start_year, end_year) values (season, c, '2026', 2026, 2026);
  insert into onzio.players (id, club_id, number, name, position, age, photo_asset_id) values (player, c, 1, 'Keeper', 'Goalkeeper', 20, asset);
  insert into onzio.staff (club_id, name, role, photo_asset_id) values (c, 'Coach', 'Head coach', asset);
  insert into onzio.matches (id, club_id, season_id, date, time, opponent, opponent_logo_asset_id) values (match, c, season, '2026-05-01', '19:00', 'Rivals', asset);
  insert into onzio.player_photos (club_id, player_id, url, media_asset_id) values (c, player, 'https://example.com/p.png', asset);
  insert into onzio.player_match_stats (club_id, player_id, match_id) values (c, player, match);
  insert into onzio.goalkeeper_match_stats (club_id, player_id, match_id) values (c, player, match);
  insert into onzio.player_season_stats (club_id, player_id, season_id) values (c, player, season);
  insert into onzio.goalkeeper_season_stats (club_id, player_id, season_id) values (c, player, season);
  insert into onzio.league_standings_settings (club_id) values (c);
  insert into onzio.league_standings (club_id, team_name, season_id, logo_asset_id) values (c, 'Purge Target', season, asset);

  insert into onzio.site_branding (club_id, club_logo_asset_id) values (c, asset);
  insert into onzio.site_social_links (club_id, id, label, href, icon) values (c, 'instagram', 'Instagram', 'https://instagram.com/x', 'instagram');
  insert into onzio.site_sponsor_logos (club_id, name, logo_url, media_asset_id, show_on_homepage) values (c, 'Sponsor', 'https://example.com/s.png', asset, true);
  insert into onzio.club_identity (club_id, short_name, initials, founded_year) values (c, 'Purge', 'PT', 2000);
  insert into onzio.club_stripe_connect (club_id, stripe_account_id, environment) values (c, 'acct_purge', 'test');

  insert into onzio.about_page_content (club_id, feature_image_asset_id) values (c, asset);
  insert into onzio.club_logo_page_content (club_id, map_image_asset_id) values (c, asset);
  insert into onzio.behind_the_rose_section (club_id) values (c);
  insert into onzio.homepage_slideshow_settings (club_id) values (c);
  insert into onzio.homepage_slideshow_photos (club_id, url, media_asset_id) values (c, 'https://example.com/h.png', asset);
  insert into onzio.homepage_hero_content (club_id) values (c);
  insert into onzio.homepage_story_section (club_id) values (c);
  insert into onzio.contact_profile (club_id) values (c);
  insert into onzio.contact_page_content (club_id, hero_media_asset_id) values (c, asset);
  insert into onzio.programs_page_content (club_id) values (c);
  insert into onzio.tryouts_page_content (club_id) values (c);
  insert into onzio.shop_kit_section (club_id, surface, kit_variant) values (c, 'shop', 'home');
  insert into onzio.shop_kit_photos (club_id, surface, kit_variant, url, media_asset_id) values (c, 'shop', 'home', 'https://example.com/k.png', asset);
  insert into onzio.shop_carousel_photos (club_id, kit_variant, url, media_asset_id) values (c, 'home', 'https://example.com/c.png', asset);
  insert into onzio.shop_purchase_details (club_id) values (c);

  insert into onzio.registration_forms (id, club_id, slug, title) values (form, c, 'join', 'Join');
  insert into onzio.registration_form_fields (club_id, form_id, field_key, label, field_type) values (c, form, 'name', 'Name', 'name');
  insert into onzio.registration_price_options (id, club_id, form_id, label, amount_cents) values (price, c, form, 'Full', 1000);
  insert into onzio.registrations (club_id, form_id, answers, registrant_email, price_option_id, price_label, amount_cents, waiver_accepted_at, status_token_hash, participant_type)
  values (c, form, '{}'::jsonb, 'parent@example.com', price, 'Full', 1000, now(), repeat('e', 64), 'adult');
  insert into onzio.programs (id, club_id, slug, display_title, hero_media_asset_id, registration_form_id) values (program, c, 'youth', 'Youth', asset, form);
  insert into onzio.program_media (club_id, program_id, media_asset_id) values (c, program, asset);
  insert into onzio.tryouts (club_id, program_id, registration_form_id, hero_media_asset_id) values (c, program, form, asset);

  insert into onzio.presentation_documents (id, club_id, version, schema_version, template_id, template_version, configuration, configuration_digest, created_by)
  values (doc, c, 1, 1, 'clubhouse', 1, '{}'::jsonb, digest, owner);
  insert into onzio.presentation_state (club_id, draft_document_id, published_document_id, updated_by) values (c, doc, doc, owner);
  insert into onzio.presentation_publications (club_id, action, next_document_id, next_configuration_digest, validation_result, created_by)
  values (c, 'publish', doc, digest, '{}'::jsonb, owner);

  insert into onzio.audit_events (club_id, actor_user_id, actor_type, operation, resource_type, resource_id, payload)
  values (c, owner, 'operator', 'archive', 'club', c::text, '{}'::jsonb);
  insert into onzio.stripe_events (id, club_id, environment, event_type, stripe_created_at, outcome, payload_digest)
  values ('evt_' || replace(c::text, '-', ''), c, 'test', 'customer.subscription.deleted', now(), 'applied', repeat('a', 64));
  insert into onzio.club_exports (id, club_id, club_slug, checksum_sha256, object_count, row_count, storage_reference, created_by)
  values ('export_' || c, c, 'purge-' || left(c::text, 8), repeat('b', 64), 1, 60, 'local://purge-test', owner);

  insert into onzio_private.about_editor_receipts (club_id, actor_id, operation_id, request_hash, response) values (c, owner, gen_random_uuid(), repeat('f', 64), '{}'::jsonb);
  insert into onzio_private.about_editor_revisions (club_id, page) values (c, 'logo') on conflict do nothing;
  insert into onzio_private.contact_editor_receipts (club_id, actor_id, operation_id, request_hash, response) values (c, owner, gen_random_uuid(), repeat('f', 64), '{}'::jsonb);
  insert into onzio_private.contact_editor_revisions (club_id) values (c) on conflict do nothing;
  insert into onzio_private.homepage_assignment_epochs (club_id) values (c) on conflict do nothing;
  insert into onzio_private.homepage_revisions (club_id) values (c) on conflict do nothing;
  insert into onzio_private.homepage_save_receipts (club_id, actor_id, operation_id, request_hash, response) values (c, owner, gen_random_uuid(), repeat('f', 64), '{}'::jsonb);
  insert into onzio_private.program_directory_receipts (club_id, actor_id, operation_id, request_hash, response) values (c, owner, gen_random_uuid(), repeat('f', 64), '{}'::jsonb);
  insert into onzio_private.program_page_receipts (club_id, actor_id, operation_id, request_hash, response) values (c, owner, gen_random_uuid(), repeat('f', 64), '{}'::jsonb);
  insert into onzio_private.shop_page_receipts (club_id, actor_id, surface, operation_id, request_hash, response) values (c, owner, 'shop', gen_random_uuid(), repeat('f', 64), '{}'::jsonb);
  insert into onzio_private.shop_page_revisions (club_id, surface) values (c, 'shop') on conflict do nothing;
  insert into onzio_private.tryouts_page_revisions (club_id) values (c) on conflict do nothing;
  insert into onzio_private.tryouts_page_save_receipts (club_id, actor_id, operation_id, request_hash, response) values (c, owner, gen_random_uuid(), repeat('f', 64), '{}'::jsonb);
end
$fixture$;
`;

let db: Client;
let club: string;
let slug: string;
let exportId: string;

async function clubTables(): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    `select format('%I.%I', c.table_schema, c.table_name) as name
     from information_schema.columns c
     join information_schema.tables t
       on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.column_name = 'club_id' and t.table_type = 'BASE TABLE'
       and c.table_schema in ('onzio', 'onzio_private', 'public')
     order by 1`,
  );
  return rows.map((row) => row.name);
}

async function count(table: string, where: string, values: unknown[]): Promise<number> {
  const { rows } = await db.query(`select count(*)::int as n from ${table} where ${where}`, values);
  return rows[0].n;
}

// Every other club's rows, per table, as one digest each.
async function otherClubs(): Promise<Record<string, string>> {
  const digests: Record<string, string> = {};
  for (const table of [...(await clubTables()), "onzio.clubs"]) {
    const column = table === "onzio.clubs" ? "id" : "club_id";
    const { rows } = await db.query(
      `select count(*)::int as n,
              md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as digest
       from ${table} t where ${column} <> $1`,
      [club],
    );
    digests[table] = `${rows[0].n}:${rows[0].digest}`;
  }
  return digests;
}

// As the server's service role. On a refusal the transaction is aborted;
// callers roll back to a savepoint, which also undoes the role.
async function purge(confirmation = slug, exportReference = exportId) {
  await db.query("set local role service_role");
  const { rows } = await db.query(
    "select onzio.purge_archived_club($1, $2, $3, $4) as result",
    [club, exportReference, confirmation, OPERATOR],
  );
  await db.query("reset role");
  return rows[0].result;
}

async function refuses(message: string, detail?: string) {
  await db.query("savepoint expected_failure");
  try {
    const error = await purge().then(
      () => null,
      (caught: { message: string; detail?: string }) => caught,
    );
    expect(error?.message).toBe(message);
    if (detail) expect(error?.detail).toContain(detail);
  } finally {
    await db.query("rollback to savepoint expected_failure");
  }
  expect(await count("onzio.clubs", "id = $1", [club])).toBe(1);
}

async function triggersEnabled(): Promise<string[]> {
  const { rows } = await db.query(
    `select tgname from pg_trigger
     where tgname in ('presentation_documents_immutable', 'presentation_publications_immutable')
       and tgenabled = 'O' order by 1`,
  );
  return rows.map((row) => row.tgname);
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
  await db.query(readFileSync(MIGRATION, "utf8"));
  club = randomUUID();
  slug = `purge-${club.slice(0, 8)}`;
  exportId = `export_${club}`;
  await db.query("select set_config('purge_test.club_id', $1, true)", [club]);
  await db.query(FIXTURE);
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("hard purge of an archived club", () => {
  it("deletes the club from every club table and leaves other clubs unchanged", async () => {
    const tables = await clubTables();
    for (const table of tables) {
      expect(await count(table, "club_id = $1", [club]), `${table} has a fixture row`).toBeGreaterThan(0);
    }
    const before = await otherClubs();

    const result = await purge();

    expect(result.status).toBe("purged");
    expect(result.club_slug).toBe(slug);
    for (const table of tables.filter((name) => !LEDGERS.includes(name))) {
      expect(result.rows_deleted[table], `${table} counted`).toBeGreaterThan(0);
      expect(await count(table, "club_id = $1", [club]), `${table} emptied`).toBe(0);
    }
    expect(result.rows_deleted["onzio.clubs"]).toBe(1);
    expect(await count("onzio.clubs", "id = $1", [club])).toBe(0);

    // Ledgers outlive the club: history kept with club_id null, export purged.
    expect(await count("onzio.audit_events", "club_id = $1", [club])).toBe(0);
    expect(await count("onzio.audit_events", "club_id is null and resource_id = $1 and operation = 'archive'", [club])).toBe(1);
    expect(await count("onzio.stripe_events", "club_id is null and id = $1", [`evt_${club.replaceAll("-", "")}`])).toBe(1);
    const { rows: exports } = await db.query(
      "select status, purged_at is not null as stamped from onzio.club_exports where id = $1",
      [exportId],
    );
    expect(exports).toEqual([{ status: "purged", stamped: true }]);

    const { rows: audit } = await db.query(
      `select id, club_id, actor_user_id, actor_type, resource_type, resource_id, payload
       from onzio.audit_events where operation = 'hard_purge' and resource_id = $1`,
      [club],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      id: String(result.audit_event_id),
      club_id: null,
      actor_user_id: OPERATOR,
      actor_type: "operator",
      resource_type: "purged_club",
      payload: {
        club_slug: slug,
        export_id: exportId,
        export_checksum: "b".repeat(64),
        // purgeClub records the Storage outcome in its own event after commit.
        storage: "pending",
        rows_deleted: result.rows_deleted,
      },
    });

    expect(await otherClubs()).toEqual(before);
    expect(await triggersEnabled()).toEqual([
      "presentation_documents_immutable",
      "presentation_publications_immutable",
    ]);
  });

  it("retries as already purged with the same export and slug, and nothing else", async () => {
    await purge();
    await expect(purge()).resolves.toEqual({ status: "already_purged", club_id: club, club_slug: slug });
    await db.query("savepoint wrong_slug");
    await expect(purge("someone-else")).rejects.toThrow("CLUB_NOT_FOUND");
    await db.query("rollback to savepoint wrong_slug");
    await expect(purge(slug, "export_other")).rejects.toThrow("CLUB_NOT_FOUND");
  });

  it("refuses a club that is not archived", async () => {
    await db.query("update onzio.clubs set lifecycle = 'active', archived_at = null where id = $1", [club]);
    await refuses("CLUB_NOT_ARCHIVED");
  });

  it("refuses a confirmation that is not the club's slug", async () => {
    await db.query("savepoint expected_failure");
    await expect(purge("alpha")).rejects.toThrow("CONFIRMATION_MISMATCH");
    await db.query("rollback to savepoint expected_failure");
    expect(await count("onzio.clubs", "id = $1", [club])).toBe(1);
  });

  it("refuses without a verified export for this club", async () => {
    await db.query("update onzio.club_exports set club_id = $2 where id = $1", [exportId, CLUB_IDS.alpha]);
    await refuses("EXPORT_REQUIRED");
  });

  it("refuses while a domain is active", async () => {
    await db.query("update onzio.club_domains set active = true where club_id = $1", [club]);
    await refuses("PURGE_BLOCKED", "domain");
  });

  it("refuses while a Stripe subscription is live", async () => {
    await db.query(
      "update onzio.club_subscriptions set stripe_subscription_id = 'sub_purge', stripe_customer_id = 'cus_purge', price_id = 'price_purge', status = 'active' where club_id = $1",
      [club],
    );
    await refuses("PURGE_BLOCKED", "subscription");
  });

  it("refuses while the Stripe Connect account can take payments", async () => {
    await db.query("update onzio.club_stripe_connect set charges_enabled = true where club_id = $1", [club]);
    await refuses("PURGE_BLOCKED", "Connect");
  });

  it("refuses, and keeps everything, when a club table it doesn't know holds the club's rows", async () => {
    await db.query("create table public.purge_test_unknown (club_id uuid not null)");
    await db.query("insert into public.purge_test_unknown values ($1)", [club]);
    await refuses("PURGE_UNKNOWN_CLUB_TABLE", "public.purge_test_unknown");
    expect(await count("onzio.players", "club_id = $1", [club])).toBe(1);
    expect(await count("onzio.presentation_documents", "club_id = $1", [club])).toBe(1);
    expect(await triggersEnabled()).toHaveLength(2);
  });

  it("refuses when a delete changes another club's rows", async () => {
    await db.query(`
      create function public.purge_test_leak() returns trigger language plpgsql as $$
      begin
        insert into onzio.site_social_links (club_id, id, label, href, icon)
        values ('${CLUB_IDS.alpha}', 'purge-leak', 'Leak', 'https://example.com', 'link');
        return old;
      end $$;
      create trigger purge_test_leak after delete on onzio.staff
        for each row execute function public.purge_test_leak();
    `);
    await refuses("PURGE_OTHER_CLUB_CHANGED");
    expect(await count("onzio.site_social_links", "club_id = $1 and id = 'purge-leak'", [CLUB_IDS.alpha])).toBe(0);
  });

  it("can't be called by browser roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.query("savepoint browser_role");
      await db.query(`set local role ${role}`);
      await expect(
        db.query("select onzio.purge_archived_club($1, $2, $3, $4)", [club, exportId, slug, OPERATOR]),
      ).rejects.toThrow("permission denied");
      await db.query("rollback to savepoint browser_role");
    }
    expect(await count("onzio.clubs", "id = $1", [club])).toBe(1);
  });
});
