// MLA P1 Step 8: seed Manu Ledesma Academy as a local preview tenant on the
// pathway@1 presentation template.
//
// Local-only, service-role seeding against the developer's local Supabase
// stack -- the structural sibling of the other local import scripts, minus
// the media pipeline (Phase 1 ships no crest asset; PathwayNav renders its
// initials fallback for a club with no site_branding row).
//
// It inserts:
//   - one onzio.clubs row (deterministic id, kind "test", lifecycle
//     "onboarding", public_access "preview", tier "starter"),
//   - one verified primary onzio.club_domains row for
//     manu-ledesma-academy.localhost. Middleware resolves *.localhost hosts
//     by slug without a domain row, but getClubContextBySlug
//     (lib/club-context.ts) unconditionally requires a verified primary
//     domain for ONZIO_ENVIRONMENT and fails PRIMARY_DOMAIN_REQUIRED
//     otherwise -- every route page resolves club context through it, so
//     the domain row is load-bearing for local rendering, matching what
//     every sibling local import seeds.
//   - the presentation triple (presentation_documents /
//     presentation_state / presentation_publications), row-for-row on the
//     local-import precedent in lib/migration. The document itself is built
//     and validated by scripts/mla-pathway-presentation.ts, whose
//     production-surface parse is the single most important gate here: an
//     invalid published document does not error at render time, it silently
//     degrades the tenant to presentationTemplateKey null.
//
// Usage (env sourced from the running local stack, same as the sibling
// import scripts' npm entries):
//
//   eval "$(supabase status -o env 2>/dev/null)"; \
//     NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
//     SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
//     SUPABASE_DB_URL="$DB_URL" \
//     npx tsx scripts/seed-mla-local.ts
//
// Never run against a hosted project; the loopback assertions below refuse
// non-localhost targets. The hosted counterpart is
// scripts/provision-mla-staging.ts (written for Christian to run explicitly;
// never executed by agents).

import { isDeepStrictEqual } from "node:util";
import { Client as PostgresClient } from "pg";
import { deterministicUuid } from "@/lib/migration/rose-city-plan";
import {
  buildMlaPathwayPresentationConfiguration,
  MLA_NAME,
  MLA_SLUG,
} from "@/scripts/mla-pathway-presentation";
import { parsePresentationDocument } from "@/packages/presentation";

export const MLA_LOCAL_TENANT_ID = deterministicUuid(
  `onzio:club:${MLA_SLUG}`,
);
export const MLA_LOCAL_HOSTNAME = `${MLA_SLUG}.localhost`;
export const MLA_LOCAL_DOMAIN_ID = deterministicUuid(
  `onzio:domain:${MLA_LOCAL_HOSTNAME}`,
);
export const MLA_LOCAL_PRESENTATION_DOCUMENT_ID = deterministicUuid(
  `onzio:${MLA_SLUG}:presentation:pathway@1:published`,
);
export const MLA_LOCAL_PRESENTATION_PUBLICATION_ID = deterministicUuid(
  `onzio:${MLA_SLUG}:presentation-publication:pathway@1:published`,
);
// The deterministic local-contract auth fixture from supabase/seed.sql --
// the same actor the sibling local imports use to satisfy the
// `created_by ... references auth.users(id)` constraints on the
// presentation tables. Exists only on local stacks seeded by `supabase db
// reset`; its presence is verified before any insert.
export const MLA_LOCAL_PRESENTATION_ACTOR_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

const SEED_TIMESTAMP = "2026-08-15T00:00:00.000Z";

function assertLoopbackUrl(raw: string | undefined, name: string): string {
  if (!raw) throw new Error(`${name} is required.`);
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(`${name} must use a loopback host. Refusing to run.`);
  }
  return raw.replace(/\/$/, "");
}

async function main() {
  assertLoopbackUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const dbUrl = assertLoopbackUrl(process.env.SUPABASE_DB_URL, "SUPABASE_DB_URL");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.length < 32) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }

  // Throws (non-zero exit via the catch below) on any schema, registry,
  // provenance, config-safety, or theme-contrast failure -- see the module's
  // doc comment for why this must happen before any insert.
  const { configuration, configurationDigest } =
    buildMlaPathwayPresentationConfiguration({
      createdBy: MLA_LOCAL_PRESENTATION_ACTOR_ID,
      createdAt: SEED_TIMESTAMP,
    });

  const now = SEED_TIMESTAMP;
  const client = new PostgresClient({ connectionString: dbUrl });
  await client.connect();
  try {
    const actor = await client.query(
      "select 1 from auth.users where id = $1::uuid",
      [MLA_LOCAL_PRESENTATION_ACTOR_ID],
    );
    if (actor.rowCount !== 1) {
      throw new Error(
        `Seed auth user ${MLA_LOCAL_PRESENTATION_ACTOR_ID} is missing. ` +
          "Run `supabase db reset` so supabase/seed.sql applies, then re-run.",
      );
    }

    await client.query("begin");
    try {
      await client.query(
        `insert into onzio.clubs
           (id, slug, name, kind, lifecycle, public_access, tier,
            stripe_price_id, primary_color, secondary_color,
            created_at, updated_at, archived_at)
         values ($1, $2, $3, $4, $5, $6, $7, null, null, null, $8, $8, null)
         on conflict (id) do update set
           slug = excluded.slug,
           name = excluded.name,
           kind = excluded.kind,
           lifecycle = excluded.lifecycle,
           public_access = excluded.public_access,
           tier = excluded.tier,
           updated_at = excluded.updated_at`,
        [
          MLA_LOCAL_TENANT_ID,
          MLA_SLUG,
          MLA_NAME,
          "test",
          "onboarding",
          "preview",
          "starter",
          now,
        ],
      );

      // environment "staging" matches local development's
      // ONZIO_ENVIRONMENT=staging (docs/local-development.md), the value
      // getClubContextBySlug filters primary-domain lookups by -- the same
      // choice every sibling local import makes.
      await client.query(
        `insert into onzio.club_domains
           (id, club_id, hostname, is_primary, verified_at, environment,
            active, created_at, updated_at)
         values ($1, $2, $3, true, $4, 'staging', true, $4, $4)
         on conflict (id) do update set
           hostname = excluded.hostname,
           is_primary = excluded.is_primary,
           verified_at = excluded.verified_at,
           active = excluded.active,
           updated_at = excluded.updated_at`,
        [MLA_LOCAL_DOMAIN_ID, MLA_LOCAL_TENANT_ID, MLA_LOCAL_HOSTNAME, now],
      );

      // presentation_documents rows are immutable/insert-only by design
      // (same as the sibling importers' INSERT_ONLY_TABLES): conflict does
      // nothing rather than rewriting history.
      await client.query(
        `insert into onzio.presentation_documents
           (id, club_id, version, schema_version, template_id,
            template_version, configuration, configuration_digest,
            created_by, created_at)
         values ($1, $2, 1, 1, 'pathway', 1, $3::jsonb, $4, $5, $6)
         on conflict (id) do nothing`,
        [
          MLA_LOCAL_PRESENTATION_DOCUMENT_ID,
          MLA_LOCAL_TENANT_ID,
          JSON.stringify(configuration),
          configurationDigest,
          MLA_LOCAL_PRESENTATION_ACTOR_ID,
          now,
        ],
      );

      await client.query(
        `insert into onzio.presentation_state
           (club_id, draft_document_id, published_document_id,
            updated_by, updated_at)
         values ($1, null, $2, $3, $4)
         on conflict (club_id) do update set
           draft_document_id = excluded.draft_document_id,
           published_document_id = excluded.published_document_id,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
        [
          MLA_LOCAL_TENANT_ID,
          MLA_LOCAL_PRESENTATION_DOCUMENT_ID,
          MLA_LOCAL_PRESENTATION_ACTOR_ID,
          now,
        ],
      );

      await client.query(
        `insert into onzio.presentation_publications
           (id, club_id, action, previous_document_id, next_document_id,
            next_configuration_digest, validation_result, override_reason,
            created_by, created_at)
         values ($1, $2, 'publish', null, $3, $4, $5::jsonb, null, $6, $7)
         on conflict (id) do nothing`,
        [
          MLA_LOCAL_PRESENTATION_PUBLICATION_ID,
          MLA_LOCAL_TENANT_ID,
          MLA_LOCAL_PRESENTATION_DOCUMENT_ID,
          configurationDigest,
          JSON.stringify({ valid: true, errors: [], warnings: [] }),
          MLA_LOCAL_PRESENTATION_ACTOR_ID,
          now,
        ],
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    // Reconcile: re-read what render-time resolution will read and re-parse
    // it at the production surface, so a bad seed fails here instead of
    // silently degrading the tenant chrome.
    const seeded = await client.query(
      `select
         (select count(*)::integer from onzio.clubs where id = $1) as clubs,
         (select count(*)::integer from onzio.club_domains
            where club_id = $1 and is_primary and active
              and verified_at is not null and environment = 'staging') as domains,
         (select count(*)::integer from onzio.presentation_documents
            where club_id = $1) as documents,
         (select count(*)::integer from onzio.presentation_state
            where club_id = $1 and published_document_id = $2) as state,
         (select count(*)::integer from onzio.presentation_publications
            where club_id = $1) as publications,
         (select configuration from onzio.presentation_documents
            where id = $2) as configuration`,
      [MLA_LOCAL_TENANT_ID, MLA_LOCAL_PRESENTATION_DOCUMENT_ID],
    );
    const row = seeded.rows[0];
    if (
      row.clubs !== 1 ||
      row.domains !== 1 ||
      row.documents !== 1 ||
      row.state !== 1 ||
      row.publications !== 1
    ) {
      throw new Error(`MLA seed reconciliation failed: ${JSON.stringify(row)}`);
    }
    // jsonb does not preserve key order, so the re-read document cannot be
    // compared by re-digesting its serialization -- deep equality against
    // the validated in-memory document is the honest check.
    const persisted = parsePresentationDocument(row.configuration, {
      surface: "production",
    });
    if (!isDeepStrictEqual(persisted, configuration)) {
      throw new Error("Persisted configuration does not match the validated document.");
    }

    console.log(
      JSON.stringify({
        tenant: {
          id: MLA_LOCAL_TENANT_ID,
          slug: MLA_SLUG,
          localUrl: `http://${MLA_LOCAL_HOSTNAME}:3000`,
        },
        domain: { id: MLA_LOCAL_DOMAIN_ID, hostname: MLA_LOCAL_HOSTNAME },
        presentation: {
          documentId: MLA_LOCAL_PRESENTATION_DOCUMENT_ID,
          publicationId: MLA_LOCAL_PRESENTATION_PUBLICATION_ID,
          templateKey: "pathway@1",
          configurationDigest,
          productionSurfaceParse: "passed",
        },
        counts: {
          clubs: row.clubs,
          domains: row.domains,
          documents: row.documents,
          state: row.state,
          publications: row.publications,
        },
        hostedMutations: 0,
      }),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
