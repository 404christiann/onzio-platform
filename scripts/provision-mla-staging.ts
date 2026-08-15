// MLA P1 Step 8 (written, NOT run in Phase 1): provision Manu Ledesma
// Academy on hosted Supabase STAGING and publish its pathway@1 presentation
// document. Structural sibling of scripts/provision-diverse-city-production.ts,
// pointed at the shared staging project instead of production.
//
// This script mutates the hosted staging project. It is only ever executed
// by Christian, explicitly, if/when a staging review alias is actually
// wanted -- it is not required for Phase 1 completion and agents never run
// it. Two placeholders below (PRIMARY_DOMAIN and the owner identity) refuse
// execution until Christian replaces them with his real choices.
//
// Unlike the local seed (scripts/seed-mla-local.ts), which inserts rows
// directly, this goes through the real operator workflow: an interactive
// operator sign-in (email code + TOTP via acquireOperatorAccessToken), then
// provisionClub -- which creates the clubs row (kind "test", lifecycle
// "onboarding", public_access "preview", tier "starter" are hardcoded
// there), the verified primary club_domains row, the owner membership, and
// the audit event -- and finally the presentation triple publish using the
// same validated document the local seed publishes
// (scripts/mla-pathway-presentation.ts), with the provisioned owner as the
// authoring auth user for the `created_by references auth.users(id)`
// constraints.
//
// Usage (after replacing the placeholders):
//   npx tsx scripts/provision-mla-staging.ts \
//     mla-p1-provision-staging:fxefqnoqxbezeccjvrsw:manu-ledesma-academy

import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { provisionClub } from "@/lib/operator/provision-club";
import { acquireOperatorAccessToken } from "@/scripts/operator-session";
import {
  buildMlaPathwayPresentationConfiguration,
  MLA_NAME,
  MLA_SLUG,
} from "@/scripts/mla-pathway-presentation";

loadEnv({ path: ".env.local", quiet: true });

// "Onzio Platform Staging" -- the one shared staging Supabase project for
// the whole platform (same target as the other *-staging scripts).
const EXPECTED_PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const EXPECTED_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;

// PLACEHOLDER -- Christian must replace this with the real staging review
// alias he actually creates on Vercel before running. The
// "REPLACE-ME" marker below doubles as a refuse-to-run guard.
const PRIMARY_DOMAIN = "REPLACE-ME-manu-ledesma-academy-onzio-staging.vercel.app";

// PLACEHOLDER -- the owner identity for the staging club. If OWNER_EMAIL
// already has an auth user on staging (e.g. Christian's own account),
// EXISTING_OWNER_AUTH_USER_ID must be set to that user's id or provisionClub
// will fail trying to create a duplicate auth user; leave it null only for
// an email with no staging auth user yet.
const OWNER_EMAIL = "REPLACE-ME@example.com";
const EXISTING_OWNER_AUTH_USER_ID: string | null = null;

const CONFIRMATION = `mla-p1-provision-staging:${EXPECTED_PROJECT_REF}:${MLA_SLUG}`;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertTarget(): void {
  if (PRIMARY_DOMAIN.includes("REPLACE-ME") || OWNER_EMAIL.includes("REPLACE-ME")) {
    throw new Error(
      "PRIMARY_DOMAIN and OWNER_EMAIL are placeholders awaiting Christian's " +
        "real choices; refusing to provision with placeholder identity.",
    );
  }
  if (process.argv[2] !== CONFIRMATION) {
    throw new Error(`Confirmation must equal ${CONFIRMATION}`);
  }
  if (required("ONZIO_ENVIRONMENT") !== "staging") {
    throw new Error("ONZIO_ENVIRONMENT must equal staging");
  }
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  if (url.protocol !== "https:" || url.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
    throw new Error("Refusing to provision against an unexpected Supabase project");
  }
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey.startsWith("eyJ") && !serviceKey.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY has an unsupported format");
  }
}

async function publishPresentationTriple(input: {
  clubId: string;
  ownerUserId: string;
}): Promise<{
  documentId: string;
  publicationId: string;
  configurationDigest: string;
}> {
  // Validated at surface "production" before any write -- an invalid
  // published document would not error at render time, it would silently
  // degrade the tenant to presentationTemplateKey null (see the shared
  // module's doc comment).
  const { configuration, configurationDigest } =
    buildMlaPathwayPresentationConfiguration({
      createdBy: input.ownerUserId,
      createdAt: new Date().toISOString(),
    });

  const onzio = createClient(EXPECTED_URL, required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  }).schema("onzio");

  const documentId = randomUUID();
  const publicationId = randomUUID();

  const documentInsert = await onzio.from("presentation_documents").insert({
    id: documentId,
    club_id: input.clubId,
    version: 1,
    schema_version: 1,
    template_id: "pathway",
    template_version: 1,
    configuration,
    configuration_digest: configurationDigest,
    created_by: input.ownerUserId,
  });
  if (documentInsert.error) {
    throw new Error(`presentation_documents insert failed: ${documentInsert.error.message}`);
  }

  const stateUpsert = await onzio.from("presentation_state").upsert(
    {
      club_id: input.clubId,
      draft_document_id: null,
      published_document_id: documentId,
      updated_by: input.ownerUserId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "club_id" },
  );
  if (stateUpsert.error) {
    throw new Error(`presentation_state upsert failed: ${stateUpsert.error.message}`);
  }

  const publicationInsert = await onzio.from("presentation_publications").insert({
    id: publicationId,
    club_id: input.clubId,
    action: "publish",
    previous_document_id: null,
    next_document_id: documentId,
    next_configuration_digest: configurationDigest,
    validation_result: { valid: true, errors: [], warnings: [] },
    override_reason: null,
    created_by: input.ownerUserId,
  });
  if (publicationInsert.error) {
    throw new Error(
      `presentation_publications insert failed: ${publicationInsert.error.message}`,
    );
  }

  return { documentId, publicationId, configurationDigest };
}

async function main() {
  process.stderr.write(`${JSON.stringify({ stage: "runner_started" })}\n`);
  assertTarget();
  process.stderr.write(`${JSON.stringify({ stage: "target_verified" })}\n`);
  const operatorAccessToken = await acquireOperatorAccessToken();
  process.stderr.write(`${JSON.stringify({ stage: "operator_authorized" })}\n`);

  const result = await provisionClub({
    slug: MLA_SLUG,
    name: MLA_NAME,
    primaryDomain: PRIMARY_DOMAIN,
    kind: "test",
    ownerEmail: OWNER_EMAIL,
    ...(EXISTING_OWNER_AUTH_USER_ID
      ? { existingAuthUserId: EXISTING_OWNER_AUTH_USER_ID }
      : {}),
    operatorAccessToken,
    environment: "staging",
  });
  process.stderr.write(`${JSON.stringify({ stage: "club_provisioned" })}\n`);

  const presentation = await publishPresentationTriple({
    clubId: result.club.id,
    ownerUserId: (result.owner as { userId: string }).userId,
  });
  process.stderr.write(`${JSON.stringify({ stage: "presentation_published" })}\n`);

  process.stdout.write(
    JSON.stringify({
      projectRef: EXPECTED_PROJECT_REF,
      club: result.club,
      domain: result.domain,
      owner: {
        email: OWNER_EMAIL,
        role: (result.owner as { role: string }).role,
        authUserCreated: (result.owner as { authUserCreated: boolean })
          .authUserCreated,
        codeSent: (result.owner as { codeSent: boolean }).codeSent,
      },
      presentation: { ...presentation, templateKey: "pathway@1" },
      public: result.public,
      committed: result.committed,
    }) + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      projectRef: EXPECTED_PROJECT_REF,
      slug: MLA_SLUG,
    }) + "\n",
  );
  process.exitCode = 1;
});
