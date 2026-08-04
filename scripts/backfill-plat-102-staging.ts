import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const EXPECTED_URL = `https://${PROJECT_REF}.supabase.co`;
const DIVERSE_CITY_PRICE = "price_1U0Y0sK6WajTkwHYnnttR9nN";
const EXPECTED = {
  "diverse-city": { kind: "customer", stripePriceId: DIVERSE_CITY_PRICE },
  alpha: { kind: "test", stripePriceId: null },
  bravo: { kind: "test", stripePriceId: null },
} as const;
const EXPECTED_ABSENT = "rose-city";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertApprovalArguments(): void {
  const args = new Set(process.argv.slice(2));
  if (!args.has("--execute") || !args.has(`--confirm-project=${PROJECT_REF}`)) {
    throw new Error(
      `Refusing staging backfill without --execute --confirm-project=${PROJECT_REF}`,
    );
  }
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  assertApprovalArguments();
  const configuredUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  if (configuredUrl !== EXPECTED_URL) {
    throw new Error(`Refusing PLAT-102 backfill outside ${PROJECT_REF}`);
  }
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey.startsWith("eyJ") && !serviceKey.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY has an unsupported format");
  }

  const onzio = createClient(configuredUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).schema("onzio");
  const slugs = Object.keys(EXPECTED);
  const scopedSlugs = [...slugs, EXPECTED_ABSENT];
  const { data: clubs, error } = await onzio
    .from("clubs")
    .select("id,slug,kind,stripe_price_id")
    .in("slug", scopedSlugs);
  if (error) throw error;
  if (
    !clubs ||
    clubs.length !== slugs.length ||
    clubs.some((club) => club.slug === EXPECTED_ABSENT) ||
    slugs.some((slug) => !clubs.some((club) => club.slug === slug))
  ) {
    throw new Error(
      "Expected exactly Alpha, Bravo, and Diverse City with Rose City absent",
    );
  }

  let clubUpdates = 0;
  let auditInserts = 0;
  for (const club of clubs) {
    const desired = EXPECTED[club.slug as keyof typeof EXPECTED];
    if (!desired) throw new Error("Unexpected club in PLAT-102 backfill scope");
    const patch: Record<string, string | null> = {};
    if (club.kind !== desired.kind) patch.kind = desired.kind;
    if (club.stripe_price_id !== desired.stripePriceId) {
      patch.stripe_price_id = desired.stripePriceId;
    }
    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await onzio
        .from("clubs")
        .update(patch)
        .eq("id", club.id);
      if (updateError) throw updateError;
      clubUpdates += 1;
    }

    const payload = {
      kind: desired.kind,
      stripe_price_configured: club.slug === "diverse-city",
    };
    const { data: existingAudit, error: auditReadError } = await onzio
      .from("audit_events")
      .select("id")
      .eq("club_id", club.id)
      .eq("operation", "plat_102.billing_backfill")
      .contains("payload", payload)
      .maybeSingle();
    if (auditReadError) throw auditReadError;
    if (!existingAudit) {
      const { error: auditError } = await onzio.from("audit_events").insert({
        club_id: club.id,
        actor_type: "migration",
        operation: "plat_102.billing_backfill",
        resource_type: "club",
        resource_id: club.id,
        payload,
      });
      if (auditError) throw auditError;
      auditInserts += 1;
    }
  }

  const { data: reconciled, error: reconcileError } = await onzio
    .from("clubs")
    .select("slug,kind,stripe_price_id")
    .in("slug", scopedSlugs);
  if (reconcileError) throw reconcileError;
  if (
    reconciled?.length !== slugs.length ||
    reconciled.some((club) => club.slug === EXPECTED_ABSENT)
  ) {
    throw new Error("PLAT-102 staging club-set reconciliation failed");
  }
  for (const club of reconciled ?? []) {
    const desired = EXPECTED[club.slug as keyof typeof EXPECTED];
    if (
      !desired ||
      club.kind !== desired.kind ||
      club.stripe_price_id !== desired.stripePriceId
    ) {
      throw new Error("PLAT-102 staging reconciliation failed");
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      event: "plat_102.staging_backfill",
      projectRef: PROJECT_REF,
      clubsReconciled: reconciled?.length ?? 0,
      expectedAbsent: EXPECTED_ABSENT,
      clubUpdates,
      auditInserts,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `PLAT-102 staging backfill failed: ${
      error instanceof Error ? error.message : "unknown error"
    }\n`,
  );
  process.exitCode = 1;
});
